import { describe, expect, it } from 'vitest';

import {
  createBootstrapOptionsRoute,
  createBootstrapVerifyRoute,
  createLoginOptionsRoute,
  createLoginVerifyRoute,
  createLogoutRoute,
  createReauthOptionsRoute,
  createReauthVerifyRoute,
  createSessionRoute,
} from '../lib/server/admin-auth-routes';
import { hashAdminSecret } from '../lib/server/admin-session';

const csrfToken = 'c'.repeat(43);
const csrfHash = hashAdminSecret(csrfToken, 'k'.repeat(32));

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};

const enabledEnvironment = {
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: config.origin,
  LEARNBOX_ADMIN_RP_ID: config.rpId,
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: config.tokenHashKey,
  LEARNBOX_ADMIN_BOOTSTRAP_ENABLED: 'true',
  LEARNBOX_ADMIN_BOOTSTRAP_SECRET: 's'.repeat(32),
};

const sessionRecord = {
  csrfHash: 'csrf-hash',
  lastSeenAt: new Date('2026-08-08T12:00:00.000Z'),
  absoluteExpiresAt: new Date('2026-08-08T13:00:00.000Z'),
  revokedAt: null,
  recentAuthenticatedAt: new Date('2026-08-08T12:00:00.000Z'),
};

describe('admin passkey login routes', () => {
  it('keeps the options endpoint hidden when passkeys are disabled', async () => {
    const handler = createLoginOptionsRoute({ config: { enabled: false } });

    await expect(
      handler(new Request('https://admin.learnbox.app/api/auth/login/options')),
    ).resolves.toMatchObject({
      status: 404,
    });
  });

  it('issues login options with a short-lived HttpOnly ceremony cookie', async () => {
    const handler = createLoginOptionsRoute({
      config,
      randomNonce: () => 'n'.repeat(43),
      service: { createLoginOptions: async () => ({ challenge: 'challenge', rpId: config.rpId }) },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/login/options'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ challenge: 'challenge', rpId: config.rpId });
    expect(response.headers.get('set-cookie')).toContain('__Host-learnbox_admin_ceremony=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Strict');
  });

  it('rejects a bad origin without calling the WebAuthn service', async () => {
    let verified = false;
    const handler = createLoginVerifyRoute({
      config,
      service: {
        verifyLogin: async () => {
          verified = true;
          return { status: 'authenticated' as const };
        },
      },
      sessionStore: { createSession: async () => undefined },
      createSessionSecrets: () => ({
        token: 'token',
        csrfToken: 'csrf',
        tokenHash: 'token-hash',
        csrfHash: 'csrf-hash',
      }),
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/login/verify', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        body: JSON.stringify({ response: { id: 'credential' } }),
      }),
    );

    expect(response.status).toBe(400);
    expect(verified).toBe(false);
  });

  it('creates a hashed server session after verified passkey login without returning the token', async () => {
    const created: unknown[] = [];
    const handler = createLoginVerifyRoute({
      config,
      now: () => new Date('2026-08-08T12:00:00.000Z'),
      service: { verifyLogin: async () => ({ status: 'authenticated' as const }) },
      sessionStore: {
        createSession: async (input) => {
          created.push(input);
        },
      },
      createSessionSecrets: () => ({
        token: 't'.repeat(43),
        csrfToken: 'c'.repeat(43),
        tokenHash: 'token-hash',
        csrfHash: 'csrf-hash',
      }),
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/login/verify', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_ceremony=${'n'.repeat(43)}`,
        },
        body: JSON.stringify({ response: { id: 'credential' } }),
      }),
    );

    expect(response.status).toBe(204);
    expect(created).toEqual([
      expect.objectContaining({ tokenHash: 'token-hash', csrfHash: 'csrf-hash' }),
    ]);
    expect(response.headers.get('set-cookie')).toContain('__Host-learnbox_admin_session=');
    expect(response.headers.get('set-cookie')).not.toContain('token-hash');
  });
});

