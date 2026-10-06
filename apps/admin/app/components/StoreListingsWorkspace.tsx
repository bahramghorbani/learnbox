'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { AdminSidebar } from './AdminSidebar';

/**
 * Phase 2 / Milestone 2.1 — Store workspace («فروشگاه»).
 *
 * The commercial listing surface. Every row is a REAL canonical pack read from
 * `/api/store/listings`; there is no static catalogue and no fabricated price, category or sales
 * number. Sales reporting is deliberately absent: no transaction data exists yet, and inventing it
 * would be worse than omitting it.
 *
 * This screen edits commercial state ONLY. Pack and card content — display name, description,
 * price, category, free/paid, cards, media — is read-only here and is authored exclusively in the
 * Content & Packs workspace, so the Store can never become a second source of truth for content.
 */

type ServerListing = {
  packId: string;
  packDisplayName: string;
  packStatus: string;
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  listing?: {
    storeStatus: 'unlisted' | 'listed';
    featured: boolean;
    displayOrder: number;
    coverObjectKey: string | null;
    commercialSummary: string | null;
    listedAt: string | null;
  };
};

type Draft = {
  storeStatus: 'unlisted' | 'listed';
  featured: boolean;
  displayOrder: string;
  coverObjectKey: string;
  commercialSummary: string;
};

type Phase = 'loading' | 'ready' | 'disabled' | 'unauthorized' | 'error';

