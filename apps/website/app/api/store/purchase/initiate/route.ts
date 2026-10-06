import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import { createPurchase } from '../../../../../lib/store-purchase';
import { zarinpalProviderFromEnvironment } from '../../../../../lib/zarinpal-config';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * POST /api/store/purchase/initiate — start a paid pack acquisition (Phase 2 / M2.4).
 *
 * The body carries a pack id and nothing else. The amount is read from the canonical pack inside
 * the purchase module and snapshotted on the transaction; a client-supplied price, free/paid flag
 * or ownership claim is not read at all.
 *
 * Grants nothing. It records a `pending` transaction and returns the gateway URL. The entitlement
 * can only come from the callback route, after the provider confirms the payment.
 */
export async function POST(request: Request): Promise<Response> {
  // Same-origin JSON only, decided before the session is read (LB-B29 pattern).
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }

  // No merchant credential configured means no paid flow at all, rather than a half-working one.
  const zarinpal = zarinpalProviderFromEnvironment(process.env);
  if (!zarinpal) {
    return Response.json({ error: 'paymentUnavailable' }, { status: 503, headers });
  }

  let packId: unknown;
  try {
    packId = ((await request.json()) as { packId?: unknown })?.packId;
  } catch {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }
  if (typeof packId !== 'string' || packId.length === 0) {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const outcome = await createPurchase(
      {
        pool,
        provider: zarinpal.provider,
        callbackOrigin: zarinpal.config.callbackOrigin,
        sandbox: zarinpal.config.sandbox,
      },
      { userId: session.subject, packId },
    );

    switch (outcome.status) {
      case 'created':
        return Response.json(
          {
            status: 'created',
            purchaseId: outcome.purchaseId,
            redirectUrl: outcome.redirectUrl,
            amountTomans: outcome.amountTomans,
          },
          { headers },
        );
      case 'denied':
        // 404 for a pack that is not on offer, so unlisted and unpublished are indistinguishable
        // from absent. 409 for a real pack this operation does not apply to.
        return Response.json(
          { error: outcome.reason },
          { status: outcome.reason === 'unavailable' ? 404 : 409, headers },
        );
      case 'provider_rejected':
      case 'provider_error':
        // The gateway's own error codes are operational detail, not learner-facing information.
        return Response.json({ error: 'paymentUnavailable' }, { status: 502, headers });
    }
  } finally {
    await pool.end();
  }
}
