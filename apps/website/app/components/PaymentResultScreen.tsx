'use client';

import { useCallback, useEffect, useState } from 'react';

import { Bobo } from './Bobo';
import { toPersianDigits } from '../persian-digits';

/**
 * Payment result surface (Phase 2 / M2.4).
 *
 * An in-app screen rather than a separate page: the learner app is a single client shell with a
 * screen switch, and the result needs the same chrome, fonts and Bobo assets as everything else.
 * A standalone route would have duplicated the shell for one screen.
 *
 * The outcome is NEVER taken from the URL. The callback route redirects here with only an internal
 * transaction id; this component fetches the receipt as the authenticated learner, so editing the
 * query string cannot manufacture a success screen.
 *
 * The five states are deliberately distinct. The one that matters most is `verification_error`:
 * when the gateway's answer could not be established, the learner may well have paid, so it must
 * not be dressed up as failure. It shows the internal transaction id for support instead.
 */

type Purchase = {
  purchaseId: string;
  packId: string;
  packName: string | null;
  amountTomans: number;
  status: string;
  referenceId: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

type ResultState =
  | { kind: 'loading' }
  | { kind: 'success'; purchase: Purchase }
  | { kind: 'failed'; purchase: Purchase }
  | { kind: 'cancelled'; purchase: Purchase }
  | { kind: 'pending'; purchase: Purchase }
  /** Known transaction, outcome not yet established. */
  | { kind: 'unresolved'; purchaseId: string }
  /** The id itself was not usable: forged, expired, or not this learner's. */
  | { kind: 'unknown' };

/** Same formatting the Store uses for a price, so the receipt and the price tag agree. */
function formatTomans(amount: number): string {
  return `${toPersianDigits(amount.toLocaleString('en-US')).replaceAll(',', '٬')} تومان`;
}

function formatDateTime(iso: string): string {
  try {
    return toPersianDigits(
      new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso)),
    );
  } catch {
    return '';
  }
}

