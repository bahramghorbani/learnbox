import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { readProfileDetails } from '../../../../../lib/learner-profile-fields';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

/** LB-B28a: the learner's own optional profile fields. Personal data: private, never cached. */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let pool: Pool | undefined;
  try {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
    const details = await readProfileDetails(pool, userId);
    if (!details) {
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    }
    return Response.json({ profile: details }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/profile/details] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
