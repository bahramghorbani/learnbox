import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import {
  parsePushSubscription,
  saveReminderSubscription,
} from '../../../../../lib/push-subscription-store';
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
    const body = await request.json().catch(() => null);
    const subscription = parsePushSubscription(body);
    if (!subscription) {
      return Response.json(
        { error: 'invalid_subscription' },
        { status: 400, headers: privateHeaders },
      );
    }

    pool = getPool();
    await saveReminderSubscription(pool, userId, subscription);
    return Response.json({ ok: true, enabled: true }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/notifications/subscribe] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
