import { Pool } from 'pg';

import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';
import { activateFreePack } from '../../../../lib/store-activation';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * POST /api/store/activate — canonical FREE pack acquisition (Phase 2 / M2.3).
 *
 * Free packs only. The body carries a pack id and nothing else: price, free/paid state, publication
 * state, listing state and ownership are read from the database, never from the client.
 *
 * Thin handler. The decision and the write are one statement in `lib/store-activation`, so the
 * eligibility check cannot be raced by an unpublish or an unlist between check and insert.
 *
 * Repeating the call is safe and reports success — the `UNIQUE (user_id, pack_id)` constraint, not
 * a prior read, is what keeps exactly one entitlement row.
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
    const outcome = await activateFreePack(pool, session.subject, packId);
    if (outcome.status === 'denied') {
      // 404 for a pack that is not on offer, so an unlisted or unpublished pack is indistinguishable
      // from one that does not exist. 409 for a real pack that free acquisition does not apply to.
      const status = outcome.reason === 'unavailable' ? 404 : 409;
      return Response.json({ error: outcome.reason }, { status, headers });
    }
    return Response.json({ status: outcome.status, packId }, { headers });
  } finally {
    await pool.end();
  }
}
