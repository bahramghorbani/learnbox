import { Pool } from 'pg';

import { authenticateLearner } from '../../../../lib/learner-auth';
import { readLearnerPacks } from '../../../../lib/store-catalogue';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * GET /api/store/my-packs — what this learner may actually access (Phase 2 / M2.2, read-only).
 *
 * Answers the same question the content guards answer, so the library screen and the content
 * endpoints can never disagree. A free published pack appears here even though `user_packs` is
 * empty, which is how the current Start Pack keeps working without a backfill.
 *
 * Thin handler: authenticate, then delegate to the canonical read model in
 * `lib/store-catalogue`, which derives visibility from the one pack-access rule.
 *
 * Authenticated: LearnBox is closed and no catalogue is public, so anonymous callers get 401.
 * Contained by the same `WEB_LEARNER_STATE_ENABLED` + `DATABASE_URL` gate as every other
 * learner database route, so no new feature flag is introduced.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return Response.json({ packs: await readLearnerPacks(pool, session.subject) }, { headers });
  } finally {
    await pool.end();
  }
}
