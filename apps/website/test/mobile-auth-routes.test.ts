import { afterEach, describe, expect, it } from 'vitest';

import { POST as requestOtp } from '../app/api/auth/mobile/otp/request/route';
import { POST as verifyOtp } from '../app/api/auth/mobile/otp/verify/route';
import { POST as refreshSession } from '../app/api/auth/mobile/session/refresh/route';
import { POST as revokeSession } from '../app/api/auth/mobile/session/revoke/route';
import { readMobileAuthRuntimeConfig } from '../lib/mobile-auth-runtime';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function post(path: string, body: object) {
  return new Request(`https://learnbox.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  });
}

describe('mobile auth runtime', () => {
  it('fails closed when flag or any required configuration is absent', () => {
    const complete = {
      MOBILE_AUTH_ENABLED: 'true',
      DATABASE_URL: 'postgresql://learnbox:password@example.test/learnbox?sslmode=require',
      LEARNBOX_OTP_SECRET: 'otp-secret-that-is-at-least-thirty-two-bytes',
      LEARNBOX_MOBILE_SESSION_SECRET: 'session-secret-that-is-at-least-thirty-two-bytes',
      SMS_IR_ENABLED: 'true',
      SMS_IR_API_KEY: 'private-key',
      SMS_IR_CODE_PARAMETER_NAME: 'OTP',
      SMS_IR_TEMPLATE_ID: '495140',
    };
    expect(readMobileAuthRuntimeConfig({ ...complete, MOBILE_AUTH_ENABLED: 'false' })).toBeNull();
    expect(readMobileAuthRuntimeConfig({ ...complete, MOBILE_AUTH_ENABLED: undefined })).toBeNull();
    expect(
      readMobileAuthRuntimeConfig({ ...complete, LEARNBOX_MOBILE_SESSION_SECRET: '' }),
    ).toBeNull();
    expect(readMobileAuthRuntimeConfig(complete)).toMatchObject({
      databaseUrl: complete.DATABASE_URL,
      otpSecret: complete.LEARNBOX_OTP_SECRET,
      sessionSecret: complete.LEARNBOX_MOBILE_SESSION_SECRET,
    });
  });
});

describe('disabled mobile auth routes', () => {
  it('returns no-store typed unavailability from request, verify, refresh, and revoke', async () => {
    process.env.MOBILE_AUTH_ENABLED = 'false';
    const responses = await Promise.all([
      requestOtp(post('/api/auth/mobile/otp/request', { phone: '09121234567' })),
      verifyOtp(
        post('/api/auth/mobile/otp/verify', {
          challengeId: 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed',
          code: '12345',
          phone: '09121234567',
          installationId: 'installation-1234567890',
        }),
      ),
      refreshSession(
        post('/api/auth/mobile/session/refresh', {
          sessionId: 'session-server',
          refreshToken: 'a'.repeat(43),
        }),
      ),
      revokeSession(post('/api/auth/mobile/session/revoke', {})),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(await response.json()).toEqual({ error: 'serverUnavailable' });
    }
  });
});
