'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { CpModal } from './AdminModal';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { faDateTime } from './fa-dates';
import { faNum } from './fa-digits';
import { fetchWithStepUp, readCsrfToken, stepUpRefusal } from './step-up-reauth';

/**
 * Phase 2 / Milestone 2.4 — payment operations, the right-hand stack of the Store screen.
 *
 * Two read-only surfaces an operator genuinely needs once packs can be sold:
 *
 *   * the real transaction list, so support can answer "I paid and nothing happened";
 *   * gateway configuration status, so «تنظیم نشده» and «آماده» are distinguishable.
 *
 * Everything shown comes from `purchase_events` or from a non-secret feature flag. There is no
 * merchant-credential field — not editable, not displayed, not masked — because the credential is
 * provisioned as a server environment variable and Admin never receives it. Changing it is a
 * deployment action, described in the panel itself so the operator is not left guessing.
 *
 * No totals, no charts, no revenue summary: a sales dashboard is explicitly out of scope. The
 * reference shows invoicing and refunds as switched-off gateway rows; neither exists in the
 * backend, so they are labelled «پیاده‌سازی نشده» rather than «غیرفعال», which would imply a
 * switch an operator could go and find.
 *
 * Commerce core v1 adds what support needs to chase one payment: search by Authority, RefID,
 * order code, attempt or learner id; a «نیازمند بررسی» filter (extra valid payments, provider
 * mismatches, pending attempts older than 30 minutes); the order timeline; and a request to
 * re-check an unsettled attempt with the gateway. The request only queues the check — the
 * reconciliation job runs it — and no control here edits a payment, grants access or refunds.
 *
 * Stage 6 moved this onto the approved card vocabulary. A transaction row opens a dialog carrying
 * every field the previous eight-column table printed, so support loses nothing to the narrower
 * column.
 */

type Configuration = {
  state: 'disabled' | 'unproven' | 'ready';
  enabled: boolean;
  environment: 'sandbox' | 'production' | null;
  provider: string;
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  lastVerifiedAt: string | null;
};

type Transaction = {
  transactionId: string;
  userId: string;
  packId: string | null;
  packDisplayName: string | null;
  amountTomans: number | null;
  provider: string;
  channel: string | null;
  environment: string;
  status: string;
  providerPurchaseId: string;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string | null;
  verifiedAt: string | null;
  orderCode: string | null;
  orderStatus: string | null;
  providerAmount: string | null;
  providerCurrency: string | null;
  reviewReason: string | null;
  lastProviderCode: number | null;
  checkCount: number;
  lastCheckedAt: string | null;
  recheckPending: boolean;
  recheckRequestedAt: string | null;
  autoCheck: string;
};

type TimelineEvent = {
  kind: string;
  source: string;
  providerCode: number | null;
  attemptId: string | null;
  createdAt: string;
};

type Phase = 'loading' | 'ready' | 'disabled' | 'unauthorized' | 'error';

const statusLabels: Record<string, string> = {
  pending: 'در انتظار تأیید',
  verified: 'تأییدشده',
  failed: 'ناموفق',
  cancelled: 'لغوشده',
  rejected: 'ردشده',
  refunded: 'بازگشت‌خورده',
  revoked: 'ابطال‌شده',
};

const providerLabels: Record<string, string> = {
  zarinpal: 'زرین‌پال',
  myket: 'مایکت',
  cafe_bazaar: 'کافه‌بازار',
  sibapp: 'سیب‌اپ',
  direct_web: 'وب مستقیم',
  google_play: 'گوگل‌پلی',
  app_store: 'اپ‌استور',
};

const channelLabels: Record<string, string> = {
  web_zarinpal: 'وب / زرین‌پال',
  android_myket: 'اندروید / مایکت',
  android_bazaar: 'اندروید / کافه‌بازار',
  ios_sibapp: 'iOS / سیب‌اپ',
  legacy: 'ثبت قدیمی',
};

