/**
 * Phase 1 / Milestone 1.5 — private storage for generated card media.
 *
 * Generated card images and audio are PROTECTED LEARNING CONTENT. They are never written to a
 * public static path and are only ever read back through an authenticated Admin route.
 *
 * Bytes are stored ONLY as immutable files under LEARNBOX_CARD_MEDIA_DIR (migrations 0061/0062):
 * the database row keeps the key, size and checksum, and a CHECK constraint refuses bytes in the
 * database. Every read verifies the file against the row.
 *
 * `object_key` is kept as the opaque identity for an asset, and every access goes through the
 * `CardMediaStorage` interface, so moving bytes to private object storage later is a substitution
 * of this one module rather than a schema or call-site change.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

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
  /**
   * Stores bytes under a caller-built object key using the caller's query runner, so a write can
   * join the caller's transaction. With file storage the file is written (and verified) first; if
   * the surrounding transaction later rolls back, the caller removes the orphan with `discardFile`.
   */
  storeWithin(
    runner: DatabasePool,
    objectKey: string,
    mediaType: string,
    bytes: Buffer,
    checksum: string,
  ): Promise<void>;
  /** Removes a file written by `storeWithin` whose row never committed. */
  discardFile(objectKey: string): Promise<void>;
  read(objectKey: string): Promise<Buffer>;
  remove(objectKey: string): Promise<void>;
}

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
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

const OBJECT_KEY_SHAPE =
  /^admin\/card-media\/[a-z0-9-]{1,128}\/(image|word_audio|sentence_audio)\/[0-9a-f-]{36}\.(png|jpg|webp|mp3)$/;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Maps an object key to its file. The key shape is enforced here AND by a database CHECK, and the
 * resolved path must stay inside the media root, so no row can ever name a file outside it.
 */
export function cardMediaFilePath(root: string, objectKey: string): string {
  if (!OBJECT_KEY_SHAPE.test(objectKey)) throw new Error('کلید رسانه معتبر نیست.');
  const base = path.resolve(root);
  const file = path.resolve(base, objectKey);
  if (!file.startsWith(base + path.sep)) throw new Error('کلید رسانه معتبر نیست.');
  return file;
}

/**
 * Writes immutable bytes atomically (temp file + fsync + rename) and proves the result by reading
 * it back. An existing file with identical bytes is accepted (idempotent retry); different bytes
 * under the same key are refused, so a file is never silently overwritten.
 */
export async function writeCardMediaFile(
  root: string,
  objectKey: string,
  bytes: Buffer,
  checksum: string,
): Promise<void> {
  if (sha256(bytes) !== checksum) throw new Error('چک‌سام رسانه با محتوا نمی‌خواند.');
  const file = cardMediaFilePath(root, objectKey);
  const existing = await readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) {
    if (sha256(existing) === checksum) return;
    throw new Error('فایل دیگری با همین کلید رسانه وجود دارد.');
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o750 });
  const temp = `${file}.tmp-${randomUUID()}`;
  const handle = await open(temp, 'wx', 0o640);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  const written = await readFile(file);
  if (written.length !== bytes.length || sha256(written) !== checksum) {
    throw new Error('فایل رسانه پس از نوشتن تأیید نشد.');
  }
}

/** Reads a media file and refuses to return bytes that do not match the database record. */
export async function readVerifiedCardMediaFile(
  root: string,
  objectKey: string,
  checksum: string,
  byteSize: number,
): Promise<Buffer> {
  const bytes = await readFile(cardMediaFilePath(root, objectKey));
  if (bytes.length !== byteSize || sha256(bytes) !== checksum) {
    throw new Error('فایل رسانه با رکورد پایگاه داده نمی‌خواند.');
  }
  return bytes;
}

/**
 * File-backed card media storage. Bytes live in immutable files under `root`; the database row
 * keeps the key, size and checksum with `bytes = NULL`.
 */
export function createFileCardMediaStorage(pool: DatabasePool, root: string): CardMediaStorage {
  // A relative or empty root would resolve against the working directory.
  if (!path.isAbsolute(root)) throw new Error('LEARNBOX_CARD_MEDIA_DIR must be an absolute path.');
  return {
    async store(contentId, kind, mediaType, bytes) {
      if (!bytes.length) throw new Error('رسانهٔ خالی ذخیره نمی‌شود.');
      const objectKey = buildCardMediaObjectKey(contentId, kind, mediaType);
      const checksum = sha256(bytes);
      await this.storeWithin(pool, objectKey, mediaType, bytes, checksum);
      return { objectKey, checksum, byteSize: bytes.length };
    },

    async storeWithin(runner, objectKey, mediaType, bytes, checksum) {
      await writeCardMediaFile(root, objectKey, bytes, checksum);
      try {
        await runner.query(
          `INSERT INTO card_media_objects (object_key, media_type, byte_size, checksum, bytes)
           VALUES ($1, $2, $3, $4, NULL)`,
          [objectKey, mediaType, bytes.length, checksum],
        );
      } catch (error) {
        await this.discardFile(objectKey);
        throw error;
      }
    },

    async discardFile(objectKey) {
      await unlink(cardMediaFilePath(root, objectKey)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    },

    async read(objectKey) {
      const result = await pool.query(
        'SELECT checksum, byte_size FROM card_media_objects WHERE object_key = $1',
        [objectKey],
      );
      const row = result.rows[0];
      if (!row) throw new Error('رسانهٔ ذخیره‌شده یافت نشد.');
      return readVerifiedCardMediaFile(
        root,
        objectKey,
        String(row.checksum),
        Number(row.byte_size),
      );
    },

    /** Only for a candidate whose row could not be written; accepted media is never removed. */
    async remove(objectKey) {
      await pool.query('DELETE FROM card_media_objects WHERE object_key = $1', [objectKey]);
      await this.discardFile(objectKey);
    },
  };
}

/** Card media has no database fallback: without LEARNBOX_CARD_MEDIA_DIR, media storage refuses to start. */
export function createCardMediaStorage(
  pool: DatabasePool,
  environment: Record<string, string | undefined> = process.env,
): CardMediaStorage {
  return createFileCardMediaStorage(pool, environment.LEARNBOX_CARD_MEDIA_DIR?.trim() ?? '');
}
