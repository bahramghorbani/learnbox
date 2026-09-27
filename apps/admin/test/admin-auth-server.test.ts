import { describe, expect, it } from 'vitest';

import { createAdminAuthServer } from '../lib/server/admin-auth-server';

const environment = {
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
  LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
  DATABASE_URL: 'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require',
};

describe('admin auth server', () => {
  it('does not initialize Postgres or WebAuthn while passkeys are disabled', () => {
    let pools = 0;
    expect(
      createAdminAuthServer({
        environment: {},
        createPool: () => {
          pools += 1;
          throw new Error('must not run');
        },
        webauthn: {},
      }),
    ).toEqual({ enabled: false });
    expect(pools).toBe(0);
  });

  it('builds the runtime using a verified database URL only when enabled', () => {
    let connectionString = '';
    const runtime = createAdminAuthServer({
      environment,
      createPool: (config) => {
        connectionString = config.connectionString;
        return {
          connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
          query: async () => ({ rows: [] }),
        };
      },
      webauthn: {
        generateAuthenticationOptions: async () => ({ challenge: 'challenge' }),
        verifyAuthenticationResponse: async () => ({ verified: false }),
      },
    });

    expect(runtime.enabled).toBe(true);
    expect(connectionString).toContain('sslmode=verify-full');
  });
});
