'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { CpModal } from './AdminModal';
import { AdminSidebar } from './AdminSidebar';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { PaymentOperationsPanel } from './PaymentOperationsPanel';
import { faNum } from './fa-digits';
import {
  createIdempotencyKey,
  fetchWithStepUp,
  readCsrfToken,
  stepUpRefusal,
} from './step-up-reauth';

/**
 * Phase 2 / Milestone 2.1 — Store workspace («فروشگاه»), on the approved vocabulary since Stage 6.
 *
 * Every row is a REAL canonical pack read from `/api/store/listings`; there is no static catalogue
 * and no fabricated price, sales count or revenue figure. The reference screen shows «درآمد این
 * ماه», «میانگین سبد» and a per-pack «فروش» column over mock data and says so in its own banner.
 * None of those three has a backend aggregate, and deriving them from the rows on screen would
 * print a number that silently means "among the packs currently loaded" — so they are stated as
 * unavailable rather than invented. The KPI row carries the four counts that ARE canonical.
 *
 * This screen edits commercial state ONLY. Pack and card content — display name, description,
 * price, category, free/paid, cards, media — is read-only here and authored exclusively in the
 * Content & Packs workspace, so the Store can never become a second source of truth for content.
 * Price is deliberately NOT editable anywhere on this screen: base-price immutability and the
 * paid→free prohibition are business rules, not UI preferences, and the reference's price/discount
 * editor would have broken both.
 *
 * Stage 6 also ends the HTTP 428 dead end here (LB-B40): a commercial save refused for stale
 * authentication now raises one inline passkey step-up and retries once with the identical body
 * and idempotency key, with the dialog and every typed value left intact.
 */

type SalesReportPackRow = {
  packId: string;
  packDisplayName: string;
  verifiedCount: number;
  revenueTomans: number;
};

type SalesReport = {
  from: string | null;
  to: string | null;
  verifiedCount: number;
  revenueTomans: number;
  pendingCount: number;
  failedCount: number;
  packs: SalesReportPackRow[];
  byProvider: Array<{ provider: string; verifiedCount: number; revenueTomans: number }>;
  byChannel: Array<{ channel: string; verifiedCount: number; revenueTomans: number }>;
};

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
  commercialSummary: string;
};

type Phase = 'loading' | 'ready' | 'disabled' | 'unauthorized' | 'error';
type CoverCandidate = {
  id: string;
  status: 'ready' | 'accepted';
  source: 'upload' | 'ai';
  mediaType: string;
  createdAt: string;
};

function draftFrom(row: ServerListing): Draft {
  return {
    storeStatus: row.listing?.storeStatus ?? 'unlisted',
    featured: row.listing?.featured ?? false,
    displayOrder: String(row.listing?.displayOrder ?? 0),
    commercialSummary: row.listing?.commercialSummary ?? '',
  };
}

function priceLabel(row: ServerListing): string {
  if (row.isFree) return 'رایگان';
  if (row.priceTomans === null) return 'قیمت ثبت نشده';
  return `${faNum(row.priceTomans)} تومان`;
}

const packStatusLabels: Record<string, string> = {
  draft: 'پیش‌نویس',
  in_review: 'در بررسی',
  approved: 'تأییدشده',
  published: 'منتشرشده',
  archived: 'بایگانی',
};

const providerLabels: Record<string, string> = {
  zarinpal: 'زرین‌پال',
  myket: 'مایکت',
  cafe_bazaar: 'کافه‌بازار',
  direct_web: 'وب مستقیم',
  google_play: 'گوگل‌پلی',
  app_store: 'اپ‌استور',
};

const channelLabels: Record<string, string> = {
  web_zarinpal: 'وب / زرین‌پال',
  android_myket: 'اندروید / مایکت',
  android_bazaar: 'اندروید / کافه‌بازار',
  legacy: 'ثبت قدیمی',
};

