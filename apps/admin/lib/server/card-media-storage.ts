/**
 * Phase 1 / Milestone 1.5 — private storage for generated card media.
 *
 * Generated card images and audio are PROTECTED LEARNING CONTENT. They are never written to a
 * public static path and are only ever read back through an authenticated Admin route.
 *
 * Bytes are stored in the database, following the same approach the owner-splash media already
 * uses for environments without a blob token (`database-splash-storage`). That choice is deliberate
 * and avoids a new durable-storage decision: it needs no additional credential and works on the
 * Production VPS as well as on staging. Card media is small — a 1024x1024 image and a few seconds
 * of mp3 — so this is not the large-object case object storage exists for.
 *
 * `object_key` is kept as the opaque identity for an asset, and every access goes through the
 * `CardMediaStorage` interface, so moving bytes to private object storage later is a substitution
 * of this one module rather than a schema or call-site change.
 */

import { createHash, randomUUID } from 'node:crypto';

export type CardMediaKind = 'image' | 'word_audio' | 'sentence_audio';

type QueryResult = { rows: Record<string, unknown>[] };
type DatabasePool = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

export interface StoredCardMedia {
  objectKey: string;
  checksum: string;
  byteSize: number;
}

/** The storage contract the generation service depends on. */
export interface CardMediaStorage {
  store(
    contentId: string,
    kind: CardMediaKind,
    mediaType: string,
    bytes: Buffer,
  ): Promise<StoredCardMedia>;
  read(objectKey: string): Promise<Buffer>;
  remove(objectKey: string): Promise<void>;
}

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'audio/mpeg': 'mp3',
};

/**
 * Builds the object key. The card's canonical content id and the media kind are in the path so an
 * object is traceable to its card, and a fresh UUID guarantees a new candidate never overwrites the
 * object backing media that is already accepted.
 */
export function buildCardMediaObjectKey(
  contentId: string,
  kind: CardMediaKind,
  mediaType: string,
): string {
  const extension = EXTENSION_BY_MEDIA_TYPE[mediaType];
  if (!extension) throw new Error(`نوع رسانه پشتیبانی نمی‌شود: ${mediaType}`);
  // Mirrors the key shape the database CHECK constraint enforces.
  const safeContentId = contentId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 128);
  return `admin/card-media/${safeContentId}/${kind}/${randomUUID()}.${extension}`;
}

/** Database-backed card media storage. */
export function createDatabaseCardMediaStorage(pool: DatabasePool): CardMediaStorage {
  return {
    async store(contentId, kind, mediaType, bytes) {
      if (!bytes.length) throw new Error('رسانهٔ خالی ذخیره نمی‌شود.');
      const objectKey = buildCardMediaObjectKey(contentId, kind, mediaType);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      await pool.query(
        `INSERT INTO card_media_objects (object_key, media_type, byte_size, checksum, bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [objectKey, mediaType, bytes.length, checksum, bytes],
      );
      return { objectKey, checksum, byteSize: bytes.length };
    },

    async read(objectKey) {
      const result = await pool.query(
        'SELECT bytes FROM card_media_objects WHERE object_key = $1',
        [objectKey],
      );
      const row = result.rows[0];
      if (!row) throw new Error('رسانهٔ ذخیره‌شده یافت نشد.');
      return Buffer.from(row.bytes as Buffer);
    },

    /**
     * Deletes stored bytes. Used only for a candidate whose row could not be written — never for
     * media that is accepted or superseded, so acceptance history stays auditable.
     */
    async remove(objectKey) {
      await pool.query('DELETE FROM card_media_objects WHERE object_key = $1', [objectKey]);
    },
  };
}
