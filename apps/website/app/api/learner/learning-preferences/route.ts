import { Pool } from 'pg';
import { isDailyNewCardAllowance } from '@learnbox/learning-engine';

import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

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
  const rejected = guardMutation(request, { method: 'PATCH' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId)
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });

  let pool: Pool | undefined;
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('dailyNewCardAllowance' in body) ||
      !isDailyNewCardAllowance(body.dailyNewCardAllowance)
    ) {
      return Response.json(
        { error: 'invalid_daily_new_card_allowance' },
        { status: 400, headers: privateHeaders },
      );
    }

    pool = getPool();
    const result = await pool.query<{ daily_new_card_allowance: number }>(
      `UPDATE users
          SET daily_new_card_allowance = $1
        WHERE id = $2
      RETURNING daily_new_card_allowance`,
      [body.dailyNewCardAllowance, userId],
    );
    const dailyNewCardAllowance = result.rows[0]?.daily_new_card_allowance;
    if (dailyNewCardAllowance === undefined)
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    return Response.json({ dailyNewCardAllowance }, { headers: privateHeaders });
  } catch (error) {
    console.error('[learner/learning-preferences] update failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
