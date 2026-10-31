import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../../lib/mutation-guard';
import { iabStores, verifyStoreIabPurchase } from '../../../../../../lib/store-iab-purchase';
import { requireVerifiedDatabaseTls } from '../../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * POST /api/store/purchase/{myket|bazaar}/verify — confirm a native Android IAB receipt.
 *
 * Called by the web app after `window.LearnBoxNativeCallbacks.onPurchaseResult` delivers a
 * purchaseToken from the native buy flow (see `apps/android` NativeBridge). The body carries the
 * sku and purchaseToken the native layer captured; everything else (pack id, price, ownership) is
 * resolved server-side from `sku` via `store-iab-purchase.ts` — a client cannot claim a pack.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ store: string }> },
): Promise<Response> {
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }

  const slug = (await params).store;
  const store = Object.hasOwn(iabStores, slug) ? iabStores[slug] : undefined;
  if (!store) return Response.json({ error: 'notFound' }, { status: 404, headers });
  const configured = store.verifierFromEnvironment();
  if (!configured) {
    return Response.json({ error: 'paymentUnavailable' }, { status: 503, headers });
  }

  let body: { sku?: unknown; purchaseToken?: unknown };
  try {
    body = (await request.json()) as { sku?: unknown; purchaseToken?: unknown };
  } catch {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }
  if (
    typeof body.sku !== 'string' ||
    !body.sku ||
    typeof body.purchaseToken !== 'string' ||
    !body.purchaseToken
  ) {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: configured.verifier },
      {
        userId: session.subject,
        provider: store.provider,
        sku: body.sku,
        purchaseToken: body.purchaseToken,
      },
    );

    switch (outcome.status) {
      case 'verified':
        return Response.json(
          { status: 'verified', packId: outcome.packId, alreadyEntitled: outcome.alreadyEntitled },
          { headers },
        );
      case 'already_processed':
        return Response.json({ status: 'already_processed' }, { headers });
      case 'unknown_sku':
        return Response.json({ error: 'unknownSku' }, { status: 404, headers });
      case 'pack_denied':
        return Response.json(
          { error: outcome.reason },
          { status: outcome.reason === 'unavailable' ? 404 : 409, headers },
        );
      case 'catalog_out_of_sync':
        return Response.json({ error: 'catalogOutOfSync' }, { status: 409, headers });
      case 'not_paid':
        return Response.json({ error: 'notPaid' }, { status: 402, headers });
      case 'provider_error':
        return Response.json({ error: 'paymentUnavailable' }, { status: 502, headers });
      default:
        return Response.json({ error: 'paymentUnavailable' }, { status: 502, headers });
    }
  } finally {
    await pool.end();
  }
}
