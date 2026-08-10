import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLaunchSplashRoute, readLaunchSplashConfig } from '../lib/launch-splash';

const environment = {
  LEARNBOX_DYNAMIC_SPLASH_ENABLED: 'true',
  DATABASE_URL: 'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_token_value',
};

describe('learner launch splash delivery', () => {
  it('fails closed unless the exact flag and both private dependencies are present', () => {
    expect(readLaunchSplashConfig({})).toBeNull();
    expect(
      readLaunchSplashConfig({ ...environment, LEARNBOX_DYNAMIC_SPLASH_ENABLED: 'TRUE' }),
    ).toBeNull();
    expect(readLaunchSplashConfig({ ...environment, DATABASE_URL: '' })).toBeNull();
    expect(readLaunchSplashConfig({ ...environment, BLOB_READ_WRITE_TOKEN: '' })).toBeNull();
    expect(readLaunchSplashConfig(environment)).toMatchObject({
      blobToken: environment.BLOB_READ_WRITE_TOKEN,
    });
  });

  it('streams only the current private WebP through a same-origin no-store response', async () => {
    const keys: string[] = [];
    const handler = createLaunchSplashRoute({
      enabled: true,
      pool: {
        query: async () => ({ rows: [{ object_key: 'admin/splash/version-1.webp' }] }),
      },
      readBlob: async (objectKey) => {
        keys.push(objectKey);
        return new ReadableStream({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3]));
            controller.close();
          },
        });
      },
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(keys).toEqual(['admin/splash/version-1.webp']);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('refuses an invalid database object key before accessing private storage', async () => {
    let reads = 0;
    const handler = createLaunchSplashRoute({
      enabled: true,
      pool: {
        query: async () => ({ rows: [{ object_key: 'https://public.example/splash.webp' }] }),
      },
      readBlob: async () => {
        reads += 1;
        return undefined;
      },
    });

    expect((await handler()).status).toBe(404);
    expect(reads).toBe(0);
  });

  it('keeps the Next route node-only, dynamic and environment-gated', async () => {
    const route = await readFile(resolve(process.cwd(), 'app/api/launch/splash/route.ts'), 'utf8');
    expect(route).toContain("export const runtime = 'nodejs'");
    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).toContain('launchSplashRouteFromEnvironment');
  });
});
