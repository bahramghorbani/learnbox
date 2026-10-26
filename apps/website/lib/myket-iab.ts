/**
 * Myket partner API — server-to-server only (M2-Myket).
 *
 * This is the ONLY place that knows Myket's HTTP contract exists, mirroring zarinpal.ts's
 * boundary: `store-iab-purchase.ts` depends on `StoreIabVerifier`, not on this implementation.
 *
 * Docs: https://myket.ir/kb/pages/server-to-server-payment-validation-api/
 * Myket's own warning: this token must never reach a client — leaking it lets anyone fake a
 * "paid" receipt for any SKU in this app. It lives only in this server-side fetch call.
 */

export type StoreIabReceiptOutcome =
  | { status: 'paid' }
  | { status: 'not_paid' }
  /** Network failure or an unreadable response — NOT proof of non-payment. Caller must not grant. */
  | { status: 'error' };

export type StoreIabVerifier = (input: {
  sku: string;
  purchaseToken: string;
}) => Promise<StoreIabReceiptOutcome>;

export type MyketConfig = {
  accessToken: string;
  packageName: string;
  timeoutMs?: number;
};

/** `purchaseState`: 0 = successful purchase, 1 = unsuccessful. Myket's own encoding, not ours. */
const purchaseStatePaid = 0;

export function createMyketVerifier(
  config: MyketConfig,
  fetchImpl: typeof fetch = fetch,
): StoreIabVerifier {
  const timeoutMs = config.timeoutMs ?? 10000;
  return async ({ sku, purchaseToken }) => {
    if (!sku || !purchaseToken) return { status: 'error' };
    try {
      const response = await fetchImpl(
        `https://developer.myket.ir/api/partners/applications/${encodeURIComponent(config.packageName)}/purchases/products/${encodeURIComponent(sku)}/verify`,
        {
          method: 'POST',
          headers: {
            'X-Access-Token': config.accessToken,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ tokenId: purchaseToken }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        },
      );
      if (!response.ok) return { status: 'error' };
      const body = (await response.json()) as { purchaseState?: unknown };
      if (body.purchaseState === purchaseStatePaid) return { status: 'paid' };
      return { status: 'not_paid' };
    } catch {
      return { status: 'error' };
    }
  };
}
