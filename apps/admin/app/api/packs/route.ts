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
  const dbConfig = readAdminDatabaseConfig(process.env);
  return getSharedAdminDatabasePool(dbConfig, (c: Record<string, unknown>) => new Pool(c));
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

// GET - list all packs (or download CSV template with ?template=csv)
export async function GET(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  // Template download still requires auth
  const rawUrl = request.url;
  console.log('[admin/packs] GET url:', rawUrl);
  if (rawUrl.includes('template=csv')) {
    const csv = `lemma,article,part_of_speech,cefr,meanings,example_de,example_fa
der Koffer,der,noun,A1,چمدان|ساک,Ich packe meinen Koffer.,من چمدانم را جمع می‌کنم.
reisen,,verb,A1,سفر کردن|مسافرت کردن,Wir reisen nach Berlin.,ما به برلین سفر می‌کنیم.
schnell,,adjective,A1,سریع|تند,Der Zug ist sehr schnell.,قطار خیلی سریع است.`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="learnbox-card-template.csv"',
      },
    });
  }

  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const pool = getPool();
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT count(*) FROM pack_cards pc WHERE pc.pack_id = p.id) as card_count
      FROM packs p
      ORDER BY p.created_at DESC
    `);
    return Response.json({ packs: result.rows });
  } catch (error) {
    console.error('[admin/packs] query failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

// POST - create new pack
export async function POST(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const pool = getPool();
  try {
    const body = (await request.json()) as {
      display_name: string;
      description?: string;
      locale?: string;
      target_cefr?: string;
      target_item_count: number;
      category?: string;
      is_free?: boolean;
      price_tomans?: number;
      ai_prompt?: string;
    };

    const id =
      body.display_name
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF]+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 60) +
      '_' +
      Date.now().toString(36);

    const result = await pool.query(
      `INSERT INTO packs (id, display_name, description, locale, target_cefr, target_item_count, category, is_free, price_tomans, ai_prompt, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
       RETURNING *`,
      [
        id,
        body.display_name,
        body.description ?? null,
        body.locale ?? 'de-DE',
        body.target_cefr ?? 'A1',
        body.target_item_count,
        body.category ?? null,
        body.is_free ?? false,
        body.price_tomans ?? null,
        body.ai_prompt ?? null,
      ],
    );

    return Response.json({ pack: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('[admin/packs] create failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

// PATCH - update pack status
export async function PATCH(request: Request) {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const pool = getPool();
  try {
    const body = (await request.json()) as { pack_id: string; status: string };
    const validStatuses = ['draft', 'ai_generated', 'needs_review', 'approved', 'published'];
    if (!validStatuses.includes(body.status)) {
      return Response.json({ error: 'invalid_status' }, { status: 400 });
    }

    const publishedAt = body.status === 'published' ? ', published_at = now()' : '';
    const result = await pool.query(
      `UPDATE packs SET status = $1${publishedAt} WHERE id = $2 RETURNING *`,
      [body.status, body.pack_id],
    );

    if (result.rows.length === 0) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    // If publishing, also publish all cards in the pack
    if (body.status === 'published') {
      await pool.query(
        `
        UPDATE card_versions SET status = 'published', published_at = now()
        WHERE card_id IN (SELECT card_id FROM pack_cards WHERE pack_id = $1)
        AND status != 'published'
      `,
        [body.pack_id],
      );
    }

    return Response.json({ pack: result.rows[0] });
  } catch (error) {
    console.error('[admin/packs] update failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
