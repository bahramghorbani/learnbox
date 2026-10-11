'use client';

import React, { useCallback, useEffect, useState } from 'react';

import { CpModal } from './AdminModal';
import { EmptyState, ErrorState, LoadingState } from './AdminStates';
import { faDateTime } from './fa-dates';
import { faNum } from './fa-digits';

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
  environment: string;
  status: string;
  providerPurchaseId: string;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string | null;
  verifiedAt: string | null;
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

  const load = useCallback(async (): Promise<void> => {
    setPhase('loading');
    try {
      const [configResponse, transactionsResponse] = await Promise.all([
        fetch('/api/store/payment-config', { credentials: 'same-origin' }),
        fetch('/api/store/transactions?limit=50', { credentials: 'same-origin' }),
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
      };
      setConfiguration(configBody.configuration);
      setTransactions(transactionsBody.transactions ?? []);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
                      <span className="keep-latin">{transaction.transactionId}</span>
                      {transaction.environment === 'sandbox' ? ' · آزمایشی' : ''}
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
                  <button type="button" className="btn sm" onClick={() => setSelected(transaction)}>
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
            <button type="button" className="btn ghost" onClick={() => setSelected(undefined)}>
              بستن
            </button>
          }
        >
          <dl className="dl">
            <dt>شمارهٔ تراکنش</dt>
            <dd className="keep-latin">{selected.transactionId}</dd>
            <dt>بسته</dt>
            <dd>{selected.packDisplayName ?? selected.packId ?? '—'}</dd>
            <dt>مبلغ</dt>
            <dd>{formatAmount(selected.amountTomans)}</dd>
            <dt>وضعیت</dt>
            <dd>{statusLabels[selected.status] ?? selected.status}</dd>
            <dt>درگاه</dt>
            <dd>
              {selected.provider}
              {selected.environment === 'sandbox' ? ' (آزمایشی)' : ''}
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
          </dl>
        </CpModal>
      ) : null}
    </section>
  );
}
