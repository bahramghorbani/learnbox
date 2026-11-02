import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';
import { leagueEnabledFor, readLeague, setLeagueOptOut } from '../../../../lib/league';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
} as const;

const holder = globalThis as unknown as { __learnboxLeaguePool?: Pool };

function leaguePool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.__learnboxLeaguePool ??= new Pool({
    connectionString: requireVerifiedDatabaseTls(url),
    max: 2,
  });
  return holder.__learnboxLeaguePool;
}

/**
 * GET /api/learner/league — XP, level, badges and the learner's weekly league table.
 * Hidden behind LEARNBOX_LEAGUE_ENABLED: a learner outside the rollout gets `{ enabled: false }`
 * and the app shows nothing new.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!leagueEnabledFor(session.subject)) {
    return Response.json({ enabled: false }, { status: 200, headers: noStore });
  }
  let pool: Pool | null;
  try {
    pool = leaguePool();
  } catch {
    pool = null;
  }
  if (!pool)
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  try {
    const view = await readLeague(pool, session.subject);
    return Response.json({ enabled: true, ...view }, { status: 200, headers: noStore });
  } catch (error) {
    console.error(
      '[learner/league] GET failed:',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  }
}

/** POST { optOut: boolean } — hide (or show) this learner in every league table. */
export async function POST(request: Request): Promise<Response> {
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;
  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!leagueEnabledFor(session.subject)) {
    return Response.json({ error: 'notFound' }, { status: 404, headers: noStore });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const optOut = (body as { optOut?: unknown } | null)?.optOut;
  if (typeof optOut !== 'boolean') {
    return Response.json({ error: 'invalidRequest' }, { status: 400, headers: noStore });
  }
  const pool = leaguePool();
  if (!pool)
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  try {
    await setLeagueOptOut(pool, session.subject, optOut);
    return Response.json({ ok: true, optOut }, { status: 200, headers: noStore });
  } catch (error) {
    console.error(
      '[learner/league] POST failed:',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  }
}
