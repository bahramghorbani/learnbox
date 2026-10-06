import { Pool } from 'pg';

import { authenticateLearner } from '../../../../lib/learner-auth';
import { readStoreCatalogue } from '../../../../lib/store-catalogue';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * GET /api/store/packs — the learner Store catalogue (Phase 2 / M2.2, read-only).
 *
 * Visibility requires BOTH canonical content publication AND a listed Store Listing: a pack whose
 * commercial fields are being prepared ahead of launch stays invisible, and a listed pack whose
 * content is not published can never be advertised as available.
 *
 * Commercial presentation only — no lemma, translation, example sentence or media bytes, because a
 * catalogue must be safe to show someone who owns nothing.
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
    return Response.json({ packs: await readStoreCatalogue(pool, session.subject) }, { headers });
  } finally {
    await pool.end();
  }
}
