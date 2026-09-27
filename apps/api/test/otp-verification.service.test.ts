import { describe, expect, it } from 'vitest';

import {
  hashOtpCode,
  type OtpPurpose,
  type OtpVerificationOutcome,
} from '../src/auth/otp-challenge.js';
import {
  OtpVerificationService,
  type OtpChallengeVerificationStore,
} from '../src/auth/otp-verification.service.js';

const secret = 'otp-verification-service-test-secret-long-enough';
const challengeId = '3c71fc32-56e0-4ed8-b54a-63f2a4c51921';
const now = new Date('2026-08-05T12:00:00Z');
const phoneHash = 'uH8xjJxK4C2wAQeFuzRjDdJvTAlcBtPAsRbo0yiQE7I';

class RecordingVerificationStore implements OtpChallengeVerificationStore {
  suppliedCodeHash: string | null = null;

  constructor(private readonly outcome: OtpVerificationOutcome | null) {}

  async verify(
    _challengeId: string,
    _purpose: OtpPurpose,
    suppliedCodeHash: string,
  ): Promise<OtpVerificationOutcome | null> {
    this.suppliedCodeHash = suppliedCodeHash;
    return this.outcome;
  }
}

describe('OtpVerificationService', () => {
  it('returns the opaque phone hash only after the store consumes a valid challenge', async () => {
    const store = new RecordingVerificationStore({
      status: 'verified',
      record: {
        id: challengeId,
        phoneHash,
        purpose: 'sign_in',
        codeHash: hashOtpCode(secret, challengeId, '12345'),
        expiresAt: new Date('2026-08-05T12:05:00Z'),
        resendAvailableAt: new Date('2026-08-05T12:01:00Z'),
        attemptCount: 0,
        maxAttempts: 5,
        consumedAt: now,
      },
    });
    const service = new OtpVerificationService({ store, secret });

    await expect(
      service.verify({ challengeId, code: '12345', purpose: 'sign_in', now }),
    ).resolves.toEqual({ status: 'verified', phoneHash });
    expect(store.suppliedCodeHash).toBe(hashOtpCode(secret, challengeId, '12345'));
  });

  it.each([null, 'invalid', 'locked', 'expired', 'used'] as const)(
    'returns one generic rejection for a %s store result',
    async (status) => {
      const outcome =
        status === null || status === 'expired' || status === 'used'
          ? status === null
            ? null
            : ({ status } as OtpVerificationOutcome)
          : ({
              status,
              record: {
                id: challengeId,
                phoneHash,
                purpose: 'sign_in',
                codeHash: hashOtpCode(secret, challengeId, '54321'),
                expiresAt: new Date('2026-08-05T12:05:00Z'),
                resendAvailableAt: new Date('2026-08-05T12:01:00Z'),
                attemptCount: 1,
                maxAttempts: 5,
                consumedAt: null,
              },
            } as OtpVerificationOutcome);
      const service = new OtpVerificationService({
        store: new RecordingVerificationStore(outcome),
        secret,
      });

      await expect(
        service.verify({ challengeId, code: '12345', purpose: 'sign_in', now }),
      ).resolves.toEqual({ status: 'rejected' });
    },
  );
});
