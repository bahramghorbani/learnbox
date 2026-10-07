'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';

/**
 * Phase 3 / Milestone 3.3 — the administrative Audit Log («عملیات»).
 *
 * A read-only operational viewer over the canonical `audit_logs` trail, not an analytics screen:
 * every row is one real administrative action recorded by the write path that performed it. There
 * are no charts, no aggregates and no export — a reviewer needs to answer "who did this, when, to
 * what, and why", and anything beyond that invites reading the trail as a report instead of as
 * evidence.
 *
 * Nothing here can change a record. The screen has no edit control because the API has no write
 * verb and the store issues nothing but SELECT; the read-only notice states a property enforced
 * three layers down, not a UI convention.
 *
 * Filtering and paging are entirely server-side. The browser never holds the whole trail, so what
 * an operator sees is always a bounded answer the server authorised and computed.
 */

type AuditDetail = { key: string; value: string; redacted: boolean };

type AuditEntry = {
  id: string;
  createdAt: string;
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  details: AuditDetail[];
};

type AuditPage = {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
  actions: string[];
  entityTypes: string[];
  actors: { id: string; label: string }[];
};

type Filters = {
  action: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
};

const emptyFilters: Filters = {
  action: '',
  actorUserId: '',
  entityType: '',
  entityId: '',
  from: '',
  to: '',
};

type Phase = 'loading' | 'ready' | 'unavailable' | 'unauthorized' | 'invalid' | 'error';

const PAGE_SIZE = 25;

const timestampFormat = new Intl.DateTimeFormat('fa-IR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : timestampFormat.format(parsed);
}

/** A picked end date means "through that day", so the exclusive upper bound is the next midnight. */
function endOfDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + 1);
  return parsed.toISOString();
}

function startOfDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toISOString();
}

function buildQuery(filters: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.entityId) params.set('entityId', filters.entityId.trim());
  if (filters.from) params.set('from', startOfDay(filters.from));
  if (filters.to) params.set('to', endOfDay(filters.to));
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  return params.toString();
}

