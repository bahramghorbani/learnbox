import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  absoluteSessionLifetimeSeconds,
  createLearnerSession,
  inactivityWindowSeconds,
  learnerSessionCookie,
  readLearnerSession,
  renewLearnerSession,
} from '../lib/server-session';

/**
 * LB-B26 — session lifetime policy.
 *
 * Owner decision: 30-day absolute lifetime, 14-day inactivity expiry, sliding
 * renewal while valid, immediate invalidation on logout, and explicitly NOT an
 * effectively eternal session. These tests lock all four bounds, including the
 * one that is easiest to regress: renewal must never push a session past its
 * absolute deadline.
 */

const secret = 'test-session-secret-at-least-32-chars-long';
const day = 24 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 8, 29, 12, 0, 0);

function requestWithToken(token: string): Request {
  return new Request('https://app.learnboxapp.com/api/learner/progress', {
    headers: { cookie: `learnbox_alpha_session=${token}` },
  });
}

describe('learner session lifetime policy', () => {
  beforeEach(() => {
    process.env.LEARNBOX_SESSION_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.LEARNBOX_SESSION_SECRET;
  });

  it('issues a session whose first window is the inactivity bound, not the absolute one', () => {
    const token = createLearnerSession('user-a', t0);
    const session = readLearnerSession(requestWithToken(token), t0);

    expect(session).not.toBeNull();
    expect(session?.expiresAt).toBe(Math.floor(t0 / 1000) + inactivityWindowSeconds);
    expect(session?.issuedAt).toBe(Math.floor(t0 / 1000));
  });

  it('accepts a session that is idle for less than the inactivity window', () => {
    const token = createLearnerSession('user-a', t0);
    expect(readLearnerSession(requestWithToken(token), t0 + 13 * day)).not.toBeNull();
  });

  it('rejects a session idle beyond the 14-day inactivity window', () => {
    const token = createLearnerSession('user-a', t0);
    expect(readLearnerSession(requestWithToken(token), t0 + 15 * day)).toBeNull();
  });

  it('keeps an active session alive across repeated renewals', () => {
    let token = createLearnerSession('user-a', t0);
    let now = t0;

    // A learner returning every 10 days stays signed in without re-authenticating.
    for (let i = 0; i < 2; i += 1) {
      now += 10 * day;
      const session = readLearnerSession(requestWithToken(token), now);
      expect(session, `session should still be valid at day ${(now - t0) / day}`).not.toBeNull();
      const renewed = renewLearnerSession(session!, now);
      expect(renewed).not.toBeNull();
      token = renewed!;
    }

    expect(readLearnerSession(requestWithToken(token), now)).not.toBeNull();
  });

  it('never extends a session past the 30-day absolute bound, however often it renews', () => {
    let token = createLearnerSession('user-a', t0);
    let now = t0;

    // Renew aggressively — daily — for well over the absolute lifetime.
    for (let i = 0; i < 40; i += 1) {
      now += day;
      const session = readLearnerSession(requestWithToken(token), now);
      if (!session) break;
      const renewed = renewLearnerSession(session, now);
      if (!renewed) break;
      token = renewed;
    }

    // Past 30 days from issue, the session must be dead no matter what.
    expect(readLearnerSession(requestWithToken(token), t0 + 31 * day)).toBeNull();
  });

  it('caps the renewed window at the absolute deadline', () => {
    // Stay active so the session survives to day 25, then renew: only 5 days
    // remain under the 30-day cap, so the window must be clamped, not extended
    // by a further 14.
    let token = createLearnerSession('user-a', t0);
    const midpoint = t0 + 12 * day;
    token = renewLearnerSession(readLearnerSession(requestWithToken(token), midpoint)!, midpoint)!;

    const late = t0 + 25 * day;
    const session = readLearnerSession(requestWithToken(token), late);
    expect(session).not.toBeNull();

    const renewed = renewLearnerSession(session!, late);
    expect(renewed).not.toBeNull();

    const renewedSession = readLearnerSession(requestWithToken(renewed!), late);
    expect(renewedSession?.expiresAt).toBe(Math.floor(t0 / 1000) + absoluteSessionLifetimeSeconds);
    // Issue time is preserved, so the absolute bound cannot be reset by renewing.
    expect(renewedSession?.issuedAt).toBe(Math.floor(t0 / 1000));
  });

  it('refuses to renew once the absolute bound has passed', () => {
    const token = createLearnerSession('user-a', t0);
    const session = readLearnerSession(requestWithToken(token), t0 + 10 * day);
    expect(session).not.toBeNull();

    expect(renewLearnerSession(session!, t0 + 31 * day)).toBeNull();
  });

  it('preserves the session id across renewal so it stays revocable', () => {
    const token = createLearnerSession('user-a', t0);
    const session = readLearnerSession(requestWithToken(token), t0)!;
    const renewed = renewLearnerSession(session, t0 + day)!;
    const renewedSession = readLearnerSession(requestWithToken(renewed), t0 + day);

    expect(renewedSession?.sessionId).toBe(session.sessionId);
    expect(session.sessionId).toMatch(/^[a-zA-Z0-9-]{16,64}$/);
  });

  it('issues a distinct session id per sign-in', () => {
    const a = readLearnerSession(requestWithToken(createLearnerSession('user-a', t0)), t0);
    const b = readLearnerSession(requestWithToken(createLearnerSession('user-a', t0)), t0);
    expect(a?.sessionId).not.toBe(b?.sessionId);
  });

  it('rejects legacy v1 tokens, whose true age cannot be established', () => {
    // v1 carried no issuedAt, so the absolute bound is unknowable for it.
    const payload = Buffer.from(
      JSON.stringify({
        subject: 'user-a',
        scope: 'learner',
        expiresAt: Math.floor(t0 / 1000) + 3600,
      }),
    ).toString('base64url');
    const signed = `v1.${payload}`;
    const signature = createHmac('sha256', secret).update(signed).digest('base64url');

    expect(readLearnerSession(requestWithToken(`${signed}.${signature}`), t0)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = createLearnerSession('user-a', t0);
    const [version, payload, signature] = token.split('.');
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    forged.subject = 'user-b';
    const swapped = Buffer.from(JSON.stringify(forged)).toString('base64url');

    expect(
      readLearnerSession(requestWithToken(`${version}.${swapped}.${signature}`), t0),
    ).toBeNull();
  });

  it('rejects a future-dated session beyond clock-skew tolerance', () => {
    const token = createLearnerSession('user-a', t0 + 10 * day);
    expect(readLearnerSession(requestWithToken(token), t0)).toBeNull();
  });

  it('gives the cookie a lifetime that matches the session window', () => {
    const token = createLearnerSession('user-a', Date.now());
    const session = readLearnerSession(requestWithToken(token))!;
    const cookie = learnerSessionCookie(token, session);

    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    // Within a second of the sliding window; never the old fixed 8 hours.
    expect(cookie.maxAge).toBeGreaterThan(inactivityWindowSeconds - 5);
    expect(cookie.maxAge).toBeLessThanOrEqual(inactivityWindowSeconds);
    expect(cookie.maxAge).not.toBe(60 * 60 * 8);
  });

  it('returns no session when the secret is missing', () => {
    const token = createLearnerSession('user-a', t0);
    delete process.env.LEARNBOX_SESSION_SECRET;
    expect(readLearnerSession(requestWithToken(token), t0)).toBeNull();
  });
});
