import { describe, expect, it } from 'vitest';

import {
  createOtpChallenge,
  createOtpCode,
  evaluateOtpVerification,
  hashOtpCode,
  hashOtpPhone,
  otpPolicy,
} from '../src/auth/otp-challenge.js';

const secret = 'otp-challenge-test-secret-that-is-long-enough';
const challengeId = 'challenge_7a1d9e0c13f2409b';
const phoneHash = hashOtpPhone(secret, '+989121234567');

function challenge(now = new Date('2026-07-28T12:00:00Z')) {
  return createOtpChallenge({
    id: challengeId,
    phoneHash,
    codeHash: hashOtpCode(secret, challengeId, '12345'),
    purpose: 'sign_in',
    now,
  });
}

describe('OTP challenge core', () => {
  it('creates a short numeric code without persisting the raw value in the challenge', () => {
    const code = createOtpCode();
    const record = challenge();

    expect(code).toMatch(/^\d{5}$/);
    expect(JSON.stringify(record)).not.toContain('12345');
    expect(record).toMatchObject({ attemptCount: 0, maxAttempts: otpPolicy.maxAttempts });
  });

  it('consumes a matching code once and rejects later reuse', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const record = challenge(now);
    const matchingHash = hashOtpCode(secret, challengeId, '12345');
    const verified = evaluateOtpVerification(record, matchingHash, now);

    expect(verified.status).toBe('verified');
    if (verified.status !== 'verified') throw new Error('Expected verified OTP challenge.');
    expect(evaluateOtpVerification(verified.record, matchingHash, now)).toEqual({ status: 'used' });
  });

  it('limits incorrect attempts and does not reveal a matching hash', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    let record = challenge(now);
    const incorrectHash = hashOtpCode(secret, challengeId, '54321');

    for (let attempt = 1; attempt < otpPolicy.maxAttempts; attempt += 1) {
      const result = evaluateOtpVerification(record, incorrectHash, now);
      expect(result.status).toBe('invalid');
      if (result.status !== 'invalid') throw new Error('Expected invalid OTP challenge.');
      record = result.record;
    }

    expect(evaluateOtpVerification(record, incorrectHash, now)).toEqual({ status: 'locked' });
  });

  it('rejects expired codes before comparison', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const record = challenge(now);
    const matchingHash = hashOtpCode(secret, challengeId, '12345');

    expect(
      evaluateOtpVerification(
        record,
        matchingHash,
        new Date(now.getTime() + otpPolicy.expiresInMs),
      ),
    ).toEqual({ status: 'expired' });
  });
});
