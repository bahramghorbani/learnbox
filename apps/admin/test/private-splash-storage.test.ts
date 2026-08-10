import { describe, expect, it } from 'vitest';

import { createPrivateSplashStorage } from '../lib/server/private-splash-storage.js';

describe('createPrivateSplashStorage', () => {
  it('writes one immutable private WebP and deletes only the exact opaque key', async () => {
    const calls: Array<{ operation: string; key: string; options: Record<string, unknown> }> = [];
    const storage = createPrivateSplashStorage({
      token: 'test-token',
      put: async (key, _bytes, options) => {
        calls.push({ operation: 'put', key, options });
        return { pathname: key, url: 'private-provider-url' };
      },
      del: async (key, options) => {
        calls.push({ operation: 'delete', key, options });
      },
    });

    await expect(
      storage.upload('admin/splash/version-1.webp', Buffer.from('webp'), 'image/webp'),
    ).resolves.toBeUndefined();
    await storage.delete('admin/splash/previous.webp');

    expect(calls).toEqual([
      {
        operation: 'put',
        key: 'admin/splash/version-1.webp',
        options: {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'image/webp',
          token: 'test-token',
        },
      },
      {
        operation: 'delete',
        key: 'admin/splash/previous.webp',
        options: { token: 'test-token' },
      },
    ]);
  });
});