describe('admin bootstrap routes', () => {
  it('keeps bootstrap options hidden unless both auth and bootstrap flags are enabled', async () => {
    const handler = createBootstrapOptionsRoute({
      config: { enabled: false },
      environment: {},
    });
    await expect(
      handler(new Request('https://admin.learnbox.app/api/auth/bootstrap/options')),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('issues bootstrap registration options only when the bootstrap secret is configured', async () => {
    const handler = createBootstrapOptionsRoute({
      config,
      environment: enabledEnvironment,
      randomNonce: () => 'n'.repeat(43),
      service: {
        createBootstrapOptions: async () => ({
          challenge: 'challenge',
          rpId: config.rpId,
          user: { id: 'owner-handle' },
        }),
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/bootstrap/options'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      challenge: 'challenge',
      rpId: config.rpId,
      user: { id: 'owner-handle' },
    });
    expect(response.headers.get('set-cookie')).toContain('__Host-learnbox_admin_ceremony=');
  });

  it('rejects bootstrap verification without the one-time secret', async () => {
    let verified = false;
    const handler = createBootstrapVerifyRoute({
      config,
      environment: enabledEnvironment,
      service: {
        verifyBootstrap: async () => {
          verified = true;
          return { status: 'bootstrapped' as const };
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/bootstrap/verify', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_ceremony=${'n'.repeat(43)}`,
        },
        body: JSON.stringify({ response: { id: 'credential' } }),
      }),
    );

    expect(response.status).toBe(400);
    expect(verified).toBe(false);
  });

  it('bootstraps the first credential and clears the ceremony cookie after a valid secret', async () => {
    const handler = createBootstrapVerifyRoute({
      config,
      environment: enabledEnvironment,
      service: {
        verifyBootstrap: async () => ({ status: 'bootstrapped' as const }),
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/bootstrap/verify', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_ceremony=${'n'.repeat(43)}`,
        },
        body: JSON.stringify({
          secret: 's'.repeat(32),
          response: { id: 'credential' },
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain(
      '__Host-learnbox_admin_ceremony=; Max-Age=0',
    );
  });
});

describe('admin reauthentication routes', () => {
  const activeSessionStore = {
    findActiveSession: async () => ({ ...sessionRecord, csrfHash }),
    touchSession: async () => true,
    touchRecentAuthentication: async () => true,
  };

  it('keeps reauth options hidden when passkeys are disabled', async () => {
    const handler = createReauthOptionsRoute({
      config: { enabled: false },
      environment: {},
    });
    await expect(
      handler(new Request('https://admin.learnbox.app/api/auth/reauth/options')),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('requires an active session before issuing reauthentication options', async () => {
    let issued = false;
    const handler = createReauthOptionsRoute({
      config,
      environment: enabledEnvironment,
      randomNonce: () => 'n'.repeat(43),
      service: {
        createReauthOptions: async () => {
          issued = true;
          return { challenge: 'challenge' };
        },
      },
      now: () => new Date('2026-08-08T12:04:00.000Z'),
      sessionStore: {
        findActiveSession: async () => undefined,
        touchSession: async () => false,
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/reauth/options', {
        headers: { cookie: `__Host-learnbox_admin_session=${'t'.repeat(43)}` },
      }),
    );

    expect(response.status).toBe(404);
    expect(issued).toBe(false);
  });

  it('requires session and CSRF proof before refreshing recent authentication', async () => {
    let refreshed = false;
    const handler = createReauthVerifyRoute({
      config,
      now: () => new Date('2026-08-08T12:04:00.000Z'),
      service: {
        verifyReauth: async () => ({ status: 'reauthenticated' as const }),
      },
      sessionStore: {
        ...activeSessionStore,
        touchRecentAuthentication: async () => {
          refreshed = true;
          return true;
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/reauth/verify', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_session=${'t'.repeat(43)}; __Host-learnbox_admin_ceremony=${'n'.repeat(43)}`,
        },
        body: JSON.stringify({ response: { id: 'credential' } }),
      }),
    );

    expect(response.status).toBe(400);
    expect(refreshed).toBe(false);
  });

  it('refreshes recent authentication after a verified passkey with CSRF proof', async () => {
    let refreshed = false;
    const handler = createReauthVerifyRoute({
      config,
      now: () => new Date('2026-08-08T12:04:00.000Z'),
      service: {
        verifyReauth: async () => ({ status: 'reauthenticated' as const }),
      },
      sessionStore: {
        ...activeSessionStore,
        touchRecentAuthentication: async () => {
          refreshed = true;
          return true;
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/reauth/verify', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_session=${'t'.repeat(43)}; __Host-learnbox_admin_ceremony=${'n'.repeat(43)}`,
          'x-learnbox-csrf-token': csrfToken,
        },
        body: JSON.stringify({ response: { id: 'credential' } }),
      }),
    );

    expect(response.status).toBe(204);
    expect(refreshed).toBe(true);
    expect(response.headers.get('set-cookie')).toContain(
      '__Host-learnbox_admin_ceremony=; Max-Age=0',
    );
  });
});

describe('admin session routes', () => {
  it('returns only minimal session state', async () => {
    const handler = createSessionRoute({
      config,
      sessionStore: {
        findActiveSession: async () => sessionRecord,
        touchSession: async () => true,
      },
      now: () => new Date('2026-08-08T12:04:00.000Z'),
    });
    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/session', {
        headers: { cookie: `__Host-learnbox_admin_session=${'t'.repeat(43)}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: true, recent: true });
  });

  it('requires origin and CSRF proof before revoking the current session', async () => {
    let revoked = false;
    const handler = createLogoutRoute({
      config,
      sessionStore: {
        findActiveSession: async () => sessionRecord,
        touchSession: async () => true,
        revokeSession: async () => {
          revoked = true;
          return true;
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/auth/logout', {
        method: 'POST',
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          cookie: `__Host-learnbox_admin_session=${'t'.repeat(43)}`,
          'x-learnbox-csrf-token': 'csrf-token',
        },
        body: '{}',
      }),
    );

    expect(response.status).toBe(400);
    expect(revoked).toBe(false);
  });
});
