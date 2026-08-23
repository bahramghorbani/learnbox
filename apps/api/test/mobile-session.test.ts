import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  MobileSessionContract,
  type MobileSessionClock,
  type MobileSessionRandom,
} from '../src/auth/mobile-session.js';

const clock: MobileSessionClock = { now: () => new Date('2026-08-23T12:00:00Z') };
const random: MobileSessionRandom = { bytes: (size) => Buffer.alloc(size, 7) };
const session = new MobileSessionContract({
  audience: 'learnbox-mobile',
  clock,
  key: 'mobile-session-test-key-long-enough',
  random,
});

describe('MobileSessionContract', () => {
  it('signs deterministic versioned audience-scoped 15-minute access claims only', () => {
    const token = session.createAccessToken({ learnerId: 'learner-1', sessionId: 'session-1' });
    expect(token).toBe(
      session.createAccessToken({ learnerId: 'learner-1', sessionId: 'session-1' }),
    );
    expect(session.verifyAccessToken(token)).toEqual({
      status: 'valid',
      claims: {
        sub: 'learner-1',
        sid: 'session-1',
        iat: 1_787_486_400,
        exp: 1_787_487_300,
        jti: 'BwcHBwcHBwcHBwcHBwcHBw',
      },
    });
    expect(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).toBe(
      '{"sub":"learner-1","sid":"session-1","iat":1787486400,"exp":1787487300,"jti":"BwcHBwcHBwcHBwcHBwcHBw"}',
    );
  });
  it('rejects wrong audience, tampering, future issuance, extra claims, and expiry', () => {
    const token = session.createAccessToken({ learnerId: 'learner-1', sessionId: 'session-1' });
    expect(session.verifyAccessToken(`${token}x`)).toEqual({ status: 'invalid' });
    const other = new MobileSessionContract({
      audience: 'other',
      clock,
      key: 'mobile-session-test-key-long-enough',
      random,
    });
    expect(other.verifyAccessToken(token)).toEqual({ status: 'invalid' });

    const expired = new MobileSessionContract({
      audience: 'learnbox-mobile',
      clock: { now: () => new Date('2026-08-23T12:15:00Z') },
      key: 'mobile-session-test-key-long-enough',
      random,
    });
    expect(expired.verifyAccessToken(token)).toEqual({ status: 'invalid' });

    const futureIssuer = new MobileSessionContract({
      audience: 'learnbox-mobile',
      clock: { now: () => new Date('2026-08-23T12:00:01Z') },
      key: 'mobile-session-test-key-long-enough',
      random,
    });
    expect(
      session.verifyAccessToken(futureIssuer.createAccessToken({ learnerId: 'l', sessionId: 's' })),
    ).toEqual({
      status: 'invalid',
    });

    const [header, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object;
    const extraPayload = Buffer.from(
      JSON.stringify({ ...claims, phone: '+989123456789' }),
    ).toString('base64url');
    const signature = createHmac('sha256', 'mobile-session-test-key-long-enough')
      .update(`${header}.${extraPayload}`)
      .digest('base64url');
    expect(session.verifyAccessToken(`${header}.${extraPayload}.${signature}`)).toEqual({
      status: 'invalid',
    });
  });
  it('creates opaque 256-bit refresh values and keyed hashes', () => {
    const refresh = session.createRefreshToken();
    expect(refresh).toBe('BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc');
    expect(session.hashRefreshToken(refresh)).not.toBe(refresh);
    expect(session.refreshTokenEquals(session.hashRefreshToken(refresh), refresh)).toBe(true);
  });

  it('rejects weak keys and incorrect injected entropy lengths', () => {
    expect(
      () =>
        new MobileSessionContract({
          audience: 'learnbox-mobile',
          clock,
          key: 'too-short',
          random,
        }),
    ).toThrow(/configuration/);
    const wrongEntropy = new MobileSessionContract({
      audience: 'learnbox-mobile',
      clock,
      key: 'mobile-session-test-key-long-enough',
      random: { bytes: () => Buffer.alloc(1) },
    });
    expect(() =>
      wrongEntropy.createAccessToken({ learnerId: 'learner', sessionId: 'session' }),
    ).toThrow(/entropy/);
    expect(() => wrongEntropy.createRefreshToken()).toThrow(/entropy/);
  });
});
