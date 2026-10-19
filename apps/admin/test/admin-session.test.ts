import { describe, expect, it } from 'vitest';

import {
  adminSessionCookie,
  createAdminSessionSecrets,
  evaluateAdminSession,
  hashAdminSecret,
} from '../lib/server/admin-session';

const hashKey = 'h'.repeat(32);
const now = new Date('2026-08-08T12:00:00.000Z');

describe('admin session secrets', () => {
  it('creates independent opaque values and persists only keyed hashes', () => {
    let fill = 0;
    const random = (size: number) => Buffer.alloc(size, (fill += 1));
    const secrets = createAdminSessionSecrets(hashKey, random);

    expect(secrets.token).not.toBe(secrets.csrfToken);
    expect(secrets.tokenHash).toBe(hashAdminSecret(secrets.token, hashKey));
    expect(secrets.csrfHash).toBe(hashAdminSecret(secrets.csrfToken, hashKey));
    expect(secrets.tokenHash).not.toContain(secrets.token);
    expect(secrets.csrfHash).not.toContain(secrets.csrfToken);
  });
});

describe('evaluateAdminSession', () => {
  const activeSession = {
    lastSeenAt: new Date(now.getTime() - 14 * 60_000),
    absoluteExpiresAt: new Date(now.getTime() + 1_000),
    revokedAt: null,
    recentAuthenticatedAt: new Date(now.getTime() - 4 * 60_000),
  };

  it('accepts a one-hour operational window while retaining the five-minute sensitive window', () => {
    expect(evaluateAdminSession(activeSession, now)).toEqual({
      active: true,
      operational: true,
      recent: true,
    });
    expect(
      evaluateAdminSession(
        { ...activeSession, recentAuthenticatedAt: new Date(now.getTime() - 5 * 60_000 - 1) },
        now,
      ),
    ).toEqual({ active: true, operational: true, recent: false });
    expect(
      evaluateAdminSession(
        { ...activeSession, recentAuthenticatedAt: new Date(now.getTime() - 60 * 60_000 - 1) },
        now,
      ),
    ).toEqual({ active: true, operational: false, recent: false });
  });

  it('rejects idle, absolutely expired, and revoked sessions', () => {
    expect(
      evaluateAdminSession(
        { ...activeSession, lastSeenAt: new Date(now.getTime() - 60 * 60_000 - 1) },
        now,
      ),
    ).toEqual({ active: false, reason: 'idle_expired' });
    expect(
      evaluateAdminSession({ ...activeSession, absoluteExpiresAt: new Date(now.getTime()) }, now),
    ).toEqual({ active: false, reason: 'absolute_expired' });
    expect(evaluateAdminSession({ ...activeSession, revokedAt: new Date() }, now)).toEqual({
      active: false,
      reason: 'revoked',
    });
  });
});

describe('adminSessionCookie', () => {
  it('uses strict host-only production attributes', () => {
    expect(adminSessionCookie('opaque-token')).toBe(
      '__Host-learnbox_admin_session=opaque-token; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Strict',
    );
  });
});
