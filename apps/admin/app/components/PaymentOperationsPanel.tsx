'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Phase 2 / Milestone 2.4 — payment operations panel inside the Store workspace.
 *
 * Two read-only surfaces an operator genuinely needs once packs can be sold:
 *
 *   * gateway configuration status, so «تنظیم نشده» and «آماده» are distinguishable;
 *   * the real transaction list, so support can answer "I paid and nothing happened".
 *
 * Everything shown comes from `purchase_events` or from a non-secret feature flag. There is no
 * merchant-credential field — not editable, not displayed, not masked — because the credential is
 * provisioned as a server environment variable and Admin never receives it. Changing it is a
 * deployment action, described in the panel itself so the operator is not left guessing.
 *
 * No totals, no charts, no revenue summary: a sales dashboard is explicitly out of scope.
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

const configurationLabels: Record<Configuration['state'], string> = {
  disabled: 'تنظیم نشده',
  // Deliberately not «آماده»: the credential is present but has never completed a real payment,
  // so claiming readiness would be a guess.
  unproven: 'تنظیم شده — در انتظار نخستین پرداخت موفق',
  ready: 'آماده',
};

function formatAmount(amount: number | null): string {
  if (amount === null) return '—';
  return `${amount.toLocaleString('fa-IR')} تومان`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return '—';
  }
}

export function PaymentOperationsPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [configuration, setConfiguration] = useState<Configuration | undefined>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

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
    <section data-admin-panel="payments">
      <div className="page-head">
        <div>
          <h2>پرداخت‌ها</h2>
          <p className="muted">
            وضعیت درگاه زرین‌پال و تراکنش‌های واقعی خرید بسته. پرداخت وب و PWA فقط از طریق زرین‌پال
            انجام می‌شود.
          </p>
        </div>
      </div>

      {phase === 'disabled' ? (
        <div className="notice" role="status" data-payments-state="disabled">
          <span>نمای پرداخت‌ها در این محیط غیرفعال است.</span>
        </div>
      ) : null}

      {phase === 'unauthorized' ? (
        <div className="notice" role="status" data-payments-state="unauthorized">
          <span>برای دیدن پرداخت‌ها باید با گذرکلید وارد شوید.</span>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="notice" role="alert" data-payments-state="unavailable">
          <span>خواندن وضعیت پرداخت‌ها ممکن نشد.</span>
          <button className="btn" type="button" onClick={() => void load()}>
            تلاش دوباره
          </button>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <p className="muted" data-payments-state="loading">
          در حال خواندن…
        </p>
      ) : null}

      {phase === 'ready' && configuration ? (
        <>
          <div data-payments-config={configuration.state}>
            <table className="data-table" data-payments-table="configuration">
              <tbody>
                <tr>
                  <th scope="row">وضعیت درگاه</th>
                  <td>{configurationLabels[configuration.state]}</td>
                </tr>
                <tr>
                  <th scope="row">محیط درگاه</th>
                  <td>
                    {configuration.environment === 'production'
                      ? 'عملیاتی'
                      : configuration.environment === 'sandbox'
                        ? 'آزمایشی (sandbox)'
                        : '—'}
                  </td>
                </tr>
                <tr>
                  <th scope="row">پرداخت‌های تأییدشده</th>
                  <td>{configuration.verifiedCount.toLocaleString('fa-IR')}</td>
                </tr>
                <tr>
                  <th scope="row">در انتظار تأیید</th>
                  <td>{configuration.pendingCount.toLocaleString('fa-IR')}</td>
                </tr>
                <tr>
                  <th scope="row">ناموفق</th>
                  <td>{configuration.failedCount.toLocaleString('fa-IR')}</td>
                </tr>
                <tr>
                  <th scope="row">آخرین پرداخت تأییدشده</th>
                  <td>{formatDateTime(configuration.lastVerifiedAt)}</td>
                </tr>
              </tbody>
            </table>
            {/* The operator must know WHERE the credential lives, since it is not editable here. */}
            <p className="muted">
              شناسهٔ پذیرندهٔ زرین‌پال (Merchant ID) به‌صورت متغیر محیطی روی سرور تنظیم می‌شود و در
              پنل مدیریت نمایش داده یا ویرایش نمی‌شود. برای تنظیم یا تغییر آن،{' '}
              <code>ZARINPAL_MERCHANT_ID</code> و <code>LEARNBOX_ZARINPAL_ENABLED</code> را در محیط
              سرویس یادگیرنده تنظیم کنید و سرویس را دوباره راه‌اندازی کنید.
            </p>
            {configuration.state === 'unproven' ? (
              <p className="muted">
                تا زمانی که یک پرداخت واقعی با موفقیت تأیید نشود، درست‌بودن شناسهٔ پذیرنده قابل
                اثبات نیست.
              </p>
            ) : null}
          </div>

          <h3>تراکنش‌ها</h3>
          {transactions.length === 0 ? (
            <p className="muted" data-payments-state="empty">
              هنوز هیچ تراکنشی ثبت نشده است.
            </p>
          ) : (
            <div>
              <table className="data-table" data-payments-table="transactions">
                <thead>
                  <tr>
                    <th scope="col">شمارهٔ تراکنش</th>
                    <th scope="col">بسته</th>
                    <th scope="col">مبلغ</th>
                    <th scope="col">وضعیت</th>
                    <th scope="col">درگاه</th>
                    <th scope="col">کد رهگیری</th>
                    <th scope="col">ایجاد</th>
                    <th scope="col">تأیید</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td>
                        <code>{transaction.transactionId}</code>
                      </td>
                      <td>{transaction.packDisplayName ?? transaction.packId ?? '—'}</td>
                      <td>{formatAmount(transaction.amountTomans)}</td>
                      <td data-transaction-status={transaction.status}>
                        {statusLabels[transaction.status] ?? transaction.status}
                      </td>
                      <td>
                        {transaction.provider}
                        {transaction.environment === 'sandbox' ? ' (آزمایشی)' : ''}
                      </td>
                      <td>
                        <code>{transaction.providerReference ?? '—'}</code>
                      </td>
                      <td>{formatDateTime(transaction.createdAt)}</td>
                      <td>{formatDateTime(transaction.verifiedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