/**
 * Sends one commercial change. `expectedStoreStatus` carries the state the operator saw, so two
 * operators editing the same pack produce a 409 instead of silently overwriting each other.
 *
 * `init` is built once and handed to `fetchWithStepUp`, which reuses it verbatim for its single
 * retry: same body, same idempotency key, so a listing the server already updated cannot be
 * written twice.
 */
async function saveListing(
  draft: Draft,
  row: ServerListing,
): Promise<{ ok: true; listing: ServerListing } | { ok: false; message: string }> {
  const csrfToken = readCsrfToken();
  if (!csrfToken) {
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  }
  const displayOrder = Number(draft.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    return { ok: false, message: 'ترتیب نمایش باید یک عدد صحیح و نامنفی باشد.' };
  }
  const init: RequestInit = {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': createIdempotencyKey(),
    },
    body: JSON.stringify({
      packId: row.packId,
      storeStatus: draft.storeStatus,
      featured: draft.featured,
      displayOrder,
      commercialSummary: draft.commercialSummary.trim() || null,
      expectedStoreStatus: row.listing?.storeStatus ?? 'absent',
    }),
  };
  try {
    const { response, stepUp } = await fetchWithStepUp('/api/store/listings', init);
    if (response.ok) {
      const payload = (await response.json()) as { listing: ServerListing };
      return { ok: true, listing: payload.listing };
    }
    const refused = stepUpRefusal(stepUp, response.status);
    if (refused) return { ok: false, message: refused };
    if (response.status === 401)
      return { ok: false, message: 'نشست معتبر نیست؛ دوباره وارد شوید.' };
    if (response.status === 409) {
      return {
        ok: false,
        message: 'وضعیت فروشگاهی این بسته توسط کاربر دیگری تغییر کرده است؛ صفحه را تازه کنید.',
      };
    }
    if (response.status === 400) {
      return { ok: false, message: 'مقادیر واردشده پذیرفته نشد؛ آن‌ها را بازبینی کنید.' };
    }
    if (response.status === 404) {
      return { ok: false, message: 'نقش شما اجازهٔ تغییر وضعیت فروشگاه را ندارد.' };
    }
    return { ok: false, message: 'ذخیرهٔ وضعیت فروشگاه با خطا روبه‌رو شد.' };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

async function syncMyket(
  row: ServerListing,
): Promise<{ ok: true; skuId: string; created: boolean } | { ok: false; message: string }> {
  const csrfToken = readCsrfToken();
  if (!csrfToken)
    return { ok: false, message: 'نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.' };
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': createIdempotencyKey(),
    },
    body: JSON.stringify({ packId: row.packId }),
  };
  try {
    const { response, stepUp } = await fetchWithStepUp('/api/store/myket/sync', init);
    if (response.ok) {
      const body = (await response.json()) as { status: 'created' | 'updated'; skuId: string };
      return { ok: true, skuId: body.skuId, created: body.status === 'created' };
    }
    const refused = stepUpRefusal(stepUp, response.status);
    if (refused) return { ok: false, message: refused };
    if (response.status === 404)
      return { ok: false, message: 'همگام‌سازی مایکت در این محیط فعال یا مجاز نیست.' };
    if (response.status === 409)
      return { ok: false, message: 'فقط بستهٔ پولی، منتشرشده و فهرست‌شده قابل همگام‌سازی است.' };
    return {
      ok: false,
      message: 'همگام‌سازی مایکت انجام نشد؛ بدون تغییر در وضعیت فروشگاه دوباره تلاش کنید.',
    };
  } catch {
    return { ok: false, message: 'ارتباط با سرور برقرار نشد.' };
  }
}

