import { Pool } from 'pg';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
}

// POST /api/store/activate — activate a free pack
export async function POST(request: Request) {
  const session = await readLearnerSession(request);
  if (!session?.subject) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { packId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { packId } = body;
  if (!packId || typeof packId !== 'string') {
    return Response.json({ error: 'pack_id_required' }, { status: 400 });
  }

  // Resolve user_id from subject (phone hash)
  const pool = getPool();
  try {
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id::text = $1 OR phone_e164 = $1 LIMIT 1',
      [session.subject],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      return Response.json({ error: 'user_not_found' }, { status: 404 });
    }
    // Check pack exists, is published, and is free
    const pack = await pool.query(
      `SELECT id, is_free FROM packs WHERE id = $1 AND status = 'published'`,
      [packId],
    );
    if (pack.rows.length === 0) {
      return Response.json({ error: 'pack_not_found' }, { status: 404 });
    }
    if (!pack.rows[0].is_free) {
      return Response.json({ error: 'pack_not_free' }, { status: 402 });
    }

    // Check if already activated
    const existing = await pool.query(
      'SELECT id FROM user_packs WHERE user_id = $1 AND pack_id = $2',
      [userId, packId],
    );
    if (existing.rows.length > 0) {
      return Response.json({ status: 'already_active' });
    }

    // Activate: insert user_pack + add cards to card_schedules
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert user_pack
      await client.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type)
         VALUES ($1, $2, 'free')
         ON CONFLICT (user_id, pack_id) DO NOTHING`,
        [userId, packId],
      );

      // Add pack cards to user's card_schedules (only new ones)
      await client.query(
        `INSERT INTO card_schedules (user_id, card_id, state, due_at, created_at)
         SELECT $1, pc.card_id, 'new', now(), now()
           FROM pack_cards pc
          WHERE pc.pack_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM card_schedules cs
              WHERE cs.user_id = $1 AND cs.card_id = pc.card_id
            )`,
        [userId, packId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return Response.json({ status: 'activated' }, { status: 201 });
  } catch (err) {
    console.error('[store/activate]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
