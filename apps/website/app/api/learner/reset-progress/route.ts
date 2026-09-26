import { Pool } from 'pg';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url });
}

export async function POST(request: Request): Promise<Response> {
  const session = readLearnerSession(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { confirm?: boolean };
    if (!body.confirm) {
      return Response.json({ error: 'confirmation_required' }, { status: 400 });
    }

    const pool = getPool();

    // Delete learning progress only — preserve purchases and entitlements
    try {
      await pool.query('BEGIN');
      const schedules = await pool.query(
        'DELETE FROM card_schedules WHERE user_id = $1',
        [userId],
      );
      const reviews = await pool.query(
        'DELETE FROM review_events WHERE user_id = $1',
        [userId],
      );
      await pool.query(
        'DELETE FROM learner_reconciliation_cursors WHERE user_id = $1',
        [userId],
      );
      await pool.query('COMMIT');

      console.log(
        `[learner/reset] user=${userId} deleted ${schedules.rowCount} schedules, ${reviews.rowCount} reviews`,
      );

      return Response.json({
        ok: true,
        deleted: {
          schedules: schedules.rowCount,
          reviews: reviews.rowCount,
        },
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (error) {
    console.error('[learner/reset-progress] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
