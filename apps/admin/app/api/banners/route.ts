import { Pool } from 'pg';
import { legacyAdminRouteGate } from '../../../lib/server/admin-legacy-routes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: url, max: 1 });
}

/** GET /api/banners — list all banners (admin) */
export async function GET(): Promise<Response> {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC`,
    );
    return Response.json({ banners: result.rows });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}

/** POST /api/banners — create a banner */
export async function POST(request: Request): Promise<Response> {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const pool = getPool();
  try {
    const body = await request.json();
    const {
      title,
      description,
      image_url,
      background_color,
      link_url,
      link_type,
      link_target,
      sort_order,
      is_active,
      starts_at,
      ends_at,
    } = body;
    if (!title) return Response.json({ error: 'title required' }, { status: 400 });

    const result = await pool.query(
      `INSERT INTO banners (title, description, image_url, background_color, link_url, link_type, link_target, sort_order, is_active, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        title,
        description ?? null,
        image_url ?? null,
        background_color ?? '#1e293b',
        link_url ?? null,
        link_type ?? 'url',
        link_target ?? null,
        sort_order ?? 0,
        is_active ?? true,
        starts_at ?? null,
        ends_at ?? null,
      ],
    );
    return Response.json({ banner: result.rows[0] });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}

/** PUT /api/banners — update a banner (expects id in body) */
export async function PUT(request: Request): Promise<Response> {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const pool = getPool();
  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    const allowed = [
      'title',
      'description',
      'image_url',
      'background_color',
      'link_url',
      'link_type',
      'link_target',
      'sort_order',
      'is_active',
      'starts_at',
      'ends_at',
    ];
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = $${idx}`);
        vals.push(fields[key]);
        idx++;
      }
    }
    if (sets.length === 0) return Response.json({ error: 'no fields to update' }, { status: 400 });

    vals.push(id);
    const result = await pool.query(
      `UPDATE banners SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (result.rows.length === 0) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json({ banner: result.rows[0] });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}

/** DELETE /api/banners — delete a banner (expects id in query) */
export async function DELETE(request: Request): Promise<Response> {
  const disabled = legacyAdminRouteGate();
  if (disabled) return disabled;
  const pool = getPool();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'id required' }, { status: 400 });

    await pool.query('DELETE FROM banners WHERE id = $1', [id]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await pool.end();
  }
}