export function PaymentResultScreen({
  purchaseToken,
  onDone,
  onRetry,
}: {
  /** Either an internal transaction id, or one of the callback's sentinels. */
  purchaseToken: string;
  onDone: () => void;
  onRetry: () => void;
}) {
  const [state, setState] = useState<ResultState>({ kind: 'loading' });

  const sentinel = purchaseToken === 'unknown' || purchaseToken === 'unavailable';

  const load = useCallback(async (): Promise<void> => {
    if (purchaseToken === 'error') {
      setState({ kind: 'unresolved', purchaseId: '' });
      return;
    }
    if (sentinel) {
      setState({ kind: 'unknown' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const response = await fetch(
        `/api/store/purchase/status?id=${encodeURIComponent(purchaseToken)}`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) {
        setState({ kind: 'unknown' });
        return;
      }
      const body = (await response.json()) as { purchase?: Purchase };
      const purchase = body.purchase;
      if (!purchase) {
        setState({ kind: 'unknown' });
        return;
      }
      switch (purchase.status) {
        case 'verified':
          setState({ kind: 'success', purchase });
          break;
        case 'failed':
        case 'rejected':
          setState({ kind: 'failed', purchase });
          break;
        case 'cancelled':
          setState({ kind: 'cancelled', purchase });
          break;
        default:
          // `pending` — verification has not concluded. Recheck is offered, success is not claimed.
          setState({ kind: 'pending', purchase });
      }
    } catch {
      setState({ kind: 'unresolved', purchaseId: purchaseToken });
    }
  }, [purchaseToken, sentinel]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="payment-result" data-testid="payment-result">
      <div className="payment-result-card">
        {state.kind === 'loading' && (
          <>
            <span className="store-spinner" aria-hidden="true" />
            <h1>در حال بررسی پرداخت…</h1>
            <p className="payment-result-note">لطفاً این صفحه را نبندید.</p>
          </>
        )}

        {state.kind === 'success' && (
          <>
            <Bobo expression="celebrate" size={110} />
            <h1 className="payment-result-title success">پرداخت با موفقیت انجام شد</h1>
            <p className="payment-result-note">بسته به بسته‌های شما اضافه شد.</p>
            <dl className="payment-receipt">
              <div>
                <dt>بسته</dt>
                <dd>{state.purchase.packName ?? state.purchase.packId}</dd>
              </div>
              <div>
                <dt>مبلغ پرداختی</dt>
                <dd>{formatTomans(state.purchase.amountTomans)}</dd>
              </div>
              {state.purchase.referenceId && (
                <div>
                  <dt>کد رهگیری زرین‌پال</dt>
                  <dd className="payment-mono">{toPersianDigits(state.purchase.referenceId)}</dd>
                </div>
              )}
              <div>
                <dt>شمارهٔ تراکنش لرن‌باکس</dt>
                <dd className="payment-mono">{state.purchase.purchaseId}</dd>
              </div>
              <div>
                <dt>تاریخ</dt>
                <dd>{formatDateTime(state.purchase.verifiedAt ?? state.purchase.createdAt)}</dd>
              </div>
            </dl>
            <button type="button" className="payment-action primary" onClick={onDone}>
              شروع یادگیری
            </button>
          </>
        )}

        {state.kind === 'failed' && (
          <>
            <Bobo expression="recovery" size={110} />
            <h1 className="payment-result-title failed">پرداخت انجام نشد</h1>
            <p className="payment-result-note">
              مبلغی از حساب شما کسر نشده است. در صورت کسر وجه، تا ۷۲ ساعت به حساب شما برمی‌گردد.
            </p>
            <dl className="payment-receipt">
              <div>
                <dt>بسته</dt>
                <dd>{state.purchase.packName ?? state.purchase.packId}</dd>
              </div>
              <div>
                <dt>شمارهٔ تراکنش لرن‌باکس</dt>
                <dd className="payment-mono">{state.purchase.purchaseId}</dd>
              </div>
            </dl>
            <button type="button" className="payment-action primary" onClick={onRetry}>
              تلاش دوباره
            </button>
            <button type="button" className="payment-action" onClick={onDone}>
              بازگشت به برنامه
            </button>
          </>
        )}

        {state.kind === 'cancelled' && (
          <>
            <Bobo expression="recovery" size={110} />
            <h1 className="payment-result-title cancelled">خرید کامل نشد</h1>
            <p className="payment-result-note">
              پرداخت لغو شد و بسته‌ای به حساب شما اضافه نشده است. هر زمان خواستید می‌توانید دوباره
              تلاش کنید.
            </p>
            <button type="button" className="payment-action primary" onClick={onRetry}>
              بازگشت به فروشگاه
            </button>
            <button type="button" className="payment-action" onClick={onDone}>
              بازگشت به برنامه
            </button>
          </>
        )}

        {state.kind === 'pending' && (
          <>
            <span className="store-spinner" aria-hidden="true" />
            <h1 className="payment-result-title pending">پرداخت در حال بررسی است</h1>
            {/* Not success and not failure: the gateway has not given a final answer yet. */}
            <p className="payment-result-note">
              نتیجهٔ پرداخت هنوز نهایی نشده است. لطفاً چند لحظه بعد دوباره بررسی کنید.
            </p>
            <dl className="payment-receipt">
              <div>
                <dt>شمارهٔ تراکنش لرن‌باکس</dt>
                <dd className="payment-mono">{state.purchase.purchaseId}</dd>
              </div>
            </dl>
            <button type="button" className="payment-action primary" onClick={() => void load()}>
              بررسی دوباره
            </button>
            <button type="button" className="payment-action" onClick={onDone}>
              بازگشت به برنامه
            </button>
          </>
        )}

        {state.kind === 'unresolved' && (
          <>
            <Bobo expression="focus" size={110} />
            <h1 className="payment-result-title pending">وضعیت پرداخت مشخص نشد</h1>
            {/* Deliberately NOT a failure message: the payment may have succeeded. */}
            <p className="payment-result-note">
              نتیجهٔ پرداخت شما در این لحظه قابل بررسی نیست. اگر مبلغی کسر شده باشد، از بین نمی‌رود.
              برای پیگیری، شمارهٔ تراکنش زیر را به پشتیبانی بدهید.
            </p>
            {state.purchaseId && (
              <dl className="payment-receipt">
                <div>
                  <dt>شمارهٔ تراکنش لرن‌باکس</dt>
                  <dd className="payment-mono">{state.purchaseId}</dd>
                </div>
              </dl>
            )}
            <button type="button" className="payment-action primary" onClick={() => void load()}>
              بررسی دوباره
            </button>
            <button type="button" className="payment-action" onClick={onDone}>
              بازگشت به برنامه
            </button>
          </>
        )}

        {state.kind === 'unknown' && (
          <>
            <Bobo expression="recovery" size={110} />
            <h1 className="payment-result-title failed">تراکنشی پیدا نشد</h1>
            <p className="payment-result-note">
              این لینک معتبر نیست یا به حساب شما مربوط نمی‌شود. بسته‌ای به حساب شما اضافه نشده است.
            </p>
            <button type="button" className="payment-action primary" onClick={onRetry}>
              بازگشت به فروشگاه
            </button>
            <button type="button" className="payment-action" onClick={onDone}>
              بازگشت به برنامه
            </button>
          </>
        )}
      </div>
    </main>
  );
}
