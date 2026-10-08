import { get as getBlob } from '@vercel/blob';
import { Pool } from 'pg';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

export type LaunchSplashConfig = {
  databaseUrl: string;
  /**
   * Vercel Blob is the LEGACY storage path. The canonical splash bytes live in
   * `splash_versions.image_data`, which the route below reads first, so a missing token must not
   * disable delivery — it only removes the blob fallback. Requiring it here made an owner-promoted
   * splash unreachable (404) on a deployment that stores its bytes in PostgreSQL.
   */
  blobToken?: string;
};

export function readLaunchSplashConfig(environment: Environment): LaunchSplashConfig | null {
  if (environment.LEARNBOX_DYNAMIC_SPLASH_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const blobToken = environment.BLOB_READ_WRITE_TOKEN ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.set('sslmode', 'verify-full');
    return blobToken
      ? { databaseUrl: parsed.toString(), blobToken }
      : { databaseUrl: parsed.toString() };
  } catch {
    return null;
  }
}

export function createLaunchSplashRoute(dependencies: {
  enabled: boolean;
  pool?: Queryable;
  readBlob?: (objectKey: string) => Promise<ReadableStream<Uint8Array> | undefined>;
}) {
  return async function GET() {
    if (!dependencies.enabled || !dependencies.pool) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    try {
      // Try DB image_data first (works without Vercel Blob)
      const dbResult = await dependencies.pool.query(
        `SELECT sv.image_data, sv.media_type
           FROM current_splash cs
           JOIN splash_versions sv ON sv.id = cs.version_id
          WHERE cs.singleton_id = 1
            AND sv.image_data IS NOT NULL
          LIMIT 1`,
      );
      if (dbResult.rows[0]?.image_data) {
        const imageData = dbResult.rows[0].image_data as Buffer;
        const mediaType = (dbResult.rows[0].media_type as string) || 'image/webp';
        return new Response(new Uint8Array(imageData), {
          headers: {
            // The launch image is deliberately pre-authentication content, so it may be cached —
            // but a revert to the bundled default must become visible quickly, which bounds the
            // lifetime to a minute rather than an hour.
            'Cache-Control': 'public, max-age=60',
            'Content-Type': mediaType,
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      // Fallback to Vercel Blob if readBlob is available
      if (dependencies.readBlob) {
        const result = await dependencies.pool.query(
          `SELECT sv.object_key
             FROM current_splash cs
             JOIN splash_versions sv ON sv.id = cs.version_id
            WHERE cs.singleton_id = 1
            LIMIT 1`,
        );
        const objectKey = result.rows[0]?.object_key;
        if (
          typeof objectKey !== 'string' ||
          !/^admin\/splash\/[a-z0-9-]{3,64}\.webp$/.test(objectKey)
        ) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
        const stream = await dependencies.readBlob(objectKey);
        if (!stream) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
          });
        }
        return new Response(stream, {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'image/webp',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch {
      return new Response('Splash unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

type LaunchSplashGlobal = typeof globalThis & {
  learnboxLaunchSplashPool?: { databaseUrl: string; pool: Pool };
};

function splashPool(databaseUrl: string) {
  const shared = globalThis as LaunchSplashGlobal;
  if (shared.learnboxLaunchSplashPool?.databaseUrl === databaseUrl) {
    return shared.learnboxLaunchSplashPool.pool;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxLaunchSplashPool = { databaseUrl, pool };
  return pool;
}

export function launchSplashRouteFromEnvironment(environment: Environment = process.env) {
  const config = readLaunchSplashConfig(environment);
  if (!config) return undefined;
  const blobToken = config.blobToken;
  return createLaunchSplashRoute({
    enabled: true,
    pool: splashPool(config.databaseUrl),
    // Only offered when a token exists; the DB-first read above is the canonical path.
    readBlob: blobToken
      ? async (objectKey) => {
          const result = await getBlob(objectKey, { access: 'private', token: blobToken });
          return result?.stream ?? undefined;
        }
      : undefined,
  });
}
