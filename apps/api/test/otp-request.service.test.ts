import { describe, expect, it } from 'vitest';

import {
  OtpRequestService,
  type OtpChallengeRequestStore,
  type OtpCodeDeliveryClient,
} from '../src/auth/otp-request.service.js';
import { hashOtpCode, hashOtpPhone, type OtpChallengeRecord } from '../src/auth/otp-challenge.js';

const secret = 'otp-request-service-test-secret-that-is-long-enough';
const now = new Date('2026-07-30T12:00:00Z');
const challengeId = 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed';
const phoneE164 = '+989121234567';
const clientIpHash = hashOtpPhone(secret, '+989121234568');

class RecordingStore implements OtpChallengeRequestStore {
  record: OtpChallengeRecord | null = null;
  clientIpHash: string | null = null;
  order: string[] = [];

  async createIfRequestAllowed(record: OtpChallengeRecord, ipHash: string) {
    this.order.push('persist');
    this.record = record;
    this.clientIpHash = ipHash;
    return { status: 'allowed' as const };
  }
}

class RecordingDelivery implements OtpCodeDeliveryClient {
  phoneE164: string | null = null;
  code: string | null = null;

  constructor(private readonly order: string[]) {}

  async sendVerificationCode(phoneE164Value: string, codeValue: string) {
    this.order.push('deliver');
    this.phoneE164 = phoneE164Value;
    this.code = codeValue;
  }
}

describe('OtpRequestService', () => {
  it('persists an opaque challenge before delivering the short-lived code', async () => {
    const store = new RecordingStore();
    const delivery = new RecordingDelivery(store.order);
    const service = new OtpRequestService({
      store,
      delivery,
      secret,
      createChallengeId: () => challengeId,
      createCode: () => '12345',
    });

    await expect(
      service.request({ phoneE164, clientIpHash, purpose: 'sign_in', now }),
    ).resolves.toEqual({
      status: 'created',
      challengeId,
      expiresAt: new Date('2026-07-30T12:05:00Z'),
      resendAvailableAt: new Date('2026-07-30T12:01:00Z'),
    });

    expect(store.order).toEqual(['persist', 'deliver']);
    expect(store.clientIpHash).toBe(clientIpHash);
    expect(store.record).toEqual({
      id: challengeId,
      phoneHash: hashOtpPhone(secret, phoneE164),
      purpose: 'sign_in',
      codeHash: hashOtpCode(secret, challengeId, '12345'),
      expiresAt: new Date('2026-07-30T12:05:00Z'),
      resendAvailableAt: new Date('2026-07-30T12:01:00Z'),
      attemptCount: 0,
      maxAttempts: 5,
      consumedAt: null,
    });
    expect(JSON.stringify(store.record)).not.toContain(phoneE164);
    expect(JSON.stringify(store.record)).not.toContain('12345');
    expect(delivery.phoneE164).toBe(phoneE164);
    expect(delivery.code).toBe('12345');
  });

  it('does not call the delivery service when the persisted rate limit rejects a request', async () => {
    const store: OtpChallengeRequestStore = {
      createIfRequestAllowed: async () => ({
        status: 'rate_limited',
        scope: 'phone',
        retryAfterMs: 42_000,
      }),
    };
    let deliveryCalls = 0;
    const delivery: OtpCodeDeliveryClient = {
      sendVerificationCode: async () => {
        deliveryCalls += 1;
      },
    };
    const service = new OtpRequestService({
      store,
      delivery,
      secret,
      createChallengeId: () => challengeId,
      createCode: () => '12345',
    });

    await expect(
      service.request({ phoneE164, clientIpHash, purpose: 'sign_in', now }),
    ).resolves.toEqual({
      status: 'rate_limited',
      scope: 'phone',
      retryAfterMs: 42_000,
    });
    expect(deliveryCalls).toBe(0);
  });
});
