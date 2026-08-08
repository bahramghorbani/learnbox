import { describe, expect, it } from 'vitest';

import { createLoginOptionsRoute, createLoginVerifyRoute } from '../lib/server/admin-auth-routes';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
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
