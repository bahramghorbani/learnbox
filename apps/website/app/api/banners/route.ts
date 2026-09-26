import { Pool } from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/banners — returns active banners for the app */
export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ banners: [] });
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await pool.query(
      `SELECT id, title, description, image_url, background_color, link_url, link_type, link_target
       FROM banners
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 5`
    );
    return Response.json({ banners: result.rows });
  } catch {
    return Response.json({ banners: [] });
  } finally {
    await pool.end();
  }
}
