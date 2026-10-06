import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../lib/learner-auth';
import { readPurchaseForLearner } from '../../../../../lib/store-purchase';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * GET /api/store/purchase/status?id=… — the learner's own receipt (Phase 2 / M2.4).
 *
 * The payment result UI reads this instead of trusting the redirect it arrived on, so a hand-edited
 * URL cannot produce a success screen.
 *
 * Ownership is a WHERE clause, not a post-check: `readPurchaseForLearner` matches on both the
 * transaction id and the session's user id, so another learner's id returns 404 rather than someone
 * else's pack name and amount.
 *
 * Returns commercial facts only — pack name, amount, status, gateway reference, timestamps. No card
 * or media content, and nothing about the merchant credential.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return Response.json({ error: 'invalidRequest' }, { status: 400, headers });

  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const record = await readPurchaseForLearner(pool, session.subject, id);
    if (!record) return Response.json({ error: 'notFound' }, { status: 404, headers });
    return Response.json({ purchase: record }, { headers });
  } finally {
    await pool.end();
  }
}
