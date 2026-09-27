import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../lib/server/admin-auth-policy';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  return getSharedAdminDatabasePool(
    readAdminDatabaseConfig(process.env),
    (c: Record<string, unknown>) => new Pool(c),
  );
}

async function requireSession(request: Request) {
  const config = readAdminAuthConfig(process.env);
  if (!config.enabled) return null;
  const pool = getPool();
  const store = new PostgresOwnerAuthStore(pool);
  return loadAdminSession(request, config, {
    findActiveSession: store.findActiveSession.bind(store),
    touchSession: store.touchSession.bind(store),
  });
}

// GET /api/transactions — list with search, filter, pagination
export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const gateway = url.searchParams.get('gateway') || '';

  const pool = getPool();

  // Summary
  if (url.searchParams.get('summary') === 'true') {
    const s = await pool.query(`
      SELECT
        count(*) FILTER (WHERE status = 'success') as success_count,
        count(*) FILTER (WHERE status = 'failed') as failed_count,
        count(*) FILTER (WHERE status = 'pending') as pending_count,
        coalesce(sum(amount_tomans) FILTER (WHERE status = 'success'), 0) as total_tomans,
        coalesce(sum(amount_usdt) FILTER (WHERE status = 'success'), 0) as total_usdt,
        coalesce(sum(amount_tomans) FILTER (WHERE status = 'success' AND created_at > now() - interval '1 day'), 0) as today_tomans,
        coalesce(sum(amount_tomans) FILTER (WHERE status = 'success' AND created_at > now() - interval '7 days'), 0) as week_tomans,
        coalesce(sum(amount_tomans) FILTER (WHERE status = 'success' AND created_at > now() - interval '30 days'), 0) as month_tomans
      FROM payment_logs
    `);
    return Response.json({ summary: s.rows[0] });
  }

  const conditions: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(u.phone_e164 LIKE $${idx} OR pl.provider_ref LIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    conditions.push(`pl.status = $${idx}`);
    params.push(status);
    idx++;
  }
  if (gateway) {
    conditions.push(`pg2.type = $${idx}`);
    params.push(gateway);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT count(*) as total FROM payment_logs pl
     LEFT JOIN users u ON u.id = pl.user_id
     LEFT JOIN payment_gateways pg2 ON pg2.id = pl.gateway_id
     ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total as string, 10);

  const result = await pool.query(
    `SELECT pl.id, pl.amount_tomans, pl.amount_usdt, pl.status, pl.provider_ref,
            pl.error_message, pl.created_at, pl.completed_at,
            u.phone_e164, u.first_name,
            p.display_name as pack_name,
            pg2.name as gateway_name, pg2.type as gateway_type
       FROM payment_logs pl
       LEFT JOIN users u ON u.id = pl.user_id
       LEFT JOIN packs p ON p.id = pl.pack_id
       LEFT JOIN payment_gateways pg2 ON pg2.id = pl.gateway_id
       ${where}
       ORDER BY pl.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  return Response.json({
    transactions: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
