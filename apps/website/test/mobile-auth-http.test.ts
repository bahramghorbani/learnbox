import { describe, expect, it } from 'vitest';

import {
  handleMobileOtpRequest,
  handleMobileOtpVerification,
  handleMobileSessionRefresh,
  handleMobileSessionRevoke,
  type MobileAuthHttpDependencies,
} from '../lib/mobile-auth-http';

const challengeId = 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed';

function dependencies(
  overrides: Partial<MobileAuthHttpDependencies> = {},
): MobileAuthHttpDependencies {
  return {
    hashClientIp: () => 'opaque-client-ip-hash',
    requestChallenge: async () => ({
      status: 'created',
      challengeId,
      expiresAt: new Date('2026-08-23T12:05:00Z'),
      resendAvailableAt: new Date('2026-08-23T12:01:00Z'),
    }),
    verify: async () => ({
      status: 'verified',
      accessToken: 'server-access-token',
      refreshToken: 'server-refresh-token',
    }),
    refresh: async () => ({
      status: 'rotated',
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    }),
    revoke: async () => true,
    ...overrides,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://learnbox.example${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('native mobile auth HTTP boundary', () => {
  it('requests OTP without Origin, preserving server IP rate limiting', async () => {
    let received: unknown;
    const response = await handleMobileOtpRequest(
      post('/api/auth/mobile/otp/request', { phone: '۰۹۱۲۱۲۳۴۵۶۷' }),
      dependencies({
        requestChallenge: async (input) => {
          received = input;
          return {
            status: 'created',
            challengeId,
            expiresAt: new Date('2026-08-23T12:05:00Z'),
            resendAvailableAt: new Date('2026-08-23T12:01:00Z'),
          };
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(received).toMatchObject({
      clientIpHash: 'opaque-client-ip-hash',
      purpose: 'sign_in',
    });
    expect((received as { phoneE164: string }).phoneE164).toMatch(/^\+989\d{9}$/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('returns typed rate limiting without exposing its scope', async () => {
    const response = await handleMobileOtpRequest(
      post('/api/auth/mobile/otp/request', { phone: '09121234567' }),
      dependencies({
        requestChallenge: async () => ({
          status: 'rate_limited',
          scope: 'phone',
          retryAfterMs: 1500,
        }),
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rateLimited' });
    expect(response.headers.get('retry-after')).toBe('2');
  });

  it('verifies through server identity contract and never accepts client identity or sets cookies', async () => {
    let received: unknown;
    const response = await handleMobileOtpVerification(
      post('/api/auth/mobile/otp/verify', {
        challengeId,
        code: '۱۲۳۴۵',
        phone: '09121234567',
        installationId: 'installation-1234567890',
      }),
      dependencies({
        verify: async (input) => {
          received = input;
          return {
            status: 'verified',
            accessToken: 'server-access-token',
            refreshToken: 'server-refresh-token',
          };
        },
      }),
    );
    expect(received).toEqual({
      challengeId,
      code: '12345',
      phone: '09121234567',
      installationId: 'installation-1234567890',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: 'server-access-token',
      refreshToken: 'server-refresh-token',
    });
    expect(response.headers.has('set-cookie')).toBe(false);

    const injected = await handleMobileOtpVerification(
      post('/api/auth/mobile/otp/verify', {
        challengeId,
        code: '12345',
        phone: '09121234567',
        installationId: 'installation-1234567890',
        userId: 'attacker',
      }),
      dependencies(),
    );
    expect(injected.status).toBe(400);
    expect(await injected.json()).toEqual({ error: 'validation' });
  });

  it('rotates only session and refresh credentials accepted by server contract', async () => {
    let received: unknown;
    const response = await handleMobileSessionRefresh(
      post('/api/auth/mobile/session/refresh', {
        sessionId: 'session-server',
        refreshToken: 'a'.repeat(43),
      }),
      dependencies({
        refresh: async (input) => {
          received = input;
          return {
            status: 'rotated',
            accessToken: 'rotated-access-token',
            refreshToken: 'rotated-refresh-token',
          };
        },
      }),
    );
    expect(received).toEqual({ sessionId: 'session-server', refreshToken: 'a'.repeat(43) });
    expect(await response.json()).toEqual({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    });
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('revokes only from bearer access claims, ignoring installation hints', async () => {
    let token = '';
    const response = await handleMobileSessionRevoke(
      post('/api/auth/mobile/session/revoke', {}, { authorization: 'Bearer signed-access-token' }),
      dependencies({
        revoke: async (value) => {
          token = value;
          return true;
        },
      }),
    );
    expect(token).toBe('signed-access-token');
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects non-HTTPS, wrong content type, malformed, oversized, and non-exact JSON before dependencies', async () => {
    let called = false;
    const deps = dependencies({
      requestChallenge: async () => {
        called = true;
        throw new Error('must not run');
      },
    });
    const requests = [
      new Request('http://learnbox.example/api/auth/mobile/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
        body: '{"phone":"09121234567"}',
      }),
      post(
        '/api/auth/mobile/otp/request',
        { phone: '09121234567' },
        { 'content-type': 'text/plain' },
      ),
      post('/api/auth/mobile/otp/request', '{'),
      post('/api/auth/mobile/otp/request', { phone: '09121234567', extra: true }),
      post('/api/auth/mobile/otp/request', `{"phone":"${'9'.repeat(5000)}"}`),
    ];
    for (const request of requests) {
      const response = await handleMobileOtpRequest(request, deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'validation' });
    }
    expect(called).toBe(false);
  });

  it('allows bounded loopback HTTP only in development', async () => {
    const request = new Request('http://127.0.0.1:3000/api/auth/mobile/otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
      body: '{"phone":"09121234567"}',
    });
    expect(
      (await handleMobileOtpRequest(request, dependencies(), { development: true })).status,
    ).toBe(201);
    expect(
      (await handleMobileOtpRequest(request, dependencies(), { development: false })).status,
    ).toBe(400);
  });

  it('collapses verification, refresh, revoke, and dependency failures to generic typed errors', async () => {
    const verify = await handleMobileOtpVerification(
      post('/api/auth/mobile/otp/verify', {
        challengeId,
        code: '12345',
        phone: '09121234567',
        installationId: 'installation-1234567890',
      }),
      dependencies({ verify: async () => ({ status: 'verification_failed' }) }),
    );
    expect(await verify.json()).toEqual({ error: 'invalidChallenge' });

    const refresh = await handleMobileSessionRefresh(
      post('/api/auth/mobile/session/refresh', {
        sessionId: 'session-server',
        refreshToken: 'a'.repeat(43),
      }),
      dependencies({ refresh: async () => ({ status: 'authentication_failed' }) }),
    );
    expect(await refresh.json()).toEqual({ error: 'invalidToken' });

    const revoke = await handleMobileSessionRevoke(
      post('/api/auth/mobile/session/revoke', {}, { authorization: 'Bearer invalid-token' }),
      dependencies({ revoke: async () => false }),
    );
    expect(await revoke.json()).toEqual({ error: 'invalidToken' });

    const unavailable = await handleMobileOtpRequest(
      post('/api/auth/mobile/otp/request', { phone: '09121234567' }),
      dependencies({ requestChallenge: async () => Promise.reject(new Error('private detail')) }),
    );
    expect(await unavailable.json()).toEqual({ error: 'serverUnavailable' });
  });
});
