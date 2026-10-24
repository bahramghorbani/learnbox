/**
 * Database-backed splash storage.
 *
 * Mirrors `card-media-storage.ts`'s `createDatabaseCardMediaStorage`: bytes live in their own
 * table keyed by object_key, with no dependency on an external blob provider or credential. Used
 * by `admin-splash-server.ts` as the fallback when BLOB_READ_WRITE_TOKEN is not configured, so
 * splash replacement works on a self-hosted deployment with no Vercel Blob account.
 */

type QueryResult = { rows: Record<string, unknown>[] };
type DatabasePool = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

export function createDatabaseSplashStorage(pool: DatabasePool) {
  return {
    async read(objectKey: string): Promise<ReadableStream<Uint8Array> | undefined> {
      const result = await pool.query(
        'SELECT bytes FROM splash_media_objects WHERE object_key = $1',
        [objectKey],
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const buffer = Buffer.from(row.bytes as Buffer);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      });
    },

    async upload(objectKey: string, bytes: Buffer, contentType: 'image/webp'): Promise<void> {
      if (!bytes.length) throw new Error('رسانهٔ خالی ذخیره نمی‌شود.');
      await pool.query(
        `INSERT INTO splash_media_objects (object_key, media_type, byte_size, bytes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (object_key) DO UPDATE SET bytes = EXCLUDED.bytes, byte_size = EXCLUDED.byte_size`,
        [objectKey, contentType, bytes.length, bytes],
      );
    },

    async delete(objectKey: string): Promise<void> {
      await pool.query('DELETE FROM splash_media_objects WHERE object_key = $1', [objectKey]);
    },
  };
}
