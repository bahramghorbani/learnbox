import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const id = /^[a-z0-9][a-z0-9-]{1,119}$/;
export async function GET(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const session = await authenticateLearner(request);
  if (!session)
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const { packId } = await params;
  if (
    !id.test(packId) ||
    process.env.WEB_LEARNER_STATE_ENABLED !== 'true' ||
    !process.env.DATABASE_URL
  )
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const r = await pool.query(
      `SELECT o.bytes,o.media_type,o.checksum FROM packs p JOIN store_listings sl ON sl.pack_id=p.id AND sl.store_status='listed' JOIN store_pack_cover_objects o ON o.object_key=sl.cover_object_key WHERE p.id=$1 AND p.status='published'`,
      [packId],
    );
    const row = r.rows[0];
    if (!row)
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    return new Response(new Uint8Array(row.bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': row.media_type,
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${row.checksum}"`,
      },
    });
  } finally {
    await pool.end();
  }
}
