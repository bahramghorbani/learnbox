import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

export type PublishedMediaKind = 'image' | 'word_audio' | 'sentence_audio';

/**
 * Bytes of the media pinned in a card's latest PUBLISHED version (Admin-generated packs). Starter
 * media keeps its file path; this is the database path for every other pack.
 *
 * Authorization is NOT decided here: the caller has already run the canonical pack-access guard.
 */
export async function readPublishedCardMedia(
  contentId: string,
  kind: PublishedMediaKind,
): Promise<{ mediaType: string; bytes: Buffer } | null> {
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL) return null;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    // Migration 0038: a SECURITY DEFINER function returns only the object pinned in the latest
    // published version (key AND checksum must match); the learner role has no table grant.
    const result = await pool.query<{ media_type: string; bytes: Buffer }>(
      'SELECT media_type, bytes FROM learner_published_card_media($1, $2)',
      [contentId, kind],
    );
    const row = result.rows[0];
    return row ? { mediaType: row.media_type, bytes: row.bytes } : null;
  } finally {
    await pool.end();
  }
}
