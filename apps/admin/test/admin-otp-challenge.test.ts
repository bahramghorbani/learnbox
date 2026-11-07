import { describe, expect, it } from 'vitest';

import {
  createOtpChallenge,
  createOtpCode,
  evaluateOtpRequestRateLimit,
  evaluateOtpVerification,
  hashOtpClientIp,
  hashOtpCode,
  hashOtpPhone,
  otpPolicy,
  otpRequestPolicy,
} from '../lib/server/admin-otp-challenge';

const secret = 'admin-otp-challenge-test-secret-long-enough';
const challengeId = '00000000-0000-4000-8000-000000000001'; // UUID-like, passes isOpaqueId check

function makeChallenge(now = new Date('2026-08-01T12:00:00Z')) {
  const phoneHash = hashOtpPhone(secret, '+989121234567');
  const codeHash = hashOtpCode(secret, challengeId, '12345');
  return createOtpChallenge({ id: challengeId, phoneHash, codeHash, now });
}

describe('admin OTP challenge core (no purpose field)', () => {
  it('creates a 5-digit numeric code', () => {
    const code = createOtpCode();
    expect(code).toMatch(/^\d{5}$/);
  });

  it('challenge record does not contain the raw code', () => {
    const record = makeChallenge();
    expect(JSON.stringify(record)).not.toContain('12345');
    expect(record).not.toHaveProperty('purpose');
    expect(record).toMatchObject({ attemptCount: 0, maxAttempts: otpPolicy.maxAttempts });
  });

  it('hashOtpClientIp produces a stable base64url hash', () => {
    const hash = hashOtpClientIp(secret, '1.2.3.4');
    expect(hash).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(hashOtpClientIp(secret, '1.2.3.4')).toBe(hash); // deterministic
    expect(hashOtpClientIp(secret, '1.2.3.5')).not.toBe(hash); // different ip
  });

  it('verifies a matching code and rejects reuse', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const record = makeChallenge(now);
    const matchingHash = hashOtpCode(secret, challengeId, '12345');
    const verified = evaluateOtpVerification(record, matchingHash, now);

    expect(verified.status).toBe('verified');
    if (verified.status !== 'verified') throw new Error();
    expect(evaluateOtpVerification(verified.record, matchingHash, now)).toEqual({ status: 'used' });
  });

  it('increments attempt count and locks after maxAttempts', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    let record = makeChallenge(now);
    const wrongHash = hashOtpCode(secret, challengeId, '99999');

    for (let i = 1; i < otpPolicy.maxAttempts; i++) {
      const result = evaluateOtpVerification(record, wrongHash, now);
      expect(result.status).toBe('invalid');
      if (result.status !== 'invalid') throw new Error();
      record = result.record;
    }

    expect(evaluateOtpVerification(record, wrongHash, now)).toMatchObject({
      status: 'locked',
      record: { attemptCount: otpPolicy.maxAttempts },
    });
  });

  it('rejects expired codes', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const record = makeChallenge(now);
    const matchingHash = hashOtpCode(secret, challengeId, '12345');
    const afterExpiry = new Date(now.getTime() + otpPolicy.expiresInMs);

    expect(evaluateOtpVerification(record, matchingHash, afterExpiry)).toEqual({
      status: 'expired',
    });
  });

  it('allows up to maxRequestsPerPhone then rate-limits the phone', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const times = Array.from(
      { length: otpRequestPolicy.maxRequestsPerPhone },
      (_, i) => new Date(now.getTime() - i * 1000),
    );

    expect(
      evaluateOtpRequestRateLimit({ phoneRequestTimes: times.slice(1), ipRequestTimes: [], now }),
    ).toEqual({ status: 'allowed' });

    expect(
      evaluateOtpRequestRateLimit({ phoneRequestTimes: times, ipRequestTimes: [], now }),
    ).toMatchObject({ status: 'rate_limited', scope: 'phone' });
  });

  it('limits an abusive IP independently', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const ipTimes = Array.from(
      { length: otpRequestPolicy.maxRequestsPerIp },
      (_, i) => new Date(now.getTime() - i * 1000),
    );

    expect(
      evaluateOtpRequestRateLimit({ phoneRequestTimes: [], ipRequestTimes: ipTimes, now }),
    ).toMatchObject({ status: 'rate_limited', scope: 'ip' });
  });

  it('ignores timestamps outside the sliding window', () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const oldTimes = Array.from(
      { length: otpRequestPolicy.maxRequestsPerPhone },
      () => new Date(now.getTime() - otpRequestPolicy.windowMs - 1),
    );

    expect(
      evaluateOtpRequestRateLimit({ phoneRequestTimes: oldTimes, ipRequestTimes: [], now }),
    ).toEqual({ status: 'allowed' });
  });
});
