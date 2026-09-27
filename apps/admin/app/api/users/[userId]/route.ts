import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../../lib/server/admin-auth-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const dbConfig = readAdminDatabaseConfig(process.env);
  return getSharedAdminDatabasePool(dbConfig, (c: Record<string, unknown>) => new Pool(c));
}

async function requireSession(request: Request) {
  const config = readAdminAuthConfig(process.env);
  if (!config.enabled) return null;
  const pool = getPool();
  const store = new PostgresOwnerAuthStore(pool);
  const session = await loadAdminSession(request, config, {
    findActiveSession: store.findActiveSession.bind(store),
    touchSession: store.touchSession.bind(store),
  });
  return session;
}

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { userId } = await params;
  const pool = getPool();

  try {
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) return Response.json({ error: 'not_found' }, { status: 404 });

    const stats = await pool.query(
      `
      SELECT
        (SELECT count(*) FROM card_schedules WHERE user_id = $1) as cards_started,
        (SELECT count(*) FROM review_events WHERE user_id = $1) as total_reviews,
        (SELECT max(created_at) FROM review_events WHERE user_id = $1) as last_review_at
    `,
      [userId],
    );

    const recentReviews = await pool.query(
      `
      SELECT card_id, rating, created_at
      FROM review_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [userId],
    );

    return Response.json({
      user: user.rows[0],
      stats: stats.rows[0],
      recentReviews: recentReviews.rows,
    });
  } catch (error) {
    console.error('[admin/users/detail] query failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { userId } = await params;
  const pool = getPool();
  const body = (await request.json()) as { action: string };

  try {
    if (body.action === 'reset_progress') {
      await pool.query('DELETE FROM review_events WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM card_schedules WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM learner_reconciliation_cursors WHERE user_id = $1', [userId]);
      return Response.json({ status: 'progress_reset' });
    }

    return Response.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    console.error('[admin/users/action] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
