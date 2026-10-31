import type { StoreIabVerifier } from './myket-iab';

/**
 * Cafe Bazaar pardakht developer API — server-to-server only. Mirrors myket-iab.ts.
 *
 * Docs: https://developers.cafebazaar.ir/fa/guidelines/in-app-billing/api/setting-up
 *       https://developers.cafebazaar.ir/fa/guidelines/in-app-billing/api/validation
 * Auth is the "old method" OAuth client: a long-lived refresh token (obtained once by the owner)
 * is exchanged for a short-lived access token. The access token goes in `Authorization` RAW —
 * a `Bearer ` prefix is rejected with 403 "Access token is not valid" (verified live).
 */
export type BazaarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  packageName: string;
  timeoutMs?: number;
};

const base = 'https://pardakht.cafebazaar.ir/devapi/v2';
// ponytail: fixed 30-minute cache (docs say tokens last 1h); honor expires_in if it ever shortens.
const tokenTtlMs = 30 * 60 * 1000;
let cachedToken: { key: string; token: string; expiresAt: number } | null = null;

/** Bazaar's encoding: purchaseState 0 = purchased, 1 = refunded. */
const purchaseStatePaid = 0;
const purchaseStateRefunded = 1;

export function createBazaarVerifier(
  config: BazaarConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): StoreIabVerifier {
  const timeoutMs = config.timeoutMs ?? 10000;
  const key = `${config.clientId}:${config.refreshToken}`;

  async function accessToken(): Promise<string | null> {
    if (cachedToken?.key === key && cachedToken.expiresAt > now()) return cachedToken.token;
    const response = await fetchImpl(`${base}/auth/token/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token) return null;
    cachedToken = { key, token: body.access_token, expiresAt: now() + tokenTtlMs };
    return body.access_token;
  }

  return async ({ sku, purchaseToken }) => {
    if (!sku || !purchaseToken) return { status: 'error' };
    try {
      // One retry with a fresh token: a cached token revoked/expired early must not fail a real purchase.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = await accessToken();
        if (!token) return { status: 'error' };
        const response = await fetchImpl(
          `${base}/api/validate/${encodeURIComponent(config.packageName)}/inapp/${encodeURIComponent(sku)}/purchases/${encodeURIComponent(purchaseToken)}/`,
          {
            headers: { Authorization: token, accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
          },
        );
        if (response.status === 401 || response.status === 403) {
          cachedToken = null;
          continue;
        }
        const body = (await response.json()) as { purchaseState?: unknown; error?: unknown };
        // Only a 404 `not_found` means "no such purchase"; any other 404 (e.g. an unknown product)
        // is a configuration problem and must stay an error, never a definitive non-payment.
        if (response.status === 404) {
          return body.error === 'not_found' ? { status: 'not_paid' } : { status: 'error' };
        }
        if (!response.ok) return { status: 'error' };
        if (body.purchaseState === purchaseStatePaid) return { status: 'paid' };
        if (body.purchaseState === purchaseStateRefunded) return { status: 'not_paid' };
        return { status: 'error' };
      }
      return { status: 'error' };
    } catch {
      return { status: 'error' };
    }
  };
}

type Environment = Record<string, string | undefined>;

/** Env-only, default off — mirrors readMyketConfig. Unconfigured = no Bazaar path at all. */
export function readBazaarConfig(environment: Environment = process.env): BazaarConfig | null {
  if (environment.LEARNBOX_BAZAAR_ENABLED !== 'true') return null;
  const clientId = environment.BAZAAR_CLIENT_ID ?? '';
  const clientSecret = environment.BAZAAR_CLIENT_SECRET ?? '';
  const refreshToken = environment.BAZAAR_REFRESH_TOKEN ?? '';
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    packageName: environment.BAZAAR_PACKAGE_NAME ?? 'ir.learnbox.app',
  };
}

export function bazaarVerifierFromEnvironment(
  environment: Environment = process.env,
): { verifier: StoreIabVerifier; config: BazaarConfig } | null {
  const config = readBazaarConfig(environment);
  if (!config) return null;
  return { verifier: createBazaarVerifier(config), config };
}
