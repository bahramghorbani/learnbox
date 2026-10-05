/**
 * Phase 1 / Milestone 1.5 — private storage for generated card media.
 *
 * Generated card images and audio are PROTECTED LEARNING CONTENT. They are written to the same
 * private object store the owner-splash media already uses — `access: 'private'`, never a public
 * static path — and are only ever read back through an authenticated Admin route. Bytes never enter
 * PostgreSQL; the database holds the opaque object key, the checksum and the attribution.
 *
 * Every dependency is injected, exactly as `private-splash-storage` does, so tests exercise the
 * real code path against an in-memory store and a future non-Vercel delivery adapter is a
 * substitution rather than a rewrite.
 */

import { del as vercelDel, get as vercelGet, put as vercelPut } from '@vercel/blob';
import { createHash, randomUUID } from 'node:crypto';

export type CardMediaKind = 'image' | 'word_audio' | 'sentence_audio';

type PutOptions = {
  access: 'private';
  addRandomSuffix: false;
  contentType: string;
  token: string;
};
type DeleteOptions = { token: string };
type GetOptions = { access: 'private'; token: string };

export interface CardMediaBlobDependencies {
  token: string;
  put?: (
    key: string,
    bytes: Buffer,
    options: PutOptions,
  ) => Promise<{ pathname?: string } | unknown>;
  get?: (key: string, options: GetOptions) => Promise<{ body?: unknown } | unknown>;
  del?: (key: string, options: DeleteOptions) => Promise<unknown>;
}

export interface StoredCardMedia {
  objectKey: string;
  checksum: string;
  byteSize: number;
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

export function createCardMediaStorage(dependencies: CardMediaBlobDependencies) {
  const put =
    dependencies.put ?? (vercelPut as unknown as NonNullable<CardMediaBlobDependencies['put']>);
  const get =
    dependencies.get ?? (vercelGet as unknown as NonNullable<CardMediaBlobDependencies['get']>);
  const del =
    dependencies.del ?? (vercelDel as unknown as NonNullable<CardMediaBlobDependencies['del']>);

  return {
    /** Writes candidate bytes and returns the integrity data persisted alongside the row. */
    async store(
      contentId: string,
      kind: CardMediaKind,
      mediaType: string,
      bytes: Buffer,
    ): Promise<StoredCardMedia> {
      if (!bytes.length) throw new Error('رسانهٔ خالی ذخیره نمی‌شود.');
      const objectKey = buildCardMediaObjectKey(contentId, kind, mediaType);
      await put(objectKey, bytes, {
        access: 'private',
        addRandomSuffix: false,
        contentType: mediaType,
        token: dependencies.token,
      });
      return {
        objectKey,
        checksum: createHash('sha256').update(bytes).digest('hex'),
        byteSize: bytes.length,
      };
    },

    /** Reads bytes back for authenticated Admin preview/playback only. */
    async read(objectKey: string): Promise<Buffer> {
      const result = (await get(objectKey, {
        access: 'private',
        token: dependencies.token,
      })) as { body?: unknown; arrayBuffer?: () => Promise<ArrayBuffer> };

      if (typeof result?.arrayBuffer === 'function') {
        return Buffer.from(await result.arrayBuffer());
      }
      if (result?.body instanceof Uint8Array) return Buffer.from(result.body);
      if (Buffer.isBuffer(result)) return result;
      throw new Error('خواندن رسانهٔ ذخیره‌شده ناموفق بود.');
    },

    /**
     * Deletes an object. Used only for a candidate whose row could not be written — never for media
     * that is accepted or superseded, so acceptance history stays auditable.
     */
    async remove(objectKey: string): Promise<void> {
      await del(objectKey, { token: dependencies.token });
    },
  };
}

export type CardMediaStorage = ReturnType<typeof createCardMediaStorage>;
