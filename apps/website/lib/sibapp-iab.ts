import type { StoreIabVerifier } from './myket-iab';

/**
 * Sibapp (iOS) purchase validation — server-to-server only. Mirrors bazaar-iab.ts.
 *
 * Docs: https://developer.sibapp.com/saleTutorial (+ its Postman collection).
 * GET /purchase/{purchase_id}/validate with `Secret-Key`; the token is IP-bound to the production
 * host in the Sibapp panel and must never reach a client. The app hands us only Sibapp's
 * purchase_id (from `learnbox://?purchase_id=`); the answer names the package that was bought, so a
 * receipt for a cheap package can never be claimed against a different SKU.
 *
 * ponytail: shape taken from Sibapp's documented sample — the live API answers 401 until the app is
 * published. Anything that does not match that shape exactly is `error` (never paid, never a
 * definitive non-payment); re-check against a real purchase before enabling.
 */
export type SibappConfig = { secretKey: string; applicationId: string; timeoutMs?: number };

const base = 'https://api.sibapp.net/api/v1';

type ValidateBody = {
  id?: unknown;
  target?: { application?: { id?: unknown }; package?: { id?: unknown } };
};

export function createSibappVerifier(
  config: SibappConfig,
  fetchImpl: typeof fetch = fetch,
): StoreIabVerifier {
  return async ({ sku, purchaseToken }) => {
    if (!sku || !purchaseToken) return { status: 'error' };
    try {
      const response = await fetchImpl(
        `${base}/purchase/${encodeURIComponent(purchaseToken)}/validate`,
        {
          headers: { 'Secret-Key': config.secretKey, accept: 'application/json' },
          signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
          cache: 'no-store',
        },
      );
      if (!response.ok) return { status: 'error' };
      const body = (await response.json()) as ValidateBody;
      if (body.id !== purchaseToken || typeof body.target?.package?.id !== 'string') {
        return { status: 'error' };
      }
      // A real purchase, but of another app or another package: definitively not this SKU.
      if (body.target.application?.id !== config.applicationId) return { status: 'not_paid' };
      if (body.target.package.id !== sku) return { status: 'not_paid' };
      return { status: 'paid' };
    } catch {
      return { status: 'error' };
    }
  };
}

type Environment = Record<string, string | undefined>;

/** Env-only, default off — mirrors readBazaarConfig. Unconfigured = no Sibapp path at all. */
export function readSibappConfig(environment: Environment = process.env): SibappConfig | null {
  if (environment.LEARNBOX_SIBAPP_ENABLED !== 'true') return null;
  const secretKey = environment.SIBAPP_SECRET_KEY ?? '';
  const applicationId = environment.SIBAPP_APPLICATION_ID ?? '';
  if (!secretKey || !applicationId) return null;
  return { secretKey, applicationId };
}

export function sibappVerifierFromEnvironment(
  environment: Environment = process.env,
): { verifier: StoreIabVerifier; config: SibappConfig } | null {
  const config = readSibappConfig(environment);
  if (!config) return null;
  return { verifier: createSibappVerifier(config), config };
}
