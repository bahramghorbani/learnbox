import { Pool } from 'pg';
import { readLearnerSession } from '../../../lib/server-session';
import { requireVerifiedDatabaseTls } from '../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/banners — returns active banners for the app */
export async function GET(request: Request): Promise<Response> {
  if (!readLearnerSession(request))
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  const url = process.env.DATABASE_URL;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!url) return Response.json({ banners: [] }, { headers });
  const pool = new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
  try {
    const result = await pool.query(
      `SELECT id, title, description, image_url, background_color, link_url, link_type, link_target
       FROM banners
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
         -- Paid packs/store and timed promotions are outside the v1 release.
         AND link_type = 'screen'
         AND link_url IN ('today', 'words', 'progress', 'profile')
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 5`,
    );
    return Response.json({ banners: result.rows }, { headers });
  } catch {
    return Response.json({ banners: [] }, { headers });
  } finally {
    await pool.end();
  }
}
