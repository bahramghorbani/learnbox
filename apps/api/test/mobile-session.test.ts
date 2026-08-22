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
  it('rejects wrong audience, tampering, and expiry', () => {
    const token = session.createAccessToken({
      learnerId: 'learner-1',
      sessionId: 'session-1',
      lifetimeMs: 0,
    });
    expect(session.verifyAccessToken(token)).toEqual({ status: 'invalid' });
    expect(session.verifyAccessToken(`${token}x`)).toEqual({ status: 'invalid' });
    const other = new MobileSessionContract({
      audience: 'other',
      clock,
      key: 'mobile-session-test-key-long-enough',
      random,
    });
    expect(
      other.verifyAccessToken(
        session.createAccessToken({ learnerId: 'learner-1', sessionId: 'session-1' }),
      ),
    ).toEqual({ status: 'invalid' });
  });
  it('creates opaque 256-bit refresh values and keyed hashes', () => {
    const refresh = session.createRefreshToken();
    expect(refresh).toBe('BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc');
    expect(session.hashRefreshToken(refresh)).not.toBe(refresh);
    expect(session.refreshTokenEquals(session.hashRefreshToken(refresh), refresh)).toBe(true);
  });
});
