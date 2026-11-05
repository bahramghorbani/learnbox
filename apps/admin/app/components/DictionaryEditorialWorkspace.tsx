'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import {
  createIdempotencyKey,
  fetchWithStepUp,
  readCsrfToken,
  stepUpRefusal,
} from './step-up-reauth';

type Status = 'queued' | 'approved' | 'deleted';
type Entry = {
  id: string;
  dictionaryKey: string;
  aiPayload: Record<string, unknown>;
  manualPayload: Record<string, unknown> | null;
  status: Status;
  revision: number;
  source: string;
  model: string | null;
  updatedAt: string;
};

const labels: Record<Status, string> = {
  queued: 'در صف',
  approved: 'تأییدشده',
  deleted: 'حذف‌شده',
};
const tones: Record<Status, string> = { queued: 'b-amber', approved: 'b-green', deleted: 'b-rose' };

export function DictionaryEditorialWorkspace() {
  const [items, setItems] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'disabled' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dictionary/editorial', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) return setPhase('disabled');
      if (!response.ok) throw new Error('unavailable');
      const result = (await response.json()) as { items?: Entry[] };
      const next = result.items ?? [];
      setItems(next);
      setSelectedId((current) =>
        current && next.some((item) => item.id === current) ? current : next[0]?.id,
      );
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setDraft(selected ? JSON.stringify(selected.manualPayload ?? selected.aiPayload, null, 2) : '');
    setMessage(undefined);
  }, [selected]);

  async function update(
    change: Pick<Entry, 'status'> | { manualPayload: Record<string, unknown> | null },
  ) {
    if (!selected) return;
    setBusy(true);
    setMessage(undefined);
    const init = {
      method: 'PATCH',
      credentials: 'same-origin' as const,
      headers: {
        'content-type': 'application/json',
        'x-learnbox-csrf-token': readCsrfToken() ?? '',
        'idempotency-key': createIdempotencyKey(),
      },
      body: JSON.stringify({ revision: selected.revision, ...change }),
    };
    try {
      const { response, stepUp } = await fetchWithStepUp(
        `/api/dictionary/editorial/${selected.id}`,
        init,
      );
      const refusal = stepUpRefusal(stepUp, response.status);
      if (refusal) throw new Error(refusal);
      if (response.status === 409)
        throw new Error('این رکورد هم‌زمان تغییر کرده است؛ فهرست دوباره خوانده شد.');
      if (!response.ok) throw new Error('ذخیره‌سازی انجام نشد.');
      const result = (await response.json()) as { item: Entry };
      setItems((current) =>
        current.map((item) => (item.id === result.item.id ? result.item : item)),
      );
      setMessage('ذخیره شد.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ذخیره‌سازی انجام نشد.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    try {
      const manualPayload = JSON.parse(draft) as Record<string, unknown>;
      void update(
        selected?.status === 'approved' ? { manualPayload, status: 'queued' } : { manualPayload },
      );
    } catch {
      setMessage('متن ویرایش باید یک شیء JSON معتبر باشد.');
    }
  }

  if (phase === 'loading') return <LoadingState label="در حال خواندن صف واژه‌نامه…" />;
  if (phase === 'disabled')
    return (
      <ErrorState
        tone="grey"
        title="ویرایش واژه‌نامه در این محیط فعال نیست."
        description="این قابلیت به‌طور پیش‌فرض غیرفعال است."
      />
    );
  if (phase === 'error')
    return (
      <ErrorState
        tone="rose"
        title="صف واژه‌نامه خوانده نشد."
        description="بدون دریافت صف، هیچ داده‌ای نمایش داده نمی‌شود."
        action={
          <button className="btn" type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        }
      />
    );

  return (
    <main className="admin-shell cp-workspace" id="dictionary">
      <AdminSidebar current="dictionary" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>واژه‌نامه</h1>
            <p className="muted">
              صف سردبیری فقط برای ورودی‌های هوش مصنوعی؛ واژه‌نامهٔ عمومی فقط‌خواندنی می‌ماند.
            </p>
          </div>
        </div>
        <div className="content-grid">
          <section className="card" aria-label="فهرست واژه‌نامه">
            <div className="card-head">
              <span className="card-title">ورودی‌ها</span>
              <span className="muted">{items.length}</span>
            </div>
            <div className="card-body">
              {items.length === 0 ? (
                <EmptyState title="ورودی‌ای در صف نیست." />
              ) : (
                <div className="list">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="list-row dictionary-entry"
                      data-dictionary-entry={item.id}
                      aria-pressed={item.id === selectedId}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="list-grow">
                        <div className="list-title" dir="ltr">
                          {item.dictionaryKey}
                        </div>
                        <div className="list-sub">
                          {item.source}
                          {item.model ? ` · ${item.model}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${tones[item.status]}`}>{labels[item.status]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section className="card" aria-label="ویرایش واژه‌نامه">
            {selected ? (
              <>
                <div className="card-head">
                  <div>
                    <span className="card-title" dir="ltr">
                      {selected.dictionaryKey}
                    </span>
                    <div className="list-sub">
                      نسخه {selected.revision} ·{' '}
                      {new Date(selected.updatedAt).toLocaleString('fa-IR')}
                    </div>
                  </div>
                  <span className={`badge ${tones[selected.status]}`}>
                    {labels[selected.status]}
                  </span>
                </div>
                <div className="card-body">
                  <label className="field-label" htmlFor="dictionary-payload">
                    پاسخ مؤثر (ویرایش دستی)
                  </label>
                  <textarea
                    id="dictionary-payload"
                    className="dictionary-payload"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={busy || selected.status === 'deleted'}
                    spellCheck={false}
                    dir="ltr"
                  />
                  {message ? (
                    <p role="status" className="hint">
                      {message}
                    </p>
                  ) : null}
                  <div className="head-actions">
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || selected.status === 'deleted'}
                      onClick={save}
                    >
                      ذخیرهٔ ویرایش
                    </button>
                    <button
                      className="btn primary"
                      type="button"
                      disabled={busy || selected.status !== 'queued'}
                      onClick={() => void update({ status: 'approved' })}
                    >
                      تأیید
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      disabled={busy || selected.status === 'deleted'}
                      onClick={() => void update({ status: 'deleted' })}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="card-body">
                <EmptyState title="یک ورودی را انتخاب کنید." />
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
