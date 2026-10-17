/**
 * Zarinpal payment provider (Phase 2 / M2.4) — Web/PWA only.
 *
 * This module is the ONLY place that knows Zarinpal exists. It speaks the real v4 contract; the
 * purchase flow in `store-purchase.ts` depends on the `ZarinpalProvider` type, not on this
 * implementation, so the whole business flow is provable with a fixture provider while production
 * runs the real HTTP calls. That boundary is also what keeps provider specifics out of the
 * canonical pack-access rule: nothing here is imported by `pack-access.ts`.
 *
 * Cafe Bazaar / Android IAP is a later phase and has no code path here.
 */

/**
 * LearnBox prices packs in TOMANS; every amount sent to Zarinpal is RIAL with `currency: 'IRR'`
 * stated explicitly (live docs + sandbox, 2026-10-17: omitting `currency` also means rial, `IRT`
 * means toman — we never rely on the default).
 *
 * The conversion happens ONCE, when the attempt is created; the rial amount is stored on the
 * attempt and verification sends that stored value back unchanged. Getting this wrong does not
 * fail loudly — it silently charges a tenth or ten times the price — so it is asserted in tests
 * and by a database CHECK (provider_amount = amount_tomans × 10).
 */
export const RIALS_PER_TOMAN = 10;

export function tomansToRials(tomans: number): number {
  if (!Number.isSafeInteger(tomans) || tomans <= 0) {
    throw new Error('Zarinpal amount must be a positive integer number of tomans.');
  }
  return tomans * RIALS_PER_TOMAN;
}

/** Zarinpal's `code` on a successful payment request and a successful verification. */
const codeSuccess = 100;
/**
 * Verification of a payment Zarinpal has ALREADY verified. Idempotent success, not a failure —
 * but only meaningful because LearnBox sends it solely for an Authority it created and stored,
 * with that attempt's stored amount (sandbox answers 101 to any merchant id for a paid Authority).
 */
const codeAlreadyVerified = 101;
/** The one currency LearnBox ever sends. */
export const PROVIDER_CURRENCY = 'IRR';

export type ZarinpalRequestOutcome =
  | { status: 'created'; authority: string }
  /** Zarinpal declined to open a payment session. `code` is Zarinpal's own error code. */
  | { status: 'rejected'; code: number }
  /** Network failure or an unreadable response: we do not know whether a session exists. */
  | { status: 'error' };

export type ZarinpalVerifyOutcome =
  | {
      status: 'verified';
      referenceId: string;
      alreadyVerified: boolean;
      code?: number;
      /** `metadata.order_id` when the gateway echoes it (observed in sandbox, undocumented). */
      orderCode?: string;
    }
  /** Zarinpal says this payment is not paid. Authoritative: no entitlement. */
  | { status: 'rejected'; code: number }
  /**
   * We could not reach Zarinpal or could not read its answer. The payment's real outcome is
   * UNKNOWN — the caller must not record a failure, because the learner may well have paid.
   */
  | { status: 'error' };

export type ZarinpalProvider = {
  /** Opens a payment session and returns the Authority that identifies it. */
  requestPayment(input: {
    /** Already converted, in rial. Sent as-is with `currency: 'IRR'`. */
    amountRials: number;
    callbackUrl: string;
    description: string;
    /** LearnBox order public code, shown in the merchant panel for support. */
    orderCode?: string;
  }): Promise<ZarinpalRequestOutcome>;
  /** Asks Zarinpal whether this Authority was actually paid, for exactly this stored rial amount. */
  verifyPayment(input: { amountRials: number; authority: string }): Promise<ZarinpalVerifyOutcome>;
  /** Where to send the learner's browser to pay. */
  paymentUrl(authority: string): string;
};

/**
 * Zarinpal Authority format: the letter `A` followed by 35 characters, per the v4 docs.
 *
 * Validated on the way in because the Authority arrives from the callback query string, is used as
 * `provider_purchase_id` (a UNIQUE key) and is echoed to Zarinpal. It is parameterised everywhere,
 * so this is a sanity bound rather than an injection defence.
 */
const authorityPattern = /^[A-Za-z0-9]{36,40}$/;

export function isZarinpalAuthority(value: unknown): value is string {
  return typeof value === 'string' && authorityPattern.test(value);
}

export type ZarinpalEndpoints = {
  requestUrl: string;
  verifyUrl: string;
  startPayUrl: string;
};

/**
 * Sandbox and production are different hosts, not a flag on the same host — so a sandbox
 * misconfiguration cannot accidentally charge a real card, and a production one cannot be satisfied
 * by sandbox money.
 */
