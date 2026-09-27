/**
 * Database-backed splash storage — v2.
 * Stores splash images directly in the `splash_versions.image_data` column (bytea)
 * instead of Vercel Blob, so no BLOB_READ_WRITE_TOKEN is needed.
 *
 * Flow: upload() stores bytes in a temporary holding table.
 * After promoteReplacement creates the real row, a trigger-like
 * post-commit step copies image_data. We simplify by storing
 * bytes keyed by object_key, then read() fetches them.
 */

type QueryResult = { rows: Record<string, unknown>[] };
type DatabasePool = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

// In-memory buffer: upload() stores bytes here, they get written
// to splash_versions.image_data after promoteReplacement creates the row.
const pendingUploads = new Map<string, Buffer>();

export function createDatabaseSplashStorage(pool: DatabasePool) {
  return {
    async read(objectKey: string): Promise<ReadableStream<Uint8Array> | undefined> {
      const result = await pool.query(
        'SELECT image_data FROM splash_versions WHERE object_key = $1 AND image_data IS NOT NULL',
        [objectKey],
      );
      if (result.rows.length === 0) return undefined;
      const buffer = result.rows[0].image_data as Buffer;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async upload(objectKey: string, bytes: Buffer, _contentType: 'image/webp'): Promise<void> {
      // Hold bytes in memory; they'll be flushed after promoteReplacement creates the row
      pendingUploads.set(objectKey, bytes);
    },
    async delete(objectKey: string): Promise<void> {
      pendingUploads.delete(objectKey);
      await pool.query('UPDATE splash_versions SET image_data = NULL WHERE object_key = $1', [
        objectKey,
      ]);
    },
  };
}

/**
 * Call after replaceSplash() succeeds to flush the pending image_data
 * into the newly-created splash_versions row.
 */
export async function flushPendingSplashImage(
  pool: { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> },
  objectKey: string,
): Promise<void> {
  const bytes = pendingUploads.get(objectKey);
  if (!bytes) return;
  await pool.query('UPDATE splash_versions SET image_data = $1 WHERE object_key = $2', [
    bytes,
    objectKey,
  ]);
  pendingUploads.delete(objectKey);
}
