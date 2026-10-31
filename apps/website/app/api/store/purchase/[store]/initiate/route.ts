import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../../lib/mutation-guard';
import { iabStores, readPurchasableIabSku } from '../../../../../../lib/store-iab-purchase';
import { requireVerifiedDatabaseTls } from '../../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** POST /api/store/purchase/{myket|bazaar}/initiate — resolve the store's approved SKU for an offered pack. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ store: string }> },
): Promise<Response> {
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }
  const slug = (await params).store;
  const store = Object.hasOwn(iabStores, slug) ? iabStores[slug] : undefined;
  if (!store) return Response.json({ error: 'notFound' }, { status: 404, headers });
  // Never launch a store purchase this deployment could not verify afterwards.
  if (!store.verifierFromEnvironment()) {
    return Response.json({ error: 'paymentUnavailable' }, { status: 503, headers });
  }

  let packId: unknown;
  try {
    packId = ((await request.json()) as { packId?: unknown }).packId;
  } catch {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }
  if (typeof packId !== 'string' || !packId) {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers });
  }

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const outcome = await readPurchasableIabSku(pool, session.subject, store.provider, packId);
    if (outcome.ok) return Response.json({ sku: outcome.sku }, { headers });
    return Response.json(
      { error: outcome.reason },
      { status: outcome.reason === 'unavailable' ? 404 : 409, headers },
    );
  } finally {
    await pool.end();
  }
}