export function zarinpalEndpoints(sandbox: boolean): ZarinpalEndpoints {
  const host = sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
  return {
    requestUrl: `${host}/pg/v4/payment/request.json`,
    verifyUrl: `${host}/pg/v4/payment/verify.json`,
    startPayUrl: `${host}/pg/StartPay/`,
  };
}

type ZarinpalBody = {
  data?: { code?: unknown; authority?: unknown; ref_id?: unknown; metadata?: unknown } | unknown[];
  errors?: { code?: unknown } | unknown[];
};

/** Zarinpal returns `data: []` (not an object) when the call failed, hence the shape check. */
function readData(body: ZarinpalBody): {
  code?: unknown;
  authority?: unknown;
  ref_id?: unknown;
  metadata?: unknown;
} {
  const data = body?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function readErrorCode(body: ZarinpalBody): number {
  const errors = body?.errors;
  const candidate = Array.isArray(errors) ? errors[0] : errors;
  const code = (candidate as { code?: unknown } | undefined)?.code;
  return typeof code === 'number' ? code : 0;
}

export type ZarinpalHttpConfig = {
  /** Never logged, never returned to a client, never persisted. */
  merchantId: string;
  sandbox: boolean;
  timeoutMs?: number;
  /**
   * Test-only local endpoint, supplied only by the guarded staging config. It is intentionally not
   * an environment variable here: production callers cannot silently redirect provider traffic.
   */
  endpoints?: ZarinpalEndpoints;
};

/**
 * The real provider.
 *
 * `fetchImpl` exists so the HTTP contract itself can be tested against recorded Zarinpal payloads
 * without a network or a credential. It is NOT a plugin seam for alternative providers.
 */
export function createZarinpalProvider(
  config: ZarinpalHttpConfig,
  fetchImpl: typeof fetch = fetch,
): ZarinpalProvider {
  const endpoints = config.endpoints ?? zarinpalEndpoints(config.sandbox);
  const timeoutMs = config.timeoutMs ?? 10000;

  async function call(url: string, payload: Record<string, unknown>): Promise<ZarinpalBody | null> {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // The merchant id travels in the body to Zarinpal and nowhere else.
        body: JSON.stringify({ merchant_id: config.merchantId, ...payload }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      // A 5xx from the gateway is "unknown", not "unpaid": fall through to null.
      if (!response.ok && response.status >= 500) return null;
      return (await response.json()) as ZarinpalBody;
    } catch {
      return null;
    }
  }

  return {
    paymentUrl(authority: string) {
      if (!isZarinpalAuthority(authority)) throw new Error('Invalid Zarinpal authority.');
      return `${endpoints.startPayUrl}${authority}`;
    },

    async requestPayment({ amountRials, callbackUrl, description, orderCode }) {
      if (!Number.isSafeInteger(amountRials) || amountRials <= 0)
        return { status: 'rejected', code: 0 };
      const body = await call(endpoints.requestUrl, {
        amount: amountRials,
        currency: PROVIDER_CURRENCY,
        callback_url: callbackUrl,
        description,
        ...(orderCode ? { metadata: { order_id: orderCode } } : {}),
      });
      if (!body) return { status: 'error' };
      const data = readData(body);
      if (data.code === codeSuccess && isZarinpalAuthority(data.authority)) {
        return { status: 'created', authority: data.authority };
      }
      return {
        status: 'rejected',
        code: typeof data.code === 'number' ? data.code : readErrorCode(body),
      };
    },

    async verifyPayment({ amountRials, authority }) {
      if (!isZarinpalAuthority(authority)) return { status: 'rejected', code: 0 };
      if (!Number.isSafeInteger(amountRials) || amountRials <= 0) return { status: 'error' };
      const body = await call(endpoints.verifyUrl, {
        // The stored rial amount of the attempt, never re-derived from the current price.
        amount: amountRials,
        authority,
      });
      if (!body) return { status: 'error' };
      const data = readData(body);
      const code = typeof data.code === 'number' ? data.code : readErrorCode(body);
      if (code === codeSuccess || code === codeAlreadyVerified) {
        const referenceId = data.ref_id;
        const echoed = (data.metadata as { order_id?: unknown } | undefined)?.order_id;
        // Verified without a usable RefID would leave support nothing to reconcile against.
        if (referenceId === undefined || referenceId === null || referenceId === '') {
          return { status: 'error' };
        }
        return {
          status: 'verified',
          referenceId: String(referenceId),
          alreadyVerified: code === codeAlreadyVerified,
          code,
          ...(typeof echoed === 'string' && echoed ? { orderCode: echoed } : {}),
        };
      }
      return { status: 'rejected', code };
    },
  };
}
