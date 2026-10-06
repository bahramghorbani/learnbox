// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentResultScreen } from '../app/components/PaymentResultScreen';
import { StoreScreen } from '../app/components/StoreScreen';

/**
 * M2.4 — the learner-facing payment surfaces.
 *
 * Two properties are asserted here, and both are security properties as much as UX ones:
 *
 *   1. The result screen NEVER derives the outcome from its own input. It is handed only an opaque
 *      transaction id and fetches the receipt from the authenticated endpoint, so a learner editing
 *      the URL cannot manufacture a success screen.
 *   2. The Store's purchase CTA sends only a pack id. No price, no free/paid flag, no ownership
 *      claim — the server is the sole authority on all three.
 *
 * The five result states are rendered and distinguished, including the two that must never be
 * dressed up as failure: `pending` and the unresolved verification error.
 */

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const receipt = {
  purchaseId: 'a1b2c3d4-0000-4000-8000-000000000001',
  packId: 'paid-pack',
  packName: 'بستهٔ پیشرفته',
  amountTomans: 150000,
  status: 'verified',
  referenceId: '987654321',
  createdAt: '2026-10-06T09:00:00.000Z',
  verifiedAt: '2026-10-06T09:01:00.000Z',
};

/** Stand-in for GET /api/store/purchase/status. */
function stubStatus(options: {
  purchase?: Record<string, unknown>;
  status?: number;
  throws?: boolean;
  neverSettles?: boolean;
}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    if (options.neverSettles) return new Promise<Response>(() => {});
    if (options.throws) throw new Error('offline');
    const status = options.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ purchase: options.purchase }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const text = () => container.textContent ?? '';

