import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Zarinpal gateway configuration STATUS for the Admin Store workspace (Phase 2 / M2.4).
 *
 * Returns whether the paid flow is enabled, which gateway environment it targets, and observed
 * evidence from `purchase_events` (verified / pending / failed counts, last verified payment).
 *
 * It never returns the merchant credential — not in full, not masked, not a hash. The underlying
 * store does not read `ZARINPAL_MERCHANT_ID` at all; credential validity is reported from the only
 * thing that genuinely proves it, namely whether a payment has ever been verified.
 *
 * There is no write method. The merchant id is provisioned as a server environment variable on the
 * learner runtime, following the same pattern as the SMS.ir credential, rather than through an
 * Admin form that would require storing a live payment secret in an application table.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.paymentConfiguration(request);
}
