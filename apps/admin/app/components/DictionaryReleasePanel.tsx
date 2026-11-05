'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithStepUp, readCsrfToken, stepUpRefusal } from './step-up-reauth';

type Release = {
  file: string;
  builtAt: string;
  at: string;
  entries: number;
  added: number;
  changed: number;
  deleted: number;
  kind: 'publish' | 'rollback' | 'initial';
};
type Check = { name: string; ok: boolean; detail?: string };
type Status = { current: Release | null; history: Release[]; pending: number };

const checkLabels: Record<string, string> = {
  integrity: 'سلامت فایل',
  entries: 'تعداد واژه‌ها (بدون کاهش ناگهانی)',
  'search-index': 'فهرست جست‌وجو کامل است',
  meanings: 'هر واژه معنی فارسی دارد',
  'search-de': 'جست‌وجوی آلمانی کار می‌کند',
  'search-fa': 'جست‌وجوی فارسی کار می‌کند',
};
const kindLabels = { publish: 'انتشار', rollback: 'برگرداندن', initial: 'نسخهٔ اولیه' } as const;
const fa = (n: number) => n.toLocaleString('fa-IR');
const when = (iso: string) =>
  new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

/** Live release, unpublished changes, and one-click publish / roll back for the public dictionary. */
export function DictionaryReleasePanel() {
  const [status, setStatus] = useState<Status | 'off' | 'error'>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [failed, setFailed] = useState<Check[]>();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dictionary/release', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) return setStatus('off');
      if (!response.ok) throw new Error('unavailable');
      const body = (await response.json()) as Partial<Status>;
      if (!Array.isArray(body.history) || typeof body.pending !== 'number')
        throw new Error('shape');
      setStatus({ current: body.current ?? null, history: body.history, pending: body.pending });
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function act(action: 'publish' | 'rollback') {
    if (
      action === 'rollback' &&
      !window.confirm('سایت به نسخهٔ قبلی دیکشنری برگردد؟ ویرایش‌های پنل حفظ می‌شوند.')
    )
      return;
    setBusy(true);
    setMessage(undefined);
    setFailed(undefined);
    try {
      const { response, stepUp } = await fetchWithStepUp('/api/dictionary/release', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-learnbox-csrf-token': readCsrfToken() ?? '',
        },
        body: JSON.stringify({ action }),
      });
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        report?: {
          checks: Check[];
          added: number;
          changed: number;
          deleted: number;
          skipped: unknown[];
        };
      };
      if (response.status === 422 && body.report) {
        setFailed(body.report.checks.filter((c) => !c.ok));
        throw new Error('نسخهٔ جدید از بررسی‌ها رد شد؛ سایت روی نسخهٔ فعلی ماند.');
      }
      if (body.code === 'busy')
        throw new Error('یک انتشار دیگر در حال انجام است؛ کمی بعد دوباره بزنید.');
      if (body.code === 'no_previous_release')
        throw new Error('نسخهٔ قبلی‌ای برای برگرداندن نیست.');
      if (!response.ok) throw new Error('انجام نشد؛ سایت روی نسخهٔ فعلی ماند.');
      const r = body.report;
      setMessage(
        action === 'publish' && r
          ? `منتشر شد: ${fa(r.added)} واژهٔ تازه، ${fa(r.changed)} ویرایش، ${fa(r.deleted)} حذف` +
              (r.skipped.length ? `؛ ${fa(r.skipped.length)} واژهٔ ناقص کنار گذاشته شد` : '') +
              '. تا ۱۰ ثانیه روی سایت دیده می‌شود.'
          : 'سایت به نسخهٔ قبلی برگشت.',
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  if (status === 'off')
    return (
      <section className="card dictionary-release" aria-label="انتشار دیکشنری">
        <p className="muted">انتشار از پنل در این محیط راه‌اندازی نشده است.</p>
      </section>
    );
  if (status === 'error')
    return (
      <section className="card dictionary-release" aria-label="انتشار دیکشنری">
        <p className="muted">وضعیت انتشار خوانده نشد.</p>
        <button className="btn" type="button" onClick={() => void load()}>
          تلاش دوباره
        </button>
      </section>
    );
  const { current, history, pending } = status;
  const previous = history.find((h) => h.file !== current?.file);
  return (
    <section className="card dictionary-release" aria-label="انتشار دیکشنری">
      <div className="dictionary-release-row">
        <div>
          <strong>نسخهٔ روی سایت:</strong>{' '}
          {current ? (
            <>
              {fa(current.entries)} واژه، از {when(current.at)}
            </>
          ) : (
            'هنوز تنظیم نشده'
          )}
          <div className="muted" aria-live="polite">
            {pending
              ? `${fa(pending)} تغییر از پنل هنوز روی سایت نیست.`
              : 'همهٔ تغییرهای پنل روی سایت است.'}
          </div>
        </div>
        <div className="dictionary-release-actions">
          {previous ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void act('rollback')}
            >
              برگرداندن نسخهٔ قبلی
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            disabled={busy || !current}
            onClick={() => void act('publish')}
          >
            {busy ? 'در حال ساخت و بررسی…' : 'انتشار'}
          </button>
        </div>
      </div>
      {message ? (
        <p className="dictionary-release-message" role="status">
          {message}
        </p>
      ) : null}
      {failed?.length ? (
        <ul className="dictionary-release-checks">
          {failed.map((c) => (
            <li key={c.name}>
              ✗ {checkLabels[c.name] ?? c.name}
              {c.detail ? ` (${c.detail})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {history.length ? (
        <details>
          <summary>تاریخچهٔ انتشار</summary>
          <ul className="dictionary-release-history">
            {history.map((h) => (
              <li key={`${h.file}-${h.at}`}>
                {kindLabels[h.kind]} · {when(h.at)} · {fa(h.entries)} واژه
                {h.kind === 'publish'
                  ? ` (+${fa(h.added)} / ✎${fa(h.changed)} / −${fa(h.deleted)})`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
