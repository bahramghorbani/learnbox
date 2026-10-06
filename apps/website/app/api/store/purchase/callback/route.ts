import { Pool } from 'pg';

import { verifyPurchase } from '../../../../../lib/store-purchase';
import { zarinpalProviderFromEnvironment } from '../../../../../lib/zarinpal-config';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store/purchase/callback — the Zarinpal return URL (Phase 2 / M2.4).
 *
 * This is a GET that settles a transaction, which is the gateway's contract, not a choice: Zarinpal
 * returns the learner's BROWSER here with `Authority` and `Status` in the query string. Three
 * things make that safe:
 *
 *   * The query parameters are not proof. `Status=OK` triggers a verification call to Zarinpal with
 *     the stored amount; only Zarinpal's answer settles the transaction. A forged
 *     `?Status=OK&Authority=...` either matches no transaction, or matches one Zarinpal will say is
 *     unpaid.
 *   * It is idempotent. Settlement is guarded by `status = 'pending'` in the UPDATE, so a replayed
 *     callback — by refresh, by history, by an attacker — produces no second transaction and no
 *     second entitlement.
 *   * It is not authenticated, and deliberately so. The learner may return in a different browser
 *     context, and the entitlement goes to `purchase_events.user_id` regardless of who opens this
 *     URL. A second learner replaying it cannot acquire anything; they would only settle the
 *     original buyer's purchase. Consequently `guardMutation` is NOT applied: a same-origin check
 *     would reject the gateway's own redirect.
 *
 * It never renders a result. It redirects into the learner app with the internal transaction id,
 * and the result surface reads the outcome from the authenticated status endpoint — so the outcome
 * a learner sees is always fetched as themselves, never taken from a URL they arrived on.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const authority = url.searchParams.get('Authority') ?? '';
  const callbackStatus = url.searchParams.get('Status');

  const appOrigin = process.env.LEARNBOX_PUBLIC_APP_ORIGIN ?? url.origin;
  const redirect = (query: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${appOrigin}/?${query}`,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });

  const zarinpal = zarinpalProviderFromEnvironment(process.env);
  if (!zarinpal || process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return redirect('purchase=unavailable');
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const outcome = await verifyPurchase(
      { pool, provider: zarinpal.provider },
      { authority, callbackStatus },
    );
    if (outcome.status === 'unknown') return redirect('purchase=unknown');
    // Only the internal transaction id travels in the URL. No amount, no pack, no gateway
    // reference, no claim of success — the app fetches all of that as the authenticated learner.
    return redirect(`purchase=${encodeURIComponent(outcome.purchaseId)}`);
  } catch {
    // An unexpected failure here must not read as a failed payment: the learner may have paid.
    return redirect('purchase=error');
  } finally {
    await pool.end();
  }
}
