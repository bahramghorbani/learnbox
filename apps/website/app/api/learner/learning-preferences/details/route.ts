import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../lib/learner-auth';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId)
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });

  let pool: Pool | undefined;
  try {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
    const result = await pool.query<{ daily_new_card_allowance: number }>(
      'SELECT daily_new_card_allowance FROM users WHERE id = $1',
      [userId],
    );
    const dailyNewCardAllowance = result.rows[0]?.daily_new_card_allowance;
    if (dailyNewCardAllowance === undefined)
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    return Response.json({ dailyNewCardAllowance }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/learning-preferences] read failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
