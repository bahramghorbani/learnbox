import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import { disableReminderSubscription } from '../../../../../lib/push-subscription-store';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
}

export async function POST(request: Request): Promise<Response> {
  // LB-B29: same-origin JSON only, decided before the session is read.
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let pool: Pool | undefined;
  try {
    pool = getPool();
    await disableReminderSubscription(pool, userId);
    return Response.json({ ok: true, enabled: false }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/notifications/unsubscribe] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
