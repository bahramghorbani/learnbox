import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
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

export async function PATCH(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let pool: Pool | undefined;
  try {
    const body = (await request.json()) as { firstName?: unknown } | null;
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim().slice(0, 50) : '';
    if (!firstName) {
      return Response.json({ error: 'invalid_name' }, { status: 400, headers: privateHeaders });
    }

    pool = getPool();
    await pool.query('UPDATE users SET first_name = $1 WHERE id = $2', [firstName, userId]);

    return Response.json({ ok: true, firstName }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/profile/update] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
