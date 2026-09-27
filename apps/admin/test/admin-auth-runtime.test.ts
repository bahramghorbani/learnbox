import { describe, expect, it } from 'vitest';

import { createAdminAuthRuntime } from '../lib/server/admin-auth-runtime';

const environment = {
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
  LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
};

describe('admin auth runtime', () => {
  it('does not create database or WebAuthn dependencies while passkeys are disabled', () => {
    expect(createAdminAuthRuntime({ environment: {} })).toEqual({ enabled: false });
  });

  it('wires the real route contracts only after exact enabled configuration', () => {
    const runtime = createAdminAuthRuntime({
      environment,
      pool: {
        connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
        query: async () => ({ rows: [] }),
      },
      webauthn: {
        generateAuthenticationOptions: async () => ({ challenge: 'challenge' }),
        verifyAuthenticationResponse: async () => ({ verified: false }),
      },
    });

    expect(runtime.enabled).toBe(true);
    if (runtime.enabled) {
      expect(typeof runtime.loginOptions).toBe('function');
      expect(typeof runtime.loginVerify).toBe('function');
    }
  });
});
