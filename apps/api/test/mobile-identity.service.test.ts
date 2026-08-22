import { describe, expect, it } from 'vitest';

import {
  MobileIdentityService,
  type MobileIdentityStore,
} from '../src/auth/mobile-identity.service.js';
import { MobileSessionContract } from '../src/auth/mobile-session.js';

const clock = { now: () => new Date('2026-08-23T12:00:00Z') };
const session = new MobileSessionContract({
  audience: 'learnbox-mobile',
  clock,
  key: 'mobile-identity-test-key-long-enough',
  random: { bytes: (size) => Buffer.alloc(size, 9) },
});

class Store implements MobileIdentityStore {
  verificationCalls: unknown[] = [];
  rotationCalls: unknown[] = [];
  async verifyAndCreate(input: unknown) {
    this.verificationCalls.push(input);
    return {
      status: 'verified' as const,
      learnerId: 'learner-server',
      sessionId: 'session-server',
    };
  }
  async rotateRefresh(input: unknown) {
    this.rotationCalls.push(input);
    return { status: 'rotated' as const, learnerId: 'learner-server', sessionId: 'session-server' };
  }
}

describe('MobileIdentityService', () => {
  it('uses one atomic normalized-phone verification call and server-derived token subjects', async () => {
    const store = new Store();
    const service = new MobileIdentityService({
      clock,
      otpSecret: 'otp-secret-long-enough-for-hmac-tests',
      session,
      store,
    });
    const result = await service.verify({
      challengeId: 'challenge-12345678',
      code: '12345',
      installationId: 'install-12345678',
      phone: '۰۹۱۲۳۴۵۶۷۸۹',
    });
    expect(store.verificationCalls).toHaveLength(1);
    expect(store.verificationCalls[0]).toMatchObject({
      phoneE164: '+989123456789',
      challengeId: 'challenge-12345678',
      code: '12345',
      installationId: 'install-12345678',
    });
    expect(result.status).toBe('verified');
    if (result.status === 'verified') {
      expect(store.verificationCalls[0]).toMatchObject({
        refreshTokenHash: session.hashRefreshToken(result.refreshToken),
      });
      expect(JSON.stringify(store.verificationCalls[0])).not.toContain(result.refreshToken);
      expect(session.verifyAccessToken(result.accessToken)).toEqual(
        expect.objectContaining({
          status: 'valid',
          claims: expect.objectContaining({ sub: 'learner-server', sid: 'session-server' }),
        }),
      );
    }
  });

  it('uses one atomic hash-only rotation call and collapses verification and reuse failures', async () => {
    const store = new Store();
    store.verifyAndCreate = async (input) => {
      store.verificationCalls.push(input);
      return { status: 'rejected' as const };
    };
    store.rotateRefresh = async (input) => {
      store.rotationCalls.push(input);
      return { status: 'reused' as const };
    };
    const service = new MobileIdentityService({
      clock,
      otpSecret: 'otp-secret-long-enough-for-hmac-tests',
      session,
      store,
    });
    const refreshToken = session.createRefreshToken();
    await expect(
      service.verify({
        challengeId: 'challenge-12345678',
        code: '12345',
        installationId: 'install-12345678',
        phone: '09123456789',
      }),
    ).resolves.toEqual({ status: 'verification_failed' });
    await expect(service.refresh({ sessionId: 'session-server', refreshToken })).resolves.toEqual({
      status: 'authentication_failed',
    });
    expect(store.rotationCalls).toHaveLength(1);
    expect(store.rotationCalls[0]).toMatchObject({
      sessionId: 'session-server',
      refreshTokenHash: session.hashRefreshToken(refreshToken),
    });
    expect(JSON.stringify(store.rotationCalls[0])).not.toContain(refreshToken);
  });
});
