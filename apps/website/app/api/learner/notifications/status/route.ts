import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { readReminderStatus } from '../../../../../lib/push-subscription-store';
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

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let pool: Pool | undefined;
  try {
    pool = getPool();
    const status = await readReminderStatus(pool, userId);
    return Response.json(status, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/notifications/status] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
