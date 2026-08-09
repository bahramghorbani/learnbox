import { describe, expect, it } from 'vitest';

import { hashAdminSecret } from '../lib/server/admin-session';
import {
  clearAdminSessionCookie,
  loadAdminSession,
  verifyAdminCsrf,
} from '../lib/server/admin-route-security';

const hashKey = 'k'.repeat(32);
const now = new Date('2026-08-08T12:00:00.000Z');
const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: hashKey,
};

describe('admin route session security', () => {
  it('loads and touches only a valid hashed session cookie', async () => {
    const token = 't'.repeat(43);
    const tokenHash = hashAdminSecret(token, hashKey);
    const calls: string[] = [];
    const session = await loadAdminSession(
      new Request('https://admin.learnbox.app/api/auth/session', {
        headers: { cookie: `__Host-learnbox_admin_session=${token}` },
      }),
      config,
      {
        findActiveSession: async (receivedHash) => {
          calls.push(receivedHash);
          return {
            csrfHash: hashAdminSecret('csrf-token', hashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 1_000),
            revokedAt: null,
            recentAuthenticatedAt: now,
          };
        },
        touchSession: async (receivedHash) => {
          calls.push(receivedHash);
          return true;
        },
      },
      now,
    );

    expect(session).toEqual({
      tokenHash,
      recent: true,
      csrfHash: hashAdminSecret('csrf-token', hashKey),
    });
    expect(calls).toEqual([tokenHash, tokenHash]);
  });

  it('does not accept missing, expired, or untouchable sessions', async () => {
    const store = {
      findActiveSession: async () => undefined,
      touchSession: async () => true,
    };
    await expect(
      loadAdminSession(
        new Request('https://admin.learnbox.app/api/auth/session'),
        config,
        store,
        now,
      ),
    ).resolves.toBeUndefined();
  });

  it('requires a matching CSRF value for state-changing routes', () => {
    const request = new Request('https://admin.learnbox.app/api/auth/logout', {
      method: 'POST',
      headers: { 'x-learnbox-csrf-token': 'csrf-token' },
    });
    expect(() =>
      verifyAdminCsrf(request, hashAdminSecret('csrf-token', hashKey), config),
    ).not.toThrow();
    expect(() => verifyAdminCsrf(request, hashAdminSecret('different', hashKey), config)).toThrow(
      'CSRF',
    );
  });

  it('clears the host-only session cookie on logout', () => {
    expect(clearAdminSessionCookie()).toBe(
      '__Host-learnbox_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict',
    );
  });
});