/** The reference's order badges, mapped onto the canonical purchase states. */
const statusBadgeTone: Record<string, string> = {
  verified: 'badge b-green',
  pending: 'badge b-amber',
  failed: 'badge b-rose',
  cancelled: 'badge',
  rejected: 'badge b-rose',
  refunded: 'badge',
  revoked: 'badge b-rose',
};

const reviewLabels: Record<string, string> = {
  already_entitled:
    'پرداخت معتبر اضافه — دسترسی از قبل وجود داشت؛ نیازمند رسیدگی (بازپرداخت خودکار ندارد)',
  provider_mismatch: 'پاسخ درگاه با این تلاش پرداخت تطبیق نداشت؛ دسترسی داده نشد',
  provider_rejected: 'درگاه این تلاش را رد کرد؛ بررسی خودکار متوقف شد و دسترسی داده نشد',
};

/** Definitive provider answers that stop automatic retries (store-purchase.ts). */
const providerCodeLabels: Record<number, string> = {
  [-50]: 'مغایرت مبلغ با مبلغ پرداخت‌شده',
  [-53]: 'پرداخت متعلق به این پذیرنده نیست',
  [-54]: 'Authority نامعتبر',
  [-55]: 'تراکنش در درگاه یافت نشد',
};

const autoCheckLabels: Record<string, string> = {
  scheduled: 'بررسی خودکار در اجرای بعدی تطبیق',
  stopped_review: 'بررسی خودکار متوقف — نیازمند رسیدگی',
  stopped_limit: 'بررسی خودکار پس از سقف دفعات متوقف شد — نیازمند رسیدگی',
  stopped_window: 'خارج از بازهٔ بررسی خودکار',
  settled: 'نهایی‌شده',
  not_applicable: '—',
};

/** A queued re-check older than this has not been picked up by the job: say so. */
const recheckOverdueMs = 20 * 60 * 1000;

const orderStatusLabels: Record<string, string> = {
  open: 'باز',
  fulfilled: 'تکمیل‌شده',
  needs_review: 'نیازمند بررسی',
  expired: 'منقضی',
  cancelled: 'لغوشده',
};

const timelineLabels: Record<string, string> = {
  order_opened: 'سفارش باز شد',
  order_expired: 'سفارش منقضی شد',
  attempt_created: 'تلاش پرداخت ایجاد شد',
  attempt_reused: 'تلاش پرداخت موجود دوباره استفاده شد',
  verified: 'پرداخت تأیید و دسترسی داده شد',
  already_entitled: 'پرداخت تأیید شد؛ دسترسی از قبل وجود داشت',
  provider_mismatch: 'عدم تطبیق پاسخ درگاه',
  cancelled: 'بازگشت ناموفق از درگاه',
  failed: 'درگاه پرداخت را تأیید نکرد',
  check_unresolved: 'بررسی بی‌نتیجه ماند؛ دوباره بررسی می‌شود',
  provider_rejected: 'درگاه تلاش را رد کرد؛ نیازمند رسیدگی',
  recheck_requested: 'درخواست بررسی دوباره',
};

const sourceLabels: Record<string, string> = {
  learner_initiate: 'کاربر',
  provider_callback: 'بازگشت درگاه',
  learner_status: 'صفحهٔ رسید',
  reconciliation: 'تطبیق خودکار',
  admin_recheck: 'مدیر',
};

const recheckable = new Set(['pending', 'cancelled', 'failed']);

function needsAttention(transaction: Transaction): boolean {
  return (
    transaction.reviewReason !== null ||
    transaction.orderStatus === 'needs_review' ||
    // Still unsettled after the last automatic check: nobody will look again unless a person does.
    transaction.autoCheck === 'stopped_limit'
  );
}

const configurationLabels: Record<Configuration['state'], string> = {
  disabled: 'تنظیم نشده',
  // Deliberately not «آماده»: the credential is present but has never completed a real payment,
  // so claiming readiness would be a guess.
  unproven: 'تنظیم شده — در انتظار نخستین پرداخت موفق',
  ready: 'آماده',
};

