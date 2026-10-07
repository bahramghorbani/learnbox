import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('pg', () => ({
  Pool: vi.fn(() => ({ query: queryMock, end: vi.fn() })),
}));
vi.mock('../../api/dist/database/migration-runner.js', () => ({
  requireVerifiedDatabaseTls: (url: string) => url,
}));

import { authenticateLearner, withSessionRenewal } from '../lib/learner-auth';
import {
  createLearnerSession,
  inactivityWindowSeconds,
  readLearnerSession,
} from '../lib/server-session';

/**
 * LB-B26 — server-side revocation must actually be ENFORCED.
 *
 * Recording a revocation is worthless if no request path reads it. These tests
 * pin the enforcement point: a revoked session is rejected, and a revocation-store
 * failure in production denies rather than silently honouring the token.
 */

const secret = 'test-session-secret-at-least-32-chars-long';
const day = 24 * 60 * 60 * 1000;

function requestFor(token: string): Request {
  return new Request('https://app.learnboxapp.com/api/learner/progress', {
    headers: { cookie: `learnbox_alpha_session=${token}` },
  });
}

describe('authenticateLearner', () => {
  const env = process.env as Record<string, string | undefined>;

  beforeEach(() => {
    env.LEARNBOX_SESSION_SECRET = secret;
    env.DATABASE_URL = 'postgresql://u:p@db.example/x?sslmode=require';
    queryMock.mockReset();
    (globalThis as { __learnboxAuthPool?: unknown }).__learnboxAuthPool = undefined;
  });

  afterEach(() => {
    delete env.LEARNBOX_SESSION_SECRET;
    delete env.DATABASE_URL;
    env.NODE_ENV = 'test';
  });

  it('accepts a valid session that is not blocked', async () => {
    queryMock.mockResolvedValue({ rows: [{ blocked: false }] });
    const session = await authenticateLearner(requestFor(createLearnerSession('user-a')));
    expect(session?.subject).toBe('user-a');
  });

  it('REJECTS a blocked session (revoked by logout, cut off, or suspended account)', async () => {
    queryMock.mockResolvedValue({ rows: [{ blocked: true }] });
    expect(await authenticateLearner(requestFor(createLearnerSession('user-a')))).toBeNull();
  });

  it('checks the block against this session id and subject', async () => {
    queryMock.mockResolvedValue({ rows: [{ blocked: false }] });
    const token = createLearnerSession('user-a');
    const expected = readLearnerSession(requestFor(token))!;

    await authenticateLearner(requestFor(token));

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe(expected.sessionId);
    expect(params[1]).toBe('user-a');
  });

  it('does not touch the database for a token that is already invalid', async () => {
    expect(await authenticateLearner(requestFor('v2.garbage.sig'))).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('DENIES in production when the revocation lookup fails (fail closed)', async () => {
    env.NODE_ENV = 'production';
    queryMock.mockRejectedValue(new Error('connection reset'));
    expect(await authenticateLearner(requestFor(createLearnerSession('user-a')))).toBeNull();
  });

  it('DENIES in production when no database is configured', async () => {
    env.NODE_ENV = 'production';
    delete env.DATABASE_URL;
    expect(await authenticateLearner(requestFor(createLearnerSession('user-a')))).toBeNull();
  });

  it('allows a signed session outside production when the store is unavailable', async () => {
    env.NODE_ENV = 'development';
    queryMock.mockRejectedValue(new Error('no db'));
    expect((await authenticateLearner(requestFor(createLearnerSession('user-a'))))?.subject).toBe(
      'user-a',
    );
  });
});

describe('withSessionRenewal', () => {
  beforeEach(() => {
    (process.env as Record<string, string | undefined>).LEARNBOX_SESSION_SECRET = secret;
  });
  afterEach(() => {
    delete (process.env as Record<string, string | undefined>).LEARNBOX_SESSION_SECRET;
  });

  const ok = () => new Response('{}', { status: 200 });

  it('does not renew a freshly issued session (throttled to about daily)', () => {
    const now = Date.now();
    const session = readLearnerSession(requestFor(createLearnerSession('user-a', now)), now)!;
    expect(withSessionRenewal(session, ok(), now).headers.get('set-cookie')).toBeNull();
  });

  it('renews an aged session and preserves issue time and session id', () => {
    const issued = Date.now();
    const token = createLearnerSession('user-a', issued);
    const later = issued + 3 * day;
    const session = readLearnerSession(requestFor(token), later)!;

    const response = withSessionRenewal(session, ok(), later);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('learnbox_alpha_session=');
    expect(setCookie).toContain('HttpOnly');

    const renewedToken = /learnbox_alpha_session=([^;]+)/.exec(setCookie)![1]!;
    const renewed = readLearnerSession(requestFor(renewedToken), later)!;
    expect(renewed.sessionId).toBe(session.sessionId);
    expect(renewed.issuedAt).toBe(session.issuedAt);
    expect(renewed.expiresAt).toBeGreaterThan(session.expiresAt);
  });

  it('keeps the response body and status when it renews', async () => {
    const issued = Date.now();
    const token = createLearnerSession('user-a', issued);
    const later = issued + 3 * day;
    const session = readLearnerSession(requestFor(token), later)!;
    const response = withSessionRenewal(
      session,
      Response.json({ authenticated: true }, { status: 200 }),
      later,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it('sets a cookie lifetime that never exceeds the inactivity window', () => {
    const issued = Date.now();
    const later = issued + 3 * day;
    const session = readLearnerSession(requestFor(createLearnerSession('user-a', issued)), later)!;
    const setCookie = withSessionRenewal(session, ok(), later).headers.get('set-cookie') ?? '';
    const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)![1]);
    expect(maxAge).toBeLessThanOrEqual(inactivityWindowSeconds);
    expect(maxAge).toBeGreaterThan(0);
  });
});