function readBrowserCookie(name: string): string | undefined {
  return document.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function createClientKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = Math.floor(Math.random() * 16);
    const value = part === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function draftFrom(row: ServerListing): Draft {
  return {
    storeStatus: row.listing?.storeStatus ?? 'unlisted',
    featured: row.listing?.featured ?? false,
    displayOrder: String(row.listing?.displayOrder ?? 0),
    coverObjectKey: row.listing?.coverObjectKey ?? '',
    commercialSummary: row.listing?.commercialSummary ?? '',
  };
}

function priceLabel(row: ServerListing): string {
  if (row.isFree) return 'رایگان';
  if (row.priceTomans === null) return 'قیمت ثبت نشده';
  return `${row.priceTomans.toLocaleString('fa-IR')} تومان`;
}

/**
 * Sends one commercial change. `expectedStoreStatus` carries the state the operator saw, so two
 * operators editing the same pack produce a 409 instead of silently overwriting each other.
 */
async function saveListing(
  draft: Draft,
  row: ServerListing,
): Promise<{ ok: true; listing: ServerListing } | { ok: false; message: string }> {
  const csrfToken = readBrowserCookie('__Host-learnbox_admin_csrf');
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  const displayOrder = Number(draft.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    return { ok: false, message: 'ترتیب نمایش باید یک عدد صحیح و نامنفی باشد.' };
  }
  try {
    const response = await fetch('/api/store/listings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-learnbox-csrf-token': csrfToken,
        'idempotency-key': createClientKey(),
      },
      body: JSON.stringify({
        packId: row.packId,
        storeStatus: draft.storeStatus,
        featured: draft.featured,
        displayOrder,
        coverObjectKey: draft.coverObjectKey.trim() || null,
        commercialSummary: draft.commercialSummary.trim() || null,
        expectedStoreStatus: row.listing?.storeStatus ?? 'absent',
      }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { listing: ServerListing };
      return { ok: true, listing: payload.listing };
    }
    if (response.status === 401)
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    if (response.status === 428) {
      return { ok: false, message: 'احراز هویت مجدد لازم است؛ دوباره وارد شوید.' };
    }
    if (response.status === 409) {
      return {
        ok: false,
        message: 'وضعیت فروشگاهی این بسته توسط کاربر دیگری تغییر کرده است؛ صفحه را تازه کنید.',
      };
    }
    if (response.status === 404) {
      return { ok: false, message: 'نقش شما اجازهٔ تغییر وضعیت فروشگاه را ندارد.' };
    }
    return { ok: false, message: 'ذخیرهٔ وضعیت فروشگاه با خطا روبه‌رو شد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

export function StoreListingsWorkspace() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [rows, setRows] = useState<ServerListing[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingPackId, setSavingPackId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const response = await fetch('/api/store/listings', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (response.status === 404) {
        setPhase('disabled');
        return;
      }
      if (response.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!response.ok) {
        setPhase('error');
        return;
      }
      const payload = (await response.json()) as { listings: ServerListing[] };
      setRows(payload.listings);
      setDrafts(Object.fromEntries(payload.listings.map((row) => [row.packId, draftFrom(row)])));
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (packId: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [packId]: { ...current[packId], ...patch } }));
  };

  const submit = async (row: ServerListing) => {
    const draft = drafts[row.packId];
    if (!draft) return;
    setSavingPackId(row.packId);
    setError(undefined);
    setNotice(undefined);
    const result = await saveListing(draft, row);
    setSavingPackId(undefined);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRows((current) =>
      current.map((item) => (item.packId === row.packId ? result.listing : item)),
    );
    setDrafts((current) => ({ ...current, [row.packId]: draftFrom(result.listing) }));
    setNotice(
      result.listing.listing?.storeStatus === 'listed'
        ? `«${result.listing.packDisplayName}» در فروشگاه فهرست شد.`
        : `«${result.listing.packDisplayName}» از فروشگاه برداشته شد.`,
    );
  };

  return (
    <main className="admin-shell cp-workspace" id="store">
      <AdminSidebar current="store" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>فروشگاه</h1>
            <p className="muted">
              وضعیت تجاری بسته‌های کانونی LearnBox. محتوای بسته و کارت‌ها فقط در «محتوا و بسته‌ها»
              ویرایش می‌شود.
            </p>
          </div>
        </div>

        {notice ? (
          <div className="notice" role="status" aria-live="polite" data-store-state="saved">
            <span>{notice}</span>
            <button className="btn" type="button" onClick={() => setNotice(undefined)}>
              بستن
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="notice" role="alert" data-store-state="error">
            <span>{error}</span>
            <button className="btn" type="button" onClick={() => setError(undefined)}>
              بستن
            </button>
          </div>
        ) : null}

        {phase === 'disabled' ? (
          <div className="notice" role="status" data-store-state="disabled">
            <span>نمای «فروشگاه» در این محیط غیرفعال است؛ هیچ دادهٔ تجاری خوانده نمی‌شود.</span>
          </div>
        ) : null}

        {phase === 'unauthorized' ? (
          <div className="notice" role="status" data-store-state="unauthorized">
            <span>برای دیدن فروشگاه باید با گذرکلید وارد شوید.</span>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="notice" role="alert" data-store-state="unavailable">
            <span>خواندن وضعیت فروشگاه ممکن نشد.</span>
            <button className="btn" type="button" onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : null}

        {phase === 'loading' ? (
          <p className="muted" data-store-state="loading">
            در حال خواندن…
          </p>
        ) : null}

        {phase === 'ready' && rows.length === 0 ? (
          <p className="muted" data-store-state="empty">
            هیچ بستهٔ کانونی وجود ندارد. ابتدا در «محتوا و بسته‌ها» یک بسته بسازید.
          </p>
        ) : null}

        {phase === 'ready' && rows.length > 0 ? (
          <table className="data-table" data-store-table="listings">
            <thead>
              <tr>
                <th scope="col">بسته</th>
                <th scope="col">وضعیت محتوا</th>
                <th scope="col">دسته / قیمت</th>
                <th scope="col">وضعیت فروشگاه</th>
                <th scope="col">ویژه</th>
                <th scope="col">ترتیب</th>
                <th scope="col">کلید کاور</th>
                <th scope="col">توضیح تجاری</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.packId];
                if (!draft) return null;
                const busy = savingPackId === row.packId;
                return (
                  <tr key={row.packId} data-store-pack={row.packId}>
                    <th scope="row">
                      {row.packDisplayName}
                      <span className="muted"> ({row.packId})</span>
                    </th>
                    {/* Canonical content state, read-only here. */}
                    <td data-store-pack-status={row.packStatus}>{row.packStatus}</td>
                    <td className="muted">
                      {row.category ?? 'بدون دسته'} — {priceLabel(row)}
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`store-status-${row.packId}`}>
                        وضعیت فروشگاه {row.packDisplayName}
                      </label>
                      <select
                        id={`store-status-${row.packId}`}
                        disabled={busy}
                        value={draft.storeStatus}
                        onChange={(event) =>
                          update(row.packId, {
                            storeStatus: event.target.value as Draft['storeStatus'],
                          })
                        }
                      >
                        <option value="unlisted">فهرست نشده</option>
                        <option value="listed">فهرست شده</option>
                      </select>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`store-featured-${row.packId}`}>
                        ویژه {row.packDisplayName}
                      </label>
                      <input
                        id={`store-featured-${row.packId}`}
                        type="checkbox"
                        disabled={busy}
                        checked={draft.featured}
                        onChange={(event) => update(row.packId, { featured: event.target.checked })}
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`store-order-${row.packId}`}>
                        ترتیب نمایش {row.packDisplayName}
                      </label>
                      <input
                        id={`store-order-${row.packId}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={busy}
                        value={draft.displayOrder}
                        onChange={(event) =>
                          update(row.packId, { displayOrder: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`store-cover-${row.packId}`}>
                        کلید کاور {row.packDisplayName}
                      </label>
                      <input
                        id={`store-cover-${row.packId}`}
                        type="text"
                        disabled={busy}
                        value={draft.coverObjectKey}
                        onChange={(event) =>
                          update(row.packId, { coverObjectKey: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`store-summary-${row.packId}`}>
                        توضیح تجاری {row.packDisplayName}
                      </label>
                      <textarea
                        id={`store-summary-${row.packId}`}
                        rows={2}
                        disabled={busy}
                        value={draft.commercialSummary}
                        onChange={(event) =>
                          update(row.packId, { commercialSummary: event.target.value })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn primary"
                        type="button"
                        disabled={busy}
                        onClick={() => void submit(row)}
                      >
                        {busy ? 'در حال ذخیره…' : 'ذخیره'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