const configurationPulse: Record<Configuration['state'], string> = {
  disabled: 'pulse off',
  unproven: 'pulse warn',
  ready: 'pulse',
};

function formatAmount(amount: number | null): string {
  if (amount === null) return '—';
  return `${faNum(amount)} تومان`;
}

function formatDateTime(iso: string | null): string {
  return faDateTime(iso);
}

export function PaymentOperationsPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [configuration, setConfiguration] = useState<Configuration | undefined>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selected, setSelected] = useState<Transaction | undefined>();
  const [search, setSearch] = useState('');
  /** The search actually applied: set on submit, so typing alone never refetches. */
  const [query, setQuery] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [provider, setProvider] = useState('');
  const [channel, setChannel] = useState('');
  const [timeline, setTimeline] = useState<TimelineEvent[] | 'loading' | 'error'>('loading');
  const [recheckMessage, setRecheckMessage] = useState<string | undefined>();
  const [recheckBusy, setRecheckBusy] = useState(false);
  const [reconciliationEnabled, setReconciliationEnabled] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setPhase('loading');
    const params = new URLSearchParams({ limit: '50' });
    if (query) params.set('q', query);
    if (reviewOnly) params.set('review', '1');
    if (provider) params.set('provider', provider);
    if (channel) params.set('channel', channel);
    try {
      const [configResponse, transactionsResponse] = await Promise.all([
        fetch('/api/store/payment-config', { credentials: 'same-origin' }),
        fetch(`/api/store/transactions?${params.toString()}`, { credentials: 'same-origin' }),
      ]);
      if (configResponse.status === 404) {
        setPhase('disabled');
        return;
      }
      if (configResponse.status === 401) {
        setPhase('unauthorized');
        return;
      }
      if (!configResponse.ok || !transactionsResponse.ok) {
        setPhase('error');
        return;
      }
      const configBody = (await configResponse.json()) as { configuration?: Configuration };
      const transactionsBody = (await transactionsResponse.json()) as {
        transactions?: Transaction[];
        reconciliationEnabled?: boolean;
      };
      setConfiguration(configBody.configuration);
      setTransactions(transactionsBody.transactions ?? []);
      setReconciliationEnabled(transactionsBody.reconciliationEnabled === true);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [channel, provider, query, reviewOnly]);

  // Reloads on mount, on each submitted search and when a structured filter changes.
  useEffect(() => {
    void load();
  }, [load]);

  const openDetails = useCallback(async (transaction: Transaction) => {
    setSelected(transaction);
    setRecheckMessage(undefined);
    setTimeline('loading');
    try {
      const response = await fetch(
        `/api/store/transactions/timeline?transactionId=${encodeURIComponent(transaction.transactionId)}`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('timeline');
      setTimeline(((await response.json()) as { events?: TimelineEvent[] }).events ?? []);
    } catch {
      setTimeline('error');
    }
  }, []);

  const requestRecheck = useCallback(async (transaction: Transaction) => {
    const csrfToken = readCsrfToken();
    if (!csrfToken) {
      setRecheckMessage('نشان امنیتی CSRF در دسترس نیست؛ صفحه را تازه کنید.');
      return;
    }
    setRecheckBusy(true);
    try {
      const { response, stepUp } = await fetchWithStepUp('/api/store/transactions/recheck', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-learnbox-csrf-token': csrfToken },
        body: JSON.stringify({ transactionId: transaction.transactionId }),
      });
      const refused = stepUpRefusal(stepUp, response.status);
      if (refused) setRecheckMessage(refused);
      else if (response.ok) {
        const body = (await response.json()) as { status?: string };
        setRecheckMessage(
          body.status === 'already_requested'
            ? 'درخواست بررسی دوباره از قبل ثبت شده است و در اجرای بعدی تطبیق انجام می‌شود.'
            : 'درخواست ثبت شد؛ در اجرای بعدی تطبیق خودکار، وضعیت از درگاه پرسیده می‌شود.',
        );
        setSelected({
          ...transaction,
          recheckPending: true,
          recheckRequestedAt: transaction.recheckRequestedAt ?? new Date().toISOString(),
        });
      } else if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        setRecheckMessage(
          body.code === 'reconciliation_disabled'
            ? 'تطبیق خودکار در این محیط خاموش است؛ درخواستی ثبت نشد.'
            : 'این تلاش پرداخت قابل بررسی دوباره نیست.',
        );
      } else if (response.status === 404) {
        setRecheckMessage('نقش شما اجازهٔ درخواست بررسی دوباره را ندارد.');
      } else setRecheckMessage('ثبت درخواست با خطا روبه‌رو شد.');
    } catch {
      setRecheckMessage('ثبت درخواست با خطا روبه‌رو شد.');
    } finally {
      setRecheckBusy(false);
    }
  }, []);

  return (
    <section className="stack" data-admin-panel="payments">
      <div className="card store-orders">
        <div className="card-head">
          <span className="card-title">تراکنش‌های اخیر</span>
          {phase === 'ready' ? (
            <span className="muted-note">{faNum(transactions.length)} تراکنش</span>
          ) : null}
        </div>
        <div className="card-body">
          <form
            className="store-orders-filter"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              // Re-submitting the same text still refreshes the list.
              if (search.trim() === query) void load();
              else setQuery(search.trim());
            }}
          >
            <input
              aria-label="جست‌وجوی پرداخت با Authority، کد رهگیری، شمارهٔ سفارش یا شناسه"
              className="cp-input keep-latin"
              dir="ltr"
              value={search}
              maxLength={64}
              placeholder="Authority / RefID / LB-… / شناسه"
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label="فیلتر درگاه پرداخت"
              className="cp-input"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="">همهٔ درگاه‌ها</option>
              {Object.entries(providerLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="فیلتر کانال خرید"
              className="cp-input"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              <option value="">همهٔ کانال‌ها</option>
              {Object.entries(channelLabels)
                .filter(([value]) => value !== 'legacy')
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            <button className="btn sm" type="submit">
              جست‌وجو
            </button>
            <label className="muted-note">
              <input
                type="checkbox"
                checked={reviewOnly}
                onChange={(event) => setReviewOnly(event.target.checked)}
              />{' '}
              فقط موارد نیازمند بررسی
            </label>
          </form>
          {phase === 'loading' ? (
            <LoadingState label="در حال خواندن تراکنش‌ها…" />
          ) : phase === 'disabled' ? (
            <div data-payments-state="disabled">
              <ErrorState
                tone="amber"
                title="نمای پرداخت‌ها در این محیط غیرفعال است"
                description="این نما با پرچم محیطی فعال می‌شود؛ هیچ دادهٔ پرداختی خوانده نمی‌شود."
              />
            </div>
          ) : phase === 'unauthorized' ? (
            <div data-payments-state="unauthorized">
              <ErrorState
                tone="amber"
                title="برای دیدن پرداخت‌ها باید وارد شوید"
                description="این بخش با گذرکلید محافظت می‌شود؛ پس از ورود دوباره تلاش کنید."
              />
            </div>
          ) : phase === 'error' ? (
            <div data-payments-state="unavailable">
              <ErrorState
                title="خواندن وضعیت پرداخت‌ها ممکن نشد"
                description="پاسخ backend مرکزی دریافت نشد."
                action={
                  <button className="btn" type="button" onClick={() => void load()}>
                    تلاش دوباره
                  </button>
                }
              />
            </div>
          ) : transactions.length === 0 ? (
            <div data-payments-state="empty">
              <EmptyState
                icon="inbox"
                title="هنوز هیچ تراکنشی ثبت نشده است."
                description="این فهرست فقط پرداخت‌های واقعی را نشان می‌دهد؛ تا نخستین خرید، خالی می‌ماند."
              />
            </div>
          ) : (
            <div className="list" data-payments-table="transactions">
              {transactions.map((transaction) => (
                <div className="list-row" key={transaction.transactionId}>
                  <div className="list-grow">
                    <div className="list-title">
                      {transaction.packDisplayName ?? transaction.packId ?? 'بستهٔ نامشخص'}
                    </div>
                    <div className="list-sub">
                      <span className="keep-latin">
                        {transaction.orderCode ?? transaction.transactionId}
                      </span>
                      {' · '}
                      {providerLabels[transaction.provider] ?? transaction.provider}
                      {' · '}
                      {transaction.channel
                        ? (channelLabels[transaction.channel] ?? transaction.channel)
                        : channelLabels.legacy}
                      {transaction.environment === 'sandbox' ? ' · آزمایشی' : ''}
                      {needsAttention(transaction) ? (
                        <span className="badge b-amber" data-transaction-review="true">
                          {' '}
                          نیازمند بررسی
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="store-order-amount">
                    <div className="list-title">{formatAmount(transaction.amountTomans)}</div>
                    <div className="list-sub">{formatDateTime(transaction.createdAt)}</div>
                  </div>
                  <span
                    className={statusBadgeTone[transaction.status] ?? 'badge'}
                    data-transaction-status={transaction.status}
                  >
                    {statusLabels[transaction.status] ?? transaction.status}
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => void openDetails(transaction)}
                  >
                    جزئیات
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">درگاه پرداخت</span>
        </div>
        <div className="card-body">
          {phase === 'ready' && configuration ? (
            <div data-payments-config={configuration.state}>
              {configuration.state === 'disabled' ? (
                /* The plan asks for an explicit "the gateway is not active" warning. It is driven
                   by the real flag, not hardcoded, so it disappears the day payments go live. */
                <p className="notice" role="note" data-payments-warning="inactive">
                  <span>
                    <b>درگاه پرداخت فعال نیست.</b> هیچ خریدی در فروشگاه انجام نمی‌شود و هیچ تراکنش
                    واقعی ثبت نمی‌گردد.
                  </span>
                </p>
              ) : null}
              <div className="health-row">
                <span className="health-name">
                  <i className={configurationPulse[configuration.state]} aria-hidden="true" />
                  درگاه{' '}
                  {configuration.provider === 'zarinpal' ? 'زرین‌پال' : configuration.provider}
                </span>
                <span className={configuration.state === 'ready' ? undefined : 'unavailable'}>
                  {configurationLabels[configuration.state]}
                </span>
              </div>
              <div className="health-row">
                <span className="health-name">محیط درگاه</span>
                <span className={configuration.environment ? undefined : 'unavailable'}>
                  {configuration.environment === 'production'
                    ? 'عملیاتی'
                    : configuration.environment === 'sandbox'
                      ? 'آزمایشی (sandbox)'
                      : 'تعیین نشده'}
                </span>
              </div>
              <div className="health-row">
                <span className="health-name">پرداخت‌های تأییدشده</span>
                <span>{faNum(configuration.verifiedCount)}</span>
              </div>
              <div className="health-row">
                <span className="health-name">در انتظار تأیید</span>
                <span>{faNum(configuration.pendingCount)}</span>
              </div>
              <div className="health-row">
                <span className="health-name">ناموفق</span>
                <span>{faNum(configuration.failedCount)}</span>
              </div>
              <div className="health-row">
                <span className="health-name">آخرین پرداخت تأییدشده</span>
                <span className={configuration.lastVerifiedAt ? undefined : 'unavailable'}>
                  {formatDateTime(configuration.lastVerifiedAt)}
                </span>
              </div>
              {/* The reference shows invoicing and refunds as switched-off rows. Neither exists in
                  the backend, so they say exactly that. */}
              <div className="health-row">
                <span className="health-name">
                  <i className="pulse off" aria-hidden="true" />
                  صدور فاکتور
                </span>
                <span className="unavailable">پیاده‌سازی نشده</span>
              </div>
              <div className="health-row">
                <span className="health-name">
                  <i className="pulse off" aria-hidden="true" />
                  بازگشت وجه
                </span>
                <span className="unavailable">پیاده‌سازی نشده</span>
              </div>
              {/* The operator must know WHERE the credential lives, since it is not editable here. */}
              <p className="muted-note store-gateway-note">
                شناسهٔ پذیرندهٔ زرین‌پال (Merchant ID) به‌صورت متغیر محیطی روی سرور تنظیم می‌شود و
                در پنل مدیریت نمایش داده یا ویرایش نمی‌شود. برای تنظیم یا تغییر آن،{' '}
                <code className="keep-latin">ZARINPAL_MERCHANT_ID</code> و{' '}
                <code className="keep-latin">LEARNBOX_ZARINPAL_ENABLED</code> را در محیط سرویس
                یادگیرنده تنظیم کنید و سرویس را دوباره راه‌اندازی کنید.
              </p>
              {configuration.state === 'unproven' ? (
                <p className="muted-note store-gateway-note">
                  تا زمانی که یک پرداخت واقعی با موفقیت تأیید نشود، درست‌بودن شناسهٔ پذیرنده قابل
                  اثبات نیست.
                </p>
              ) : null}
            </div>
          ) : phase === 'loading' ? (
            <LoadingState label="در حال خواندن وضعیت درگاه…" />
          ) : (
            <p className="muted-note">وضعیت درگاه در دسترس نیست.</p>
          )}
        </div>
      </div>

      {selected ? (
        <CpModal
          title="جزئیات تراکنش"
          onClose={() => setSelected(undefined)}
          footer={
            <>
              {reconciliationEnabled && recheckable.has(selected.status) && selected.orderCode ? (
                <button
                  type="button"
                  className="btn"
                  disabled={recheckBusy || selected.recheckPending}
                  onClick={() => void requestRecheck(selected)}
                >
                  {selected.recheckPending
                    ? 'بررسی دوباره در صف است'
                    : 'درخواست بررسی دوباره از درگاه'}
                </button>
              ) : null}
              <button type="button" className="btn ghost" onClick={() => setSelected(undefined)}>
                بستن
              </button>
            </>
          }
        >
          {selected.reviewReason ? (
            <p
              className="notice"
              role="note"
              data-transaction-review-reason={selected.reviewReason}
            >
              <span>
                {reviewLabels[selected.reviewReason] ?? selected.reviewReason}
                {selected.reviewReason === 'provider_rejected' &&
                selected.lastProviderCode !== null ? (
                  <>
                    {' — '}
                    {providerCodeLabels[selected.lastProviderCode] ?? 'کد خطای درگاه'}{' '}
                    <bdi className="keep-latin">(code {selected.lastProviderCode})</bdi>
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {selected.recheckPending &&
          selected.recheckRequestedAt &&
          Date.now() - Date.parse(selected.recheckRequestedAt) > recheckOverdueMs ? (
            <p className="notice" role="note">
              <span>
                درخواست بررسی دوباره بیش از ۲۰ دقیقه است اجرا نشده؛ اجرای زمان‌بندی‌شدهٔ تطبیق را
                بررسی کنید.
              </span>
            </p>
          ) : null}
          {!reconciliationEnabled && recheckable.has(selected.status) ? (
            <p className="muted-note">
              تطبیق خودکار در این محیط خاموش است؛ بررسی دوباره از درگاه در دسترس نیست.
            </p>
          ) : null}
          {recheckMessage ? (
            <p className="muted-note" role="status">
              {recheckMessage}
            </p>
          ) : null}
          <dl className="dl">
            <dt>شمارهٔ سفارش</dt>
            <dd className="keep-latin">{selected.orderCode ?? '—'}</dd>
            <dt>وضعیت سفارش</dt>
            <dd>
              {selected.orderStatus
                ? (orderStatusLabels[selected.orderStatus] ?? selected.orderStatus)
                : '—'}
            </dd>
            <dt>شمارهٔ تلاش پرداخت</dt>
            <dd className="keep-latin">{selected.transactionId}</dd>
            <dt>بسته</dt>
            <dd>{selected.packDisplayName ?? selected.packId ?? '—'}</dd>
            <dt>مبلغ</dt>
            <dd>{formatAmount(selected.amountTomans)}</dd>
            <dt>مبلغ ارسالی به درگاه</dt>
            <dd>
              {selected.providerAmount
                ? `${faNum(Number(selected.providerAmount))} ${selected.providerCurrency === 'IRR' ? 'ریال' : (selected.providerCurrency ?? '')}`
                : '—'}
            </dd>
            <dt>وضعیت</dt>
            <dd>{statusLabels[selected.status] ?? selected.status}</dd>
            <dt>درگاه</dt>
            <dd>
              {providerLabels[selected.provider] ?? selected.provider}
              {selected.environment === 'sandbox' ? ' (آزمایشی)' : ''}
            </dd>
            <dt>کانال خرید</dt>
            <dd>
              {selected.channel
                ? (channelLabels[selected.channel] ?? selected.channel)
                : channelLabels.legacy}
            </dd>
            <dt>شناسهٔ خرید درگاه</dt>
            <dd className="keep-latin">{selected.providerPurchaseId}</dd>
            <dt>کد رهگیری</dt>
            <dd className="keep-latin">{selected.providerReference ?? '—'}</dd>
            <dt>شناسهٔ کاربر</dt>
            <dd className="keep-latin">{selected.userId}</dd>
            <dt>ایجاد</dt>
            <dd>{formatDateTime(selected.createdAt)}</dd>
            <dt>آخرین تغییر</dt>
            <dd>{formatDateTime(selected.updatedAt)}</dd>
            <dt>تأیید</dt>
            <dd>{formatDateTime(selected.verifiedAt)}</dd>
            <dt>آخرین بررسی درگاه</dt>
            <dd>
              {formatDateTime(selected.lastCheckedAt)}
              {selected.lastProviderCode !== null ? (
                <bdi className="keep-latin"> (code {selected.lastProviderCode})</bdi>
              ) : null}
              {' · '}
              {faNum(selected.checkCount)} بار
            </dd>
            <dt>بررسی بعدی</dt>
            <dd data-transaction-auto-check={selected.autoCheck}>
              {selected.recheckPending
                ? 'درخواست بررسی دوباره در صف تطبیق'
                : (autoCheckLabels[selected.autoCheck] ?? selected.autoCheck)}
            </dd>
          </dl>
          <h3 className="card-title">سابقهٔ سفارش</h3>
          {timeline === 'loading' ? (
            <LoadingState label="در حال خواندن سابقه…" />
          ) : timeline === 'error' ? (
            <p className="muted-note">سابقهٔ سفارش در دسترس نیست.</p>
          ) : timeline.length === 0 ? (
            <p className="muted-note">برای این تراکنش سابقهٔ سفارشی ثبت نشده است.</p>
          ) : (
            <ol className="list" data-transaction-timeline="true">
              {timeline.map((event, index) => (
                <li className="list-row" key={`${event.createdAt}-${index}`}>
                  <div className="list-grow">
                    <div className="list-title">{timelineLabels[event.kind] ?? event.kind}</div>
                    <div className="list-sub">
                      {sourceLabels[event.source] ?? event.source}
                      {event.providerCode !== null ? (
                        <bdi className="keep-latin"> · code {event.providerCode}</bdi>
                      ) : null}
                      {event.attemptId && event.attemptId !== selected.transactionId
                        ? ' · تلاش دیگر'
                        : ''}
                    </div>
                  </div>
                  <div className="list-sub">{formatDateTime(event.createdAt)}</div>
                </li>
              ))}
            </ol>
          )}
        </CpModal>
      ) : null}
    </section>
  );
}
