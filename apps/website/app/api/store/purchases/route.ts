import { Pool } from 'pg';

import { authenticateLearner } from '../../../../lib/learner-auth';
import { readLearnerPurchases } from '../../../../lib/store-purchase';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * GET /api/store/purchases — «خریدهای من»: the session learner's own pack payments, newest first.
 * Ownership is the WHERE clause in `readLearnerPurchases`; commercial facts only.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return Response.json(
      { purchases: await readLearnerPurchases(pool, session.subject) },
      { headers },
    );
  } finally {
    await pool.end();
  }
}
