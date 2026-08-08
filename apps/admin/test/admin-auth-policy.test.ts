import { describe, expect, it } from 'vitest';

import {
  AdminSecurityError,
  assertTrustedAdminMutation,
  readAdminAuthConfig,
} from '../lib/server/admin-auth-policy';

const enabledEnvironment = {
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
  LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
};

describe('readAdminAuthConfig', () => {
  it('is disabled unless the flag is exactly true', () => {
    expect(readAdminAuthConfig({})).toEqual({ enabled: false });
    expect(readAdminAuthConfig({ LEARNBOX_ADMIN_PASSKEY_ENABLED: 'TRUE' })).toEqual({
      enabled: false,
    });
  });

  it('requires an exact HTTPS origin, matching RP ID, and a strong hash key', () => {
    expect(readAdminAuthConfig(enabledEnvironment)).toMatchObject({
      enabled: true,
      origin: 'https://admin.learnbox.app',
      rpId: 'admin.learnbox.app',
    });

    expect(() =>
      readAdminAuthConfig({ ...enabledEnvironment, LEARNBOX_ADMIN_ORIGIN: 'http://admin.test' }),
    ).toThrow('HTTPS');
    expect(() =>
      readAdminAuthConfig({ ...enabledEnvironment, LEARNBOX_ADMIN_RP_ID: 'learnbox.app' }),
    ).toThrow('RP ID');
    expect(() =>
      readAdminAuthConfig({ ...enabledEnvironment, LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'short' }),
    ).toThrow('hash key');
  });
});

describe('assertTrustedAdminMutation', () => {
  const config = readAdminAuthConfig(enabledEnvironment);

  it('accepts only the configured origin and an allowed content type', () => {
    const request = new Request('https://admin.learnbox.app/api/auth/login/verify', {
      method: 'POST',
      headers: {
        origin: enabledEnvironment.LEARNBOX_ADMIN_ORIGIN,
        'content-type': 'application/json',
      },
    });

    expect(() => assertTrustedAdminMutation(request, config, ['application/json'])).not.toThrow();
  });

  it('rejects missing or lookalike origins and disallowed content types', () => {
    for (const origin of [undefined, 'https://admin.learnbox.app.evil.example']) {
      const headers = new Headers({ 'content-type': 'application/json' });
      if (origin) headers.set('origin', origin);
      const request = new Request('https://admin.learnbox.app/api/auth/login/verify', {
        method: 'POST',
        headers,
      });
      expect(() => assertTrustedAdminMutation(request, config, ['application/json'])).toThrow(
        AdminSecurityError,
      );
    }

    const request = new Request('https://admin.learnbox.app/api/auth/login/verify', {
      method: 'POST',
      headers: {
        origin: enabledEnvironment.LEARNBOX_ADMIN_ORIGIN,
        'content-type': 'text/plain',
      },
    });
    expect(() => assertTrustedAdminMutation(request, config, ['application/json'])).toThrow(
      'content type',
    );
  });
});
