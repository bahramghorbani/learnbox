import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../lib/server/admin-auth-policy';
import { legacyAdminRouteGate } from '../../../lib/server/admin-legacy-routes';

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

// GET /api/gateways — list payment gateways
export async function GET(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, name, type, is_active, created_at FROM payment_gateways ORDER BY created_at`,
  );
  return Response.json({ gateways: result.rows });
}

// POST /api/gateways — add gateway
export async function POST(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { name, type, config } = body;
  if (!name || !type) return Response.json({ error: 'name_and_type_required' }, { status: 400 });

  const pool = getPool();
  await pool.query(
    `INSERT INTO payment_gateways (name, type, config, is_active) VALUES ($1, $2, $3, false)`,
    [name, type, JSON.stringify(config || {})],
  );
  return Response.json({ status: 'created' }, { status: 201 });
}

// PATCH /api/gateways — toggle active
export async function PATCH(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { id, is_active } = body;
  if (!id) return Response.json({ error: 'id_required' }, { status: 400 });

  const pool = getPool();
  await pool.query(`UPDATE payment_gateways SET is_active = $1 WHERE id = $2`, [!!is_active, id]);
  return Response.json({ status: 'updated' });
}