export function AuditLogWorkspace() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [page, setPage] = useState<AuditPage | undefined>(undefined);
  /** Applied filters drive the request; the form holds the operator's unsubmitted edits. */
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (filters: Filters, nextOffset: number) => {
    setPhase('loading');
    try {
      const response = await fetch(`/api/support/audit?${buildQuery(filters, nextOffset)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        setPhase('unavailable');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (response.status === 400) {
        setPhase('invalid');
        return;
      }
      if (!response.ok) {
        setPhase('error');
        return;
      }
      setPage((await response.json()) as AuditPage);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load(applied, offset);
  }, [load, applied, offset]);

  const total = page?.total ?? 0;
  const shownFrom = total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + (page?.entries.length ?? 0), total);

  return (
    <main className="admin-shell cp-workspace" id="audit">
      <AdminSidebar current="audit" />
      <section className="admin-workspace">
        <div className="page-head">
          <h2 id="audit-title">گزارش اقدامات مدیریتی</h2>
          <p className="muted">
            این گزارش فقط برای مرور است. رکوردهای ثبت‌شده تغییرناپذیرند و از این صفحه قابل ویرایش یا
            حذف نیستند. سیاست نگهداری: حداقل یک سال.
          </p>
        </div>

        <form
          aria-labelledby="audit-filters-title"
          className="audit-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setOffset(0);
            setApplied(draft);
          }}
        >
          <h3 className="audit-filters-title" id="audit-filters-title">
            فیلترها
          </h3>
          <div className="audit-filter-grid">
            <label htmlFor="audit-action">
              اقدام
              <select
                id="audit-action"
                onChange={(event) => setDraft({ ...draft, action: event.target.value })}
                value={draft.action}
              >
                <option value="">همه</option>
                {(page?.actions ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="audit-actor">
              اپراتور
              <select
                id="audit-actor"
                onChange={(event) => setDraft({ ...draft, actorUserId: event.target.value })}
                value={draft.actorUserId}
              >
                <option value="">همه</option>
                {(page?.actors ?? []).map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="audit-entity-type">
              نوع هدف
              <select
                id="audit-entity-type"
                onChange={(event) => setDraft({ ...draft, entityType: event.target.value })}
                value={draft.entityType}
              >
                <option value="">همه</option>
                {(page?.entityTypes ?? []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="audit-entity-id">
              شناسه هدف
              <input
                id="audit-entity-id"
                dir="ltr"
                onChange={(event) => setDraft({ ...draft, entityId: event.target.value })}
                placeholder="UUID"
                type="text"
                value={draft.entityId}
              />
            </label>
            <label htmlFor="audit-from">
              از تاریخ
              <input
                id="audit-from"
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                type="date"
                value={draft.from}
              />
            </label>
            <label htmlFor="audit-to">
              تا تاریخ
              <input
                id="audit-to"
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                type="date"
                value={draft.to}
              />
            </label>
          </div>
          <div className="audit-filter-actions">
            <button className="btn primary" type="submit">
              اعمال فیلترها
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(emptyFilters);
                setOffset(0);
                setApplied(emptyFilters);
              }}
              type="button"
            >
              پاک کردن فیلترها
            </button>
          </div>
        </form>

        {phase === 'unavailable' && (
          <div className="notice" data-audit-state="unavailable" role="status">
            این بخش در این محیط فعال نیست یا دسترسی شما به آن تأیید نشده است.
          </div>
        )}
        {phase === 'unauthorized' && (
          <div className="notice" data-audit-state="unauthorized" role="status">
            برای مشاهده گزارش باید با حساب مدیر وارد شوید.
          </div>
        )}
        {phase === 'invalid' && (
          <div className="notice" data-audit-state="invalid" role="alert">
            فیلترهای انتخاب‌شده معتبر نیستند. بازه تاریخ و شناسه هدف را بررسی کنید.
          </div>
        )}
        {phase === 'error' && (
          <div className="notice" data-audit-state="error" role="alert">
            خواندن گزارش ممکن نشد.{' '}
            <button className="btn sm" onClick={() => void load(applied, offset)} type="button">
              تلاش دوباره
            </button>
          </div>
        )}
        {phase === 'loading' && (
          <p className="muted" data-audit-state="loading">
            در حال خواندن گزارش…
          </p>
        )}

        {phase === 'ready' && total === 0 && (
          <p className="muted" data-audit-state="empty">
            هیچ اقدام مدیریتی با این فیلترها ثبت نشده است.
          </p>
        )}

        {phase === 'ready' && total > 0 && (
          <>
            <table aria-labelledby="audit-title" className="audit-table" data-audit-table="entries">
              <thead>
                <tr>
                  <th scope="col">زمان</th>
                  <th scope="col">اپراتور</th>
                  <th scope="col">اقدام</th>
                  <th scope="col">هدف</th>
                  <th scope="col">دلیل</th>
                  <th scope="col">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {page?.entries.map((entry) => (
                  <tr data-audit-entry={entry.id} key={entry.id}>
                    <td>
                      <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                    </td>
                    <td>
                      {entry.actorLabel ?? (
                        <span className="muted">
                          {entry.actorUserId ? `${entry.actorUserId.slice(0, 8)}…` : 'حساب حذف‌شده'}
                        </span>
                      )}
                    </td>
                    <td>
                      <code className="audit-action">{entry.action}</code>
                    </td>
                    <td>
                      <span className="audit-entity-type">{entry.entityType}</span>
                      <br />
                      <code className="muted audit-entity-id">{entry.entityId}</code>
                    </td>
                    <td>{entry.reason ?? <span className="muted">—</span>}</td>
                    <td>
                      {entry.details.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <ul className="audit-details">
                          {entry.details.map((detail) => (
                            <li key={detail.key}>
                              <span className="audit-detail-key">{detail.key}</span>
                              <span className={detail.redacted ? 'muted' : undefined}>
                                {detail.redacted ? 'پنهان‌شده' : detail.value}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="audit-pager">
              <p aria-live="polite" className="muted">
                نمایش {shownFrom} تا {shownTo} از {total} اقدام
              </p>
              <div className="audit-pager-actions">
                <button
                  className="btn sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                  type="button"
                >
                  جدیدتر
                </button>
                <button
                  className="btn sm"
                  disabled={shownTo >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  type="button"
                >
                  قدیمی‌تر
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
