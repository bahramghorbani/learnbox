import { Pool } from 'pg';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

/** Media may be read only while its card and containing pack are published. */
export async function isPublishedStartContentId(contentId: string): Promise<boolean> {
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) return false;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query<{ published: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM cards c
         JOIN pack_cards pc ON pc.card_id = c.id
         JOIN packs p ON p.id = pc.pack_id AND p.status = 'published'
         JOIN card_versions cv ON cv.card_id = c.id AND cv.status = 'published'
         WHERE c.content_id = $1
       ) AS published`,
      [contentId],
    );
    return result.rows[0]?.published === true;
  } finally {
    await pool.end();
  }
}
