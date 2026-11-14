import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

export type PublishedMediaKind = 'image' | 'word_audio' | 'sentence_audio';

const OBJECT_KEY_SHAPE =
  /^admin\/card-media\/[a-z0-9-]{1,128}\/(image|word_audio|sentence_audio)\/[0-9a-f-]{36}\.(png|jpg|webp|mp3)$/;

/**
 * Reads a moved media file (migration 0061) from the read-only media root and refuses bytes that do
 * not match the size and checksum the database pinned at publication.
 */
export async function readPublishedCardMediaFile(
  root: string,
  objectKey: string,
  checksum: string,
  byteSize: number,
): Promise<Buffer> {
  if (!OBJECT_KEY_SHAPE.test(objectKey)) throw new Error('invalid media key');
  const base = path.resolve(root);
  const file = path.resolve(base, objectKey);
  if (!file.startsWith(base + path.sep)) throw new Error('invalid media key');
  const bytes = await readFile(file);
  if (bytes.length !== byteSize || createHash('sha256').update(bytes).digest('hex') !== checksum) {
    throw new Error('media file does not match its record');
  }
  return bytes;
}

/**
 * Bytes of the media pinned in a card's latest PUBLISHED version (Admin-generated packs). Starter
 * media keeps its file path; this is the path for every other pack.
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
  let row:
    | {
        media_type: string;
        object_key: string;
        checksum: string;
        byte_size: number;
      }
    | undefined;
  try {
    // Migration 0061: a SECURITY DEFINER function returns only the object pinned in the latest
    // published version (key AND checksum must match); the learner role has no table grant.
    const result = await pool.query<NonNullable<typeof row>>(
      'SELECT media_type, object_key, checksum, byte_size FROM learner_published_card_media_ref($1, $2)',
      [contentId, kind],
    );
    row = result.rows[0];
  } finally {
    await pool.end();
  }
  if (!row) return null;
  const root = process.env.LEARNBOX_CARD_MEDIA_DIR?.trim();
  if (!root) throw new Error('LEARNBOX_CARD_MEDIA_DIR is not configured');
  const bytes = await readPublishedCardMediaFile(
    root,
    row.object_key,
    row.checksum,
    Number(row.byte_size),
  );
  return { mediaType: row.media_type, bytes };
}
