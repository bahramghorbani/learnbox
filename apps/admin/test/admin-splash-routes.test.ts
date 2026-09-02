import { describe, expect, it } from 'vitest';

import {
  createSplashCurrentRoute,
  createSplashPreviewRoute,
  createSplashReplaceRoute,
} from '../lib/server/admin-splash-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-08-10T14:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);

describe('owner splash routes', () => {
  it('streams the private current splash only to the authenticated owner', async () => {
    const handler = createSplashPreviewRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: {
        findActiveSession: async () => ({
          userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
          csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          recentAuthenticatedAt: now,
        }),
        touchSession: async () => true,
      },
      store: {
        getCurrentSplash: async () => ({
          versionId: 'version-1',
          objectKey: 'admin/splash/private-object.webp',
          width: 864,
          height: 1821,
          byteSize: 3,
          updatedAt: now,
        }),
      },
      storage: {
        read: async (objectKey) => {
          expect(objectKey).toBe('admin/splash/private-object.webp');
          return new ReadableStream({
            start(controller) {
              controller.enqueue(Uint8Array.from([1, 2, 3]));
              controller.close();
            },
          });
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/preview', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('returns only safe current metadata and a same-origin preview path to the owner', async () => {
    const handler = createSplashCurrentRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: {
        findActiveSession: async () => ({
          userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
          csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          recentAuthenticatedAt: now,
        }),
        touchSession: async () => true,
      },
      store: {
        getCurrentSplash: async () => ({
          versionId: 'version-1',
          objectKey: 'admin/splash/private-object.webp',
          width: 864,
          height: 1821,
          byteSize: 120_000,
          updatedAt: now,
        }),
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/current', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      current: {
        revision: 'version-1',
        width: 864,
        height: 1821,
        byteSize: 120_000,
        updatedAt: now.toISOString(),
        previewPath: '/api/splash/preview',
      },
    });
    expect(JSON.stringify(body)).not.toContain('private-object');
  });

  it('hides replacement when the dedicated server flag is disabled', async () => {
    let replaced = false;
    const handler = createSplashReplaceRoute({
      enabled: false,
      config,
      replace: async () => {
        replaced = true;
        return { status: 'replaced' as const, versionId: 'version-1' };
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/replace', { method: 'POST' }),
    );

    expect(response.status).toBe(404);
    expect(replaced).toBe(false);
  });

  it('requires authentication within the previous five minutes before reading an upload', async () => {
    let normalized = false;
    const handler = createSplashReplaceRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: {
        findActiveSession: async () => ({
          userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
          csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          recentAuthenticatedAt: new Date(now.getTime() - 6 * 60_000),
        }),
        touchSession: async () => true,
      },
      normalize: async () => {
        normalized = true;
        return { kind: 'rejected', code: 'invalid_image' };
      },
      replace: async () => ({ status: 'replaced', versionId: 'version-1' }),
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/replace', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'multipart/form-data; boundary=test',
          'content-length': '100',
          cookie: `__Host-learnbox_admin_session=${sessionToken}`,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: '--test--',
      }),
    );

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toEqual({ code: 'reauthentication_required' });
    expect(normalized).toBe(false);
  });

  it('normalizes and replaces one bounded image without returning storage details', async () => {
    const replacements: unknown[] = [];
    const handler = createSplashReplaceRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: {
        findActiveSession: async () => ({
          userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
          csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          recentAuthenticatedAt: now,
        }),
        touchSession: async () => true,
      },
      normalize: async (bytes) => ({
        kind: 'normalized',
        bytes,
        checksum: 'a'.repeat(64),
        width: 864,
        height: 1821,
        byteSize: bytes.byteLength,
        mediaType: 'image/webp',
      }),
      replace: async (input) => {
        replacements.push(input);
        return { status: 'replaced', versionId: 'version-1' };
      },
    });
    const form = new FormData();
    form.set('splash', new File([Buffer.from('valid-image')], 'private-name.png'));

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/replace', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-length': '256',
          cookie: `__Host-learnbox_admin_session=${sessionToken}`,
          'x-learnbox-csrf-token': csrfToken,
          'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
        },
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'replaced',
      revision: 'version-1',
      previewPath: '/api/splash/preview',
    });
    expect(replacements).toEqual([
      expect.objectContaining({
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        now,
      }),
    ]);
    expect(JSON.stringify(replacements)).not.toContain('private-name');
  });

  it('rejects an untrusted origin before reading or normalizing an upload', async () => {
    let normalized = false;
    const handler = createSplashReplaceRoute({
      enabled: true,
      config,
      normalize: async () => {
        normalized = true;
        return { kind: 'rejected', code: 'invalid_image' };
      },
      replace: async () => ({ status: 'replaced', versionId: 'version-1' }),
      sessionStore: {
        findActiveSession: async () => undefined,
        touchSession: async () => false,
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/replace', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'content-type': 'multipart/form-data; boundary=test',
        },
        body: '--test--',
      }),
    );

    expect(response.status).toBe(400);
    expect(normalized).toBe(false);
  });

  it('rejects oversized declared requests before parsing multipart data', async () => {
    let normalized = false;
    const handler = createSplashReplaceRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: {
        findActiveSession: async () => ({
          userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
          csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + 60_000),
          revokedAt: null,
          recentAuthenticatedAt: now,
        }),
        touchSession: async () => true,
      },
      normalize: async () => {
        normalized = true;
        return { kind: 'rejected', code: 'invalid_image' };
      },
      replace: async () => ({ status: 'replaced', versionId: 'version-1' }),
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/splash/replace', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'multipart/form-data; boundary=test',
          'content-length': String(9 * 1024 * 1024),
          cookie: `__Host-learnbox_admin_session=${sessionToken}`,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: '--test--',
      }),
    );

    expect(response.status).toBe(413);
    expect(normalized).toBe(false);
  });
});
