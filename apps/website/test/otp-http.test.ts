import { describe, expect, it } from 'vitest';

import { handleOtpRequest, handleOtpVerification, type OtpHttpDependencies } from '../lib/otp-http';

const challengeId = 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed';

function dependencies(overrides: Partial<OtpHttpDependencies> = {}): OtpHttpDependencies {
  return {
    hashClientIp: () => 'opaque-client-ip-hash',
    requestChallenge: async () => ({
      status: 'created',
      challengeId,
      expiresAt: new Date('2026-08-06T10:05:00Z'),
      resendAvailableAt: new Date('2026-08-06T10:01:00Z'),
    }),
    verifyChallenge: async () => ({ status: 'verified', phoneHash: 'opaque-phone-hash' }),
    resolveSessionSubject: async () => '2efaf676-84e4-45b1-8a13-50735a8df2c8',
    createSession: () => 'signed-session-token',
    ...overrides,
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://learnbox-preview.vercel.app${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://learnbox-preview.vercel.app',
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('handleOtpRequest', () => {
  it('normalizes Persian mobile digits and returns only opaque challenge metadata', async () => {
    let received: Parameters<OtpHttpDependencies['requestChallenge']>[0] | undefined;
    const response = await handleOtpRequest(
      post('/api/auth/otp/request', { phone: '۰۹۱۲۱۲۳۴۵۶۷' }),
      dependencies({
        requestChallenge: async (input) => {
          received = input;
          return {
            status: 'created',
            challengeId,
            expiresAt: new Date('2026-08-06T10:05:00Z'),
            resendAvailableAt: new Date('2026-08-06T10:01:00Z'),
          };
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(received).toEqual({
      phoneE164: '+989121234567',
      clientIpHash: 'opaque-client-ip-hash',
      purpose: 'sign_in',
    });
    expect(await response.json()).toEqual({
      challengeId,
      expiresAt: '2026-08-06T10:05:00.000Z',
      resendAvailableAt: '2026-08-06T10:01:00.000Z',
    });
  });

  it('rejects a cross-origin request before generating or delivering a code', async () => {
    let called = false;
    const response = await handleOtpRequest(
      post('/api/auth/otp/request', { phone: '09121234567' }, { origin: 'https://attacker.test' }),
      dependencies({
        requestChallenge: async () => {
          called = true;
          throw new Error('must not run');
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(called).toBe(false);
  });
});

describe('handleOtpVerification', () => {
  it('issues the signed HttpOnly session only after resolving the canonical user id', async () => {
    let sessionSubject = '';
    const response = await handleOtpVerification(
      post('/api/auth/otp/verify', { challengeId, code: '۱۲۳۴۵', phone: '۰۹۱۲۱۲۳۴۵۶۷' }),
      dependencies({
        createSession: (subject) => {
          sessionSubject = subject;
          return 'signed-session-token';
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(sessionSubject).toBe('2efaf676-84e4-45b1-8a13-50735a8df2c8');
    expect(sessionSubject).not.toBe('opaque-phone-hash');
    expect(response.headers.get('set-cookie')).toContain(
      'learnbox_alpha_session=signed-session-token',
    );
  });

  it('returns no cookie when the verified phone cannot resolve a canonical user', async () => {
    const response = await handleOtpVerification(
      post('/api/auth/otp/verify', { challengeId, code: '۱۲۳۴۵', phone: '۰۹۱۲۱۲۳۴۵۶۷' }),
      dependencies({ resolveSessionSubject: async () => null }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('returns a generic response without a cookie for a rejected challenge', async () => {
    const response = await handleOtpVerification(
      post('/api/auth/otp/verify', { challengeId, code: '12345', phone: '09121234567' }),
      dependencies({ verifyChallenge: async () => ({ status: 'rejected' }) }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'verification_failed' });
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
