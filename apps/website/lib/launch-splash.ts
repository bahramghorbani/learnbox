import { get as getBlob } from '@vercel/blob';
import { Pool } from 'pg';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};

export type LaunchSplashConfig = {
  databaseUrl: string;
  blobToken: string;
};

export function readLaunchSplashConfig(environment: Environment): LaunchSplashConfig | null {
  if (environment.LEARNBOX_DYNAMIC_SPLASH_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const blobToken = environment.BLOB_READ_WRITE_TOKEN ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  // blobToken is optional — when absent, splash is served directly from DB image_data column
  try {
    const parsed = new URL(databaseUrl);
    parsed.searchParams.set('sslmode', 'verify-full');
    return { databaseUrl: parsed.toString(), blobToken };
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
            'Cache-Control': 'public, max-age=3600',
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
  return createLaunchSplashRoute({
    enabled: true,
    pool: splashPool(config.databaseUrl),
    readBlob: async (objectKey) => {
      const result = await getBlob(objectKey, { access: 'private', token: config.blobToken });
      return result?.stream ?? undefined;
    },
  });
}
