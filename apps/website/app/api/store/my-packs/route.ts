import { Pool } from 'pg';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
}

// GET /api/store/my-packs — user's activated packs with progress
export async function GET(request: Request) {
  const session = readLearnerSession(request);
  if (!session?.subject) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id::text = $1 OR phone_e164 = $1 LIMIT 1',
      [session.subject],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      return Response.json({ packs: [] });
    }

    const result = await pool.query(
      `SELECT up.pack_id, up.acquired_at, up.acquisition_type,
              p.display_name, p.target_cefr, p.category,
              (SELECT count(*) FROM pack_cards WHERE pack_id = up.pack_id) as total_cards,
              (SELECT count(*) FROM pack_cards pc
                JOIN card_schedules cs ON cs.card_id = pc.card_id AND cs.user_id = $1
               WHERE pc.pack_id = up.pack_id AND cs.state = 'learned') as learned_cards
         FROM user_packs up
         JOIN packs p ON p.id = up.pack_id
        WHERE up.user_id = $1
        ORDER BY up.acquired_at DESC`,
      [userId],
    );

    return Response.json({ packs: result.rows });
  } catch (err) {
    console.error('[store/my-packs]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
