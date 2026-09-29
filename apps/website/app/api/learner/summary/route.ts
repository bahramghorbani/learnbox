import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { readLearnerSummary } from '../../../../lib/learner-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'private, no-store' } as const;

type PoolHolder = { pool?: Pool };
const holder = globalThis as unknown as { __learnboxSummaryPool?: PoolHolder };

function summaryPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.__learnboxSummaryPool ??= {};
  holder.__learnboxSummaryPool.pool ??= new Pool({
    connectionString: requireVerifiedDatabaseTls(url),
    max: 2,
  });
  return holder.__learnboxSummaryPool.pool;
}

/**
 * GET /api/learner/summary?tz=<IANA zone>
 *
 * The authoritative today-count / streak / history totals, derived from the
 * append-only review history. The client renders these; it never originates them.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  let pool: Pool | null;
  try {
    pool = summaryPool();
  } catch {
    pool = null;
  }
  if (!pool) {
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  }

  try {
    const timeZone = new URL(request.url).searchParams.get('tz');
    const summary = await readLearnerSummary(pool, session.subject, timeZone);
    return Response.json(summary, { status: 200, headers: noStore });
  } catch {
    return Response.json({ error: 'serverUnavailable' }, { status: 503, headers: noStore });
  }
}