beforeEach(() => {
  // tsconfig uses classic JSX (`"jsx": "preserve"`), so components need React in scope at runtime.
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = async (props: Record<string, unknown>) => {
  await act(async () => {
    root.render(
      createElement(PaymentResultScreen, {
        onDone: () => {},
        onRetry: () => {},
        ...props,
      } as never),
    );
  });
  await flush();
};

describe('M2.4 payment result — success', () => {
  it('shows the pack, the amount, both identifiers and a learning CTA', async () => {
    stubStatus({ purchase: receipt });
    await render({ purchaseToken: receipt.purchaseId });

    expect(container.querySelector('[data-testid="payment-result"]')).not.toBeNull();
    expect(text()).toContain('پرداخت با موفقیت انجام شد');
    expect(text()).toContain('بستهٔ پیشرفته');
    // The amount the learner actually paid, from the server's receipt.
    expect(text()).toContain('۱۵۰٬۰۰۰ تومان');
    // Zarinpal tracking code, for the learner's bank statement.
    expect(text()).toContain('۹۸۷۶۵۴۳۲۱');
    // Internal LearnBox transaction id, for support.
    expect(text()).toContain(receipt.purchaseId);
    expect(text()).toContain('شروع یادگیری');
  });

  it('fetches the receipt from the authenticated endpoint rather than trusting its input', async () => {
    const calls = stubStatus({ purchase: receipt });
    await render({ purchaseToken: receipt.purchaseId });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(`/api/store/purchase/status?id=${receipt.purchaseId}`);
  });

  it('omits the gateway reference when the provider gave none', async () => {
    stubStatus({ purchase: { ...receipt, referenceId: null } });
    await render({ purchaseToken: receipt.purchaseId });
    expect(text()).toContain('پرداخت با موفقیت انجام شد');
    expect(text()).not.toContain('کد رهگیری زرین‌پال');
    // The internal id must still be there, or support has nothing to work with.
    expect(text()).toContain(receipt.purchaseId);
  });
});

describe('M2.4 payment result — failure and cancellation', () => {
  it('states a failure clearly and offers a retry', async () => {
    stubStatus({ purchase: { ...receipt, status: 'failed', referenceId: null, verifiedAt: null } });
    await render({ purchaseToken: receipt.purchaseId });

    expect(text()).toContain('پرداخت انجام نشد');
    expect(text()).toContain('تلاش دوباره');
    // A failed payment must never read as a successful one.
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
    expect(text()).toContain(receipt.purchaseId);
  });

  it('explains a cancelled purchase and says no pack was granted', async () => {
    stubStatus({
      purchase: { ...receipt, status: 'cancelled', referenceId: null, verifiedAt: null },
    });
    await render({ purchaseToken: receipt.purchaseId });

    expect(text()).toContain('خرید کامل نشد');
    expect(text()).toContain('بسته‌ای به حساب شما اضافه نشده است');
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
  });

  it('calls the retry handler from the failure state', async () => {
    stubStatus({ purchase: { ...receipt, status: 'failed' } });
    const onRetry = vi.fn();
    await act(async () => {
      root.render(
        createElement(PaymentResultScreen, {
          purchaseToken: receipt.purchaseId,
          onDone: () => {},
          onRetry,
        } as never),
      );
    });
    await flush();
    const retry = Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('تلاش دوباره'),
    );
    await act(async () => retry?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('M2.4 payment result — states that must not claim an outcome', () => {
  it('shows verification in progress for a pending payment, without claiming success', async () => {
    stubStatus({
      purchase: { ...receipt, status: 'pending', referenceId: null, verifiedAt: null },
    });
    await render({ purchaseToken: receipt.purchaseId });

    expect(text()).toContain('پرداخت در حال بررسی است');
    expect(text()).toContain('بررسی دوباره');
    // Neither success nor failure may be asserted while the gateway has not answered.
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
    expect(text()).not.toContain('پرداخت انجام نشد');
  });

  it('re-checks a pending payment on demand', async () => {
    const calls = stubStatus({ purchase: { ...receipt, status: 'pending' } });
    await render({ purchaseToken: receipt.purchaseId });
    const recheck = Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('بررسی دوباره'),
    );
    await act(async () => recheck?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();
    expect(calls.length).toBeGreaterThan(1);
  });

  it('does NOT claim failure when the callback could not resolve the outcome', async () => {
    stubStatus({ purchase: receipt });
    await render({ purchaseToken: 'error' });

    expect(text()).toContain('وضعیت پرداخت مشخص نشد');
    // The learner may well have paid; telling them it failed would be a lie.
    expect(text()).not.toContain('پرداخت انجام نشد');
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
    expect(text()).toContain('پشتیبانی');
  });

  it('keeps the transaction id visible when the status request itself fails', async () => {
    stubStatus({ throws: true });
    await render({ purchaseToken: receipt.purchaseId });

    expect(text()).toContain('وضعیت پرداخت مشخص نشد');
    // Reconciliation handle must survive a network failure.
    expect(text()).toContain(receipt.purchaseId);
    expect(text()).not.toContain('پرداخت انجام نشد');
  });

  it('shows a verifying state while the receipt is still loading', async () => {
    stubStatus({ neverSettles: true });
    await render({ purchaseToken: receipt.purchaseId });

    expect(text()).toContain('در حال بررسی پرداخت');
    expect(container.querySelector('.store-spinner')).not.toBeNull();
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
  });
});

describe('M2.4 payment result — unusable tokens', () => {
  it('reports no transaction for a forged or foreign id', async () => {
    stubStatus({ status: 404 });
    await render({ purchaseToken: 'ffffffff-0000-4000-8000-000000000999' });

    expect(text()).toContain('تراکنشی پیدا نشد');
    expect(text()).toContain('بسته‌ای به حساب شما اضافه نشده است');
    expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
  });

  it('never renders success from the sentinel tokens the callback can emit', async () => {
    for (const token of ['unknown', 'unavailable']) {
      stubStatus({ purchase: receipt });
      await render({ purchaseToken: token });
      // A success receipt is available from the stub, yet the sentinel must not reach it.
      expect(text()).not.toContain('پرداخت با موفقیت انجام شد');
      expect(text()).toContain('تراکنشی پیدا نشد');
    }
  });

  it('makes no status request for a sentinel token', async () => {
    const calls = stubStatus({ purchase: receipt });
    await render({ purchaseToken: 'unknown' });
    expect(calls).toHaveLength(0);
  });
});

describe('M2.4 Store purchase CTA', () => {
  const paidPack = {
    id: 'paid-pack',
    name: 'بستهٔ پولی',
    isFree: false,
    priceTomans: 150000,
    featured: false,
    commercialSummary: null,
    totalCards: 50,
    owned: false,
  };

  function stubStore(initiate: { status: number; body?: unknown }) {
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body as string | undefined });
      if (url.includes('/api/store/purchase/initiate')) {
        return {
          ok: initiate.status >= 200 && initiate.status < 300,
          status: initiate.status,
          json: async () => initiate.body ?? {},
        } as Response;
      }
      const packs = url.includes('my-packs') ? [] : [paidPack];
      return { ok: true, status: 200, json: async () => ({ packs }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }

  const clickPurchase = async () => {
    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      (candidate.textContent ?? '').includes('خرید بسته'),
    );
    expect(button).toBeDefined();
    await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();
  };

  it('shows the real price and a purchase CTA for a paid pack', async () => {
    stubStore({
      status: 200,
      body: { redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A1' },
    });
    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();

    expect(text()).toContain('۱۵۰٬۰۰۰ تومان');
    expect(text()).toContain('خرید بسته');
    // The M2.3 placeholder must be gone.
    expect(text()).not.toContain('خرید به‌زودی');
  });

  it('sends ONLY the pack id to the server', async () => {
    const calls = stubStore({
      status: 200,
      body: { redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A1' },
    });
    // jsdom cannot navigate; replace the assignment the component performs.
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    await clickPurchase();

    const initiate = calls.find((call) => call.url.includes('/purchase/initiate'));
    expect(initiate).toBeDefined();
    expect(JSON.parse(initiate!.body as string)).toEqual({ packId: 'paid-pack' });
    // No price, no entitlement claim, no free/paid flag may be client-supplied.
    expect(initiate!.body).not.toContain('price');
    expect(initiate!.body).not.toContain('amount');
    expect(initiate!.body).not.toContain('owned');
  });

  it('follows the server-issued gateway URL and never builds one itself', async () => {
    stubStore({
      status: 200,
      body: { redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/AUTHORITY123' },
    });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    await clickPurchase();

    expect(assign).toHaveBeenCalledWith('https://sandbox.zarinpal.com/pg/StartPay/AUTHORITY123');
  });

  it('reports an unavailable gateway without redirecting anywhere', async () => {
    stubStore({ status: 503 });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    await clickPurchase();

    expect(assign).not.toHaveBeenCalled();
    expect(text()).toContain('درگاه پرداخت در دسترس نیست');
  });

  it('does not redirect when the server returns no gateway URL', async () => {
    stubStore({ status: 200, body: {} });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });

    await act(async () => {
      root.render(createElement(StoreScreen, { onNavigate: () => {} }));
    });
    await flush();
    await clickPurchase();

    expect(assign).not.toHaveBeenCalled();
    expect(text()).toContain('شروع خرید انجام نشد');
  });
});