export function StoreListingsWorkspace() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [rows, setRows] = useState<ServerListing[]>([]);
  const [editing, setEditing] = useState<ServerListing | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [syncingPackId, setSyncingPackId] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[]>([]);
  const [coverBusy, setCoverBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPhase, setReportPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [report, setReport] = useState<SalesReport | undefined>(undefined);
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

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
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReport = useCallback(async (from: string, to: string) => {
    setReportPhase('loading');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`/api/store/sales-report?${params.toString()}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        setReportPhase('error');
        return;
      }
      const payload = (await response.json()) as { report: SalesReport };
      setReport({
        ...payload.report,
        byProvider: payload.report.byProvider ?? [],
        byChannel: payload.report.byChannel ?? [],
      });
      setReportPhase('ready');
    } catch {
      setReportPhase('error');
    }
  }, []);

  function openReport() {
    setReportOpen(true);
    void loadReport(reportFrom, reportTo);
  }

  function openEditor(row: ServerListing) {
    setEditing(row);
    setDraft(draftFrom(row));
    setCoverCandidates([]);
    void fetch(`/api/store/covers?packId=${encodeURIComponent(row.packId)}`, {
      credentials: 'same-origin',
    })
      .then((response) => (response.ok ? response.json() : { candidates: [] }))
      .then((body: { candidates: CoverCandidate[] }) => setCoverCandidates(body.candidates));
    setFormError(undefined);
    setNotice(undefined);
  }

  function closeEditor() {
    setEditing(undefined);
    setDraft(undefined);
    setFormError(undefined);
  }

  function update(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function coverAction(
    action: 'generate' | 'accept' | 'upload',
    candidateId?: string,
    file?: File,
  ) {
    if (!editing) return;
    const csrf = readCsrfToken();
    if (!csrf) return setFormError('نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.');
    setCoverBusy(true);
    const body =
      action === 'upload' && file
        ? (() => {
            const data = new FormData();
            data.set('action', action);
            data.set('packId', editing.packId);
            data.set('file', file);
            return data;
          })()
        : JSON.stringify({ action, packId: editing.packId, candidateId });
    const { response } = await fetchWithStepUp('/api/store/covers', {
      method: 'POST',
      credentials: 'same-origin',
      headers:
        body instanceof FormData
          ? { 'x-learnbox-csrf-token': csrf }
          : { 'content-type': 'application/json', 'x-learnbox-csrf-token': csrf },
      body,
    });
    setCoverBusy(false);
    if (!response.ok) return setFormError('عملیات کاور انجام نشد.');
    if (action === 'accept') {
      closeEditor();
      await load();
      return;
    }
    const state = await fetch(`/api/store/covers?packId=${encodeURIComponent(editing.packId)}`, {
      credentials: 'same-origin',
    });
    if (state.ok) setCoverCandidates((await state.json()).candidates);
  }

  async function submit() {
    if (!editing || !draft) return;
    setSaving(true);
    setFormError(undefined);
    const result = await saveListing(draft, editing);
    setSaving(false);
    if (!result.ok) {
      // The dialog stays open with every typed value, which is the whole point of the inline
      // step-up: a refused save must never cost the operator their input.
      setFormError(result.message);
      return;
    }
    setRows((current) =>
      current.map((item) => (item.packId === result.listing.packId ? result.listing : item)),
    );
    setNotice(
      result.listing.listing?.storeStatus === 'listed'
        ? `«${result.listing.packDisplayName}» در فروشگاه فهرست شد.`
        : `«${result.listing.packDisplayName}» از فروشگاه برداشته شد.`,
    );
    closeEditor();
  }

  async function syncRowToMyket(row: ServerListing) {
    setSyncingPackId(row.packId);
    const result = await syncMyket(row);
    setSyncingPackId(undefined);
    setNotice(
      result.ok
        ? `SKU مایکت برای «${row.packDisplayName}» ${result.created ? 'ساخته' : 'همگام'} شد (${result.skuId})؛ وضعیت فعال‌بودن خرید تغییر نکرد.`
        : result.message,
    );
  }

  const paidCount = rows.filter((row) => !row.isFree).length;
  const listedCount = rows.filter((row) => row.listing?.storeStatus === 'listed').length;
  const featuredCount = rows.filter((row) => row.listing?.featured).length;
  const pricelessPaidCount = rows.filter((row) => !row.isFree && row.priceTomans === null).length;

  return (
    <main className="admin-shell cp-workspace" id="store">
      <AdminSidebar current="store" />
      <section className="admin-workspace">
        <div className="page-head">
          <div>
            <h1>فروشگاه</h1>
            <p className="muted">
              وضعیت تجاری بسته‌های کانونی LearnBox و تراکنش‌های واقعی خرید. محتوای بسته، قیمت و
              رایگان/پولی فقط در «محتوا و بسته‌ها» ویرایش می‌شود.
            </p>
          </div>
          <div className="head-actions">
            <button type="button" className="btn" onClick={openReport}>
              گزارش فروش
            </button>
          </div>
        </div>

        {notice ? (
          <div className="notice mb" role="status" aria-live="polite" data-store-state="saved">
            <span>{notice}</span>
            <button className="btn" type="button" onClick={() => setNotice(undefined)}>
              بستن
            </button>
          </div>
        ) : null}

        {/* Revenue/sales now come from the real aggregate in the «گزارش فروش» dialog — see
            `getSalesReport` on `purchase_events`. This banner only disclaims what that dialog still
            cannot show (discounts, refunds), so nobody reads a verified-only total as net revenue. */}
        <div className="notice mb" role="note" data-store-state="metrics-gap">
          <span>
            درآمد و شمار فروش واقعی را دکمهٔ «گزارش فروش» نشان می‌دهد (فقط تراکنش‌های verified‌شده).
            شمارنده‌های زیر فقط وضعیت تجاری بسته‌ها را می‌شمارند، نه فروش. تخفیف و بازگشت پول هنوز
            در backend ندارند. وضعیت واقعی درگاه در کارت «درگاه پرداخت» آمده است.
          </span>
        </div>

        {phase === 'disabled' ? (
          <ErrorState
            tone="amber"
            title="نمای «فروشگاه» در این محیط غیرفعال است"
            description="هیچ دادهٔ تجاری خوانده نمی‌شود. این نما با پرچم محیطی فعال می‌شود."
          />
        ) : phase === 'unauthorized' ? (
          <ErrorState
            tone="amber"
            title="برای دیدن فروشگاه باید وارد شوید"
            description="این صفحه با گذرکلید محافظت می‌شود؛ پس از ورود دوباره تلاش کنید."
          />
        ) : phase === 'error' ? (
          <ErrorState
            title="خواندن وضعیت فروشگاه ممکن نشد"
            description="ارتباط با backend مرکزی برقرار نشد یا پاسخ معتبر نبود."
            action={
              <button type="button" className="btn" onClick={() => void load()}>
                تلاش دوباره
              </button>
            }
          />
        ) : phase === 'loading' ? (
          <LoadingState label="در حال خواندن وضعیت فروشگاه…" />
        ) : (
          <>
            <div className="grid-4 mb" aria-label="شمارنده‌های فروشگاه">
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بسته‌های پولی</span>
                </div>
                <div className="kpi-value sm" data-store-kpi="paid-packs">
                  {faNum(paidCount)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">فهرست‌شده در فروشگاه</span>
                </div>
                <div className="kpi-value sm" data-store-kpi="listed-packs">
                  {faNum(listedCount)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">بستهٔ ویژه</span>
                </div>
                <div className="kpi-value sm" data-store-kpi="featured-packs">
                  {faNum(featuredCount)}
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-top">
                  <span className="kpi-label">پولی بدون قیمت</span>
                </div>
                <div className="kpi-value sm" data-store-kpi="priceless-paid-packs">
                  {faNum(pricelessPaidCount)}
                </div>
              </div>
            </div>

            <div className="split-wide">
              <div className="card">
                <div className="card-head">
                  <span className="card-title">بسته‌های فروشگاه</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a
                      className="btn sm"
                      href="/api/store/bazaar/catalog"
                      download="learnbox-cafe-bazaar-catalog.csv"
                      title="CSV بسته‌های پولی، منتشرشده و فهرست‌شده را برای بازبینی و ورود دستی در کافه‌بازار دانلود می‌کند؛ هیچ محصول یا پرداختی فعال نمی‌شود."
                    >
                      خروجی CSV کافه‌بازار
                    </a>
                    <span className="muted-note">{faNum(paidCount)} بستهٔ پولی</span>
                  </div>
                </div>
                {rows.length === 0 ? (
                  <div className="store-state-pad">
                    <EmptyState
                      icon="inbox"
                      title="هیچ بستهٔ کانونی وجود ندارد."
                      description="ابتدا در «محتوا و بسته‌ها» یک بسته بسازید؛ وضعیت تجاری پس از آن قابل تنظیم است."
                    />
                  </div>
                ) : (
                  <>
                    <table className="tbl" data-store-table="listings">
                      <thead>
                        <tr>
                          <th scope="col">بسته</th>
                          <th scope="col">وضعیت محتوا</th>
                          <th scope="col">قیمت</th>
                          <th scope="col">وضعیت فروشگاه</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.packId} data-store-pack={row.packId}>
                            <td>
                              {/* The reference's cover thumbnail is omitted: no pack artwork
                                  exists in canonical data, and unlike the content workspace's
                                  cover — which carries the pack's own CEFR level — the store
                                  payload has no datum to put in the square. An empty grey box
                                  would be decoration pretending to be data. */}
                              <div className="cell-main">
                                <div>
                                  <div className="t-name">{row.packDisplayName}</div>
                                  <div className="t-sub">{row.category ?? 'بدون دسته'}</div>
                                </div>
                              </div>
                            </td>
                            {/* Canonical content state, read-only here. */}
                            <td data-store-pack-status={row.packStatus}>
                              <span className="lvl">
                                {packStatusLabels[row.packStatus] ?? row.packStatus}
                              </span>
                            </td>
                            <td>{priceLabel(row)}</td>
                            <td>
                              {row.listing?.storeStatus === 'listed' ? (
                                <span className="badge b-green">فهرست‌شده</span>
                              ) : (
                                <span className="badge">فهرست‌نشده</span>
                              )}
                              {row.listing?.featured ? (
                                <span className="badge b-amber">ویژه</span>
                              ) : null}
                            </td>
                            <td style={{ textAlign: 'left' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  justifyContent: 'flex-end',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn sm"
                                  onClick={() => void syncRowToMyket(row)}
                                  disabled={
                                    syncingPackId === row.packId ||
                                    row.isFree ||
                                    row.priceTomans === null ||
                                    row.packStatus !== 'published' ||
                                    row.listing?.storeStatus !== 'listed'
                                  }
                                  title="SKU و قیمت این بسته را در مایکت ثبت یا به‌روزرسانی می‌کند؛ فعال‌سازی خرید انجام نمی‌دهد."
                                >
                                  {syncingPackId === row.packId
                                    ? 'در حال همگام‌سازی…'
                                    : 'همگام‌سازی مایکت'}
                                </button>
                                <button
                                  type="button"
                                  className="btn sm"
                                  onClick={() => openEditor(row)}
                                >
                                  ویرایش تجاری
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="tbl-foot">
                      <span>
                        {faNum(rows.length)} بستهٔ کانونی — {faNum(listedCount)} بسته در فروشگاه
                        فهرست شده است
                      </span>
                      <span className="muted">
                        شمار فروش هر بسته را دکمهٔ «گزارش فروش» نشان می‌دهد
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* M2.4 — payment operations live inside the Store workspace rather than as a new
                  navigation destination, so the approved Admin nav model is unchanged. Stage 6
                  moves them into the reference's right-hand stack. */}
              <PaymentOperationsPanel />
            </div>
          </>
        )}

        {editing && draft ? (
          <CpModal
            title={`وضعیت تجاری — ${editing.packDisplayName}`}
            onClose={closeEditor}
            footer={
              <>
                <button type="button" className="btn primary" onClick={submit} disabled={saving}>
                  {saving ? 'در حال ذخیره…' : 'ذخیره'}
                </button>
                <button type="button" className="btn" onClick={closeEditor} disabled={saving}>
                  انصراف
                </button>
              </>
            }
          >
            {formError ? (
              <p className="cp-form-status is-error" role="alert" data-store-form-error="true">
                {formError}
              </p>
            ) : null}
            <div className="cp-form-grid">
              <div className="cp-form-row">
                <label htmlFor="store-status">وضعیت فروشگاه</label>
                <select
                  id="store-status"
                  className="cp-select"
                  value={draft.storeStatus}
                  disabled={saving}
                  onChange={(event) =>
                    update({ storeStatus: event.target.value as Draft['storeStatus'] })
                  }
                >
                  <option value="unlisted">فهرست نشده</option>
                  <option value="listed">فهرست شده</option>
                </select>
              </div>
              <div className="cp-form-row">
                <label htmlFor="store-order">ترتیب نمایش</label>
                <input
                  id="store-order"
                  className="cp-input cp-ltr"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={draft.displayOrder}
                  disabled={saving}
                  onChange={(event) => update({ displayOrder: event.target.value })}
                />
              </div>
              <div className="cp-form-row">
                <label htmlFor="store-featured">بستهٔ ویژه</label>
                <span className="store-check">
                  <input
                    id="store-featured"
                    type="checkbox"
                    checked={draft.featured}
                    disabled={saving}
                    onChange={(event) => update({ featured: event.target.checked })}
                  />
                  <span className="hint">در ردیف «ویژه» فروشگاه اپ دیده می‌شود.</span>
                </span>
              </div>
              <div className="cp-form-row is-full">
                <label htmlFor="store-cover-upload">کاور فروشگاه (اختیاری)</label>
                <input
                  id="store-cover-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={coverBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void coverAction('upload', undefined, file);
                  }}
                />
                <button
                  type="button"
                  className="btn sm"
                  disabled={coverBusy}
                  onClick={() => void coverAction('generate')}
                >
                  ساخت نامزد با AI
                </button>
                <span className="hint">
                  تولید فقط با کلیک انجام می‌شود؛ نامزد تا پذیرش صریح در فروشگاه نمایش داده نمی‌شود.
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(coverCandidates ?? []).map((candidate) => (
                    <div key={candidate.id}>
                      <img
                        width={72}
                        height={72}
                        alt={`پیش‌نمایش ${candidate.source}`}
                        src={`/api/store/covers?candidateId=${encodeURIComponent(candidate.id)}`}
                      />
                      <button
                        type="button"
                        className="btn sm"
                        disabled={coverBusy || candidate.status === 'accepted'}
                        onClick={() => void coverAction('accept', candidate.id)}
                      >
                        {candidate.status === 'accepted' ? 'پذیرفته‌شده' : 'پذیرش کاور'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="cp-form-row is-full">
                <label htmlFor="store-summary">توضیح تجاری</label>
                <textarea
                  id="store-summary"
                  className="cp-textarea"
                  rows={3}
                  value={draft.commercialSummary}
                  disabled={saving}
                  onChange={(event) => update({ commercialSummary: event.target.value })}
                />
              </div>
            </div>
            {/* The reference's editor is a price-and-discount form. Price is immutable by business
                rule and discount codes do not exist, so this dialog never shows either. */}
            <p className="cp-note">
              قیمت این بسته ({priceLabel(editing)}) و رایگان/پولی بودن آن در این صفحه قابل تغییر
              نیست؛ این دو قاعدهٔ تجاری هستند و فقط در «محتوا و بسته‌ها» و مطابق سیاست‌های LearnBox
              تعیین می‌شوند. تخفیف و کد تخفیف در سامانه پیاده‌سازی نشده است.
            </p>
          </CpModal>
        ) : null}

        {reportOpen ? (
          <CpModal
            title="گزارش فروش"
            onClose={() => setReportOpen(false)}
            footer={
              <button type="button" className="btn" onClick={() => setReportOpen(false)}>
                بستن
              </button>
            }
            wide
          >
            <div className="cp-form-grid">
              <div className="cp-form-row">
                <label htmlFor="report-from">از تاریخ</label>
                <input
                  id="report-from"
                  className="cp-input cp-ltr"
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
              </div>
              <div className="cp-form-row">
                <label htmlFor="report-to">تا تاریخ</label>
                <input
                  id="report-to"
                  className="cp-input cp-ltr"
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                />
              </div>
              <div className="cp-form-row">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void loadReport(reportFrom, reportTo)}
                >
                  اعمال بازه
                </button>
              </div>
            </div>

            {reportPhase === 'loading' ? (
              <LoadingState label="در حال خواندن گزارش فروش…" />
            ) : reportPhase === 'error' ? (
              <ErrorState
                title="گزارش فروش خوانده نشد"
                description="ارتباط با backend مرکزی برقرار نشد یا پاسخ معتبر نبود."
                action={
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void loadReport(reportFrom, reportTo)}
                  >
                    تلاش دوباره
                  </button>
                }
              />
            ) : report ? (
              <>
                <div className="grid-4 mb" aria-label="شمارنده‌های گزارش فروش">
                  <div className="kpi">
                    <div className="kpi-top">
                      <span className="kpi-label">فروش verified‌شده</span>
                    </div>
                    <div className="kpi-value sm" data-report-kpi="verified-count">
                      {faNum(report.verifiedCount)}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-top">
                      <span className="kpi-label">درآمد (تومان)</span>
                    </div>
                    <div className="kpi-value sm" data-report-kpi="revenue">
                      {faNum(report.revenueTomans)}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-top">
                      <span className="kpi-label">در انتظار</span>
                    </div>
                    <div className="kpi-value sm" data-report-kpi="pending-count">
                      {faNum(report.pendingCount)}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-top">
                      <span className="kpi-label">ناموفق</span>
                    </div>
                    <div className="kpi-value sm" data-report-kpi="failed-count">
                      {faNum(report.failedCount)}
                    </div>
                  </div>
                </div>
                {report.packs.length === 0 ? (
                  <EmptyState title="هیچ فروش verified‌شده‌ای در این بازه ثبت نشده است" />
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>بسته</th>
                        <th>فروش</th>
                        <th>درآمد (تومان)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.packs.map((row) => (
                        <tr key={row.packId}>
                          <td>{row.packDisplayName}</td>
                          <td>{faNum(row.verifiedCount)}</td>
                          <td>{faNum(row.revenueTomans)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {report.byProvider.length > 0 ? (
                  <>
                    <h3 className="card-title">تفکیک بر اساس درگاه</h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>درگاه</th>
                          <th>فروش</th>
                          <th>درآمد (تومان)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byProvider.map((row) => (
                          <tr key={row.provider}>
                            <td>{providerLabels[row.provider] ?? row.provider}</td>
                            <td>{faNum(row.verifiedCount)}</td>
                            <td>{faNum(row.revenueTomans)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
                {report.byChannel.length > 0 ? (
                  <>
                    <h3 className="card-title">تفکیک بر اساس کانال خرید</h3>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>کانال</th>
                          <th>فروش</th>
                          <th>درآمد (تومان)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byChannel.map((row) => (
                          <tr key={row.channel}>
                            <td>{channelLabels[row.channel] ?? row.channel}</td>
                            <td>{faNum(row.verifiedCount)}</td>
                            <td>{faNum(row.revenueTomans)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
              </>
            ) : null}
          </CpModal>
        ) : null}
      </section>
    </main>
  );
}
