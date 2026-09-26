import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../lib/server/admin-auth-policy';

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

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) {
    console.error('[admin/users] session check failed - returning 401');
    return new Response('Unauthorized', { status: 401 });
  }
  console.log('[admin/users] session valid for:', session.userId);

  const pool = getPool();
  const url = new URL(request.url);
  const search = url.searchParams.get('q') ?? '';
  const sort = url.searchParams.get('sort') ?? 'created_at';
  const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

  const validSorts = ['created_at', 'first_name', 'phone_e164'];
  const sortCol = validSorts.includes(sort) ? sort : 'created_at';

  let query: string;
  let params: string[];

  if (search) {
    query = `
      SELECT u.id, u.phone_e164, u.first_name, u.created_at,
        COALESCE(r.cnt, 0) as review_count,
        COALESCE(cs.cnt, 0) as cards_started,
        r.last_at as last_activity
      FROM users u
      LEFT JOIN (SELECT user_id, count(*) as cnt, max(occurred_at) as last_at FROM review_events GROUP BY user_id) r ON r.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*) as cnt FROM card_schedules GROUP BY user_id) cs ON cs.user_id = u.id
      WHERE u.phone_e164 LIKE $1 OR u.first_name ILIKE $1
      ORDER BY u.${sortCol} ${order}
    `;
    params = [`%${search}%`];
  } else {
    query = `
      SELECT u.id, u.phone_e164, u.first_name, u.created_at,
        COALESCE(r.cnt, 0) as review_count,
        COALESCE(cs.cnt, 0) as cards_started,
        r.last_at as last_activity
      FROM users u
      LEFT JOIN (SELECT user_id, count(*) as cnt, max(occurred_at) as last_at FROM review_events GROUP BY user_id) r ON r.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*) as cnt FROM card_schedules GROUP BY user_id) cs ON cs.user_id = u.id
      ORDER BY u.${sortCol} ${order}
    `;
    params = [];
  }

  try {
    const result = await pool.query(query, params);
    const total = await pool.query('SELECT count(*) as c FROM users');
    return Response.json({
      users: result.rows,
      total: Number(total.rows[0].c),
    });
  } catch (error) {
    console.error('[admin/users] query failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
