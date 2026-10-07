import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAdminUserStatusRoute,
  createAdminUsersRoute,
} from '../lib/server/admin-users-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 3 / Milestone 3.1 — account status route boundary.
 *
 * Suspending a learner's account is as hard to trigger as publishing content or changing a price:
 * unauthenticated, cross-origin, CSRF-less, stale-reauth, key-less and reason-less callers are all
 * refused BEFORE the store is reached, and the whole surface is 404 while the flag is off.
 *
 * The second guarantee is about blast radius: this boundary can change one account's status and
 * nothing else. It has no delete path, no entitlement path and no learning-state path, so no
 * creative request body turns it into one.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-07T09:15:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const targetUserId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '33333333-3333-4333-8333-333333333333';

function sessionStore(overrides: { userId?: string | null; recent?: boolean } = {}) {
  const recent = overrides.recent !== false;
  return {
    findActiveSession: async () =>
      overrides.userId === null
        ? undefined
        : {
            userId: overrides.userId ?? actorUserId,
            csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 86_400_000),
          },
    touchSession: async () => true,
  };
}

const userRow = {
  id: targetUserId,
  phone: '+989120000001',
  firstName: 'سارا',
  lastName: 'محمدی',
  status: 'disabled' as const,
  createdAt: '2026-09-01T10:00:00+00:00',
  cardsStarted: 12,
  reviewCount: 48,
  lastActivityAt: '2026-10-05T18:20:00+00:00',
};

function store() {
  return {
    listUsers: vi.fn(async () => ({ status: 'ok' as const, rows: [userRow], total: 1 })),
    setUserStatus: vi.fn(async () => ({ status: 'applied' as const, row: userRow })),
  };
}

function dependencies(overrides: Parameters<typeof sessionStore>[0] = {}) {
  return {
    enabled: true,
    config,
    sessionStore: sessionStore(overrides),
    store: store(),
    now: () => now,
  };
}

const validBody = { userId: targetUserId, status: 'disabled', reason: 'گزارش تخلف شمارهٔ ۴۲' };

function post(body: unknown, headers: Record<string, string> = {}, omit: string[] = []) {
  const base: Record<string, string> = {
    Origin: config.origin,
    'Content-Type': 'application/json',
    'x-learnbox-csrf-token': csrfToken,
    Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
    'Idempotency-Key': idempotencyKey,
    ...headers,
  };
  for (const key of omit) delete base[key];
  return new Request('https://admin.learnbox.app/api/support/users/status', {
    method: 'POST',
    headers: base,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function listRequest(query = '') {
  return new Request(`https://admin.learnbox.app/api/support/users${query}`, {
    headers: { Cookie: `__Host-learnbox_admin_session=${sessionToken}` },
  });
}

describe('support users list route', () => {
  it('returns canonical rows with status for an authenticated operator', async () => {
    const deps = dependencies();
    const response = await createAdminUsersRoute(deps)(listRequest('?q=9120'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ users: [userRow], total: 1 });
    expect(deps.store.listUsers).toHaveBeenCalledWith({ actorUserId, search: '9120' });
    // Personal data is never cached by a browser or an intermediary.
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('is 404 while the support flag is off, and 404 for a role-less operator', async () => {
    expect(
      (await createAdminUsersRoute({ ...dependencies(), enabled: false })(listRequest())).status,
    ).toBe(404);
    const forbidden = {
      ...dependencies(),
      store: { listUsers: vi.fn(async () => ({ status: 'forbidden' as const })) },
    };
    expect((await createAdminUsersRoute(forbidden)(listRequest())).status).toBe(404);
  });

  it('refuses an unauthenticated caller and an oversized search', async () => {
    const anonymous = await createAdminUsersRoute(dependencies({ userId: null }))(listRequest());
    expect(anonymous.status).toBe(401);
    const long = await createAdminUsersRoute(dependencies())(listRequest(`?q=${'x'.repeat(65)}`));
    expect(long.status).toBe(400);
  });
});

describe('account status route', () => {
  it('applies a status change for an authorized, fresh, keyed, reasoned request', async () => {
    const deps = dependencies();
    const response = await createAdminUserStatusRoute(deps)(post(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'applied', user: userRow });
    expect(deps.store.setUserStatus).toHaveBeenCalledWith({
      actorUserId,
      userId: targetUserId,
      status: 'disabled',
      reason: 'گزارش تخلف شمارهٔ ۴۲',
      idempotencyKey,
    });
  });

  it('reports an idempotent repeat and an unchanged account without inventing a new state', async () => {
    for (const outcome of ['idempotent', 'unchanged'] as const) {
      const deps = {
        ...dependencies(),
        store: { setUserStatus: vi.fn(async () => ({ status: outcome, row: userRow })) },
      };
      const response = await createAdminUserStatusRoute(deps)(post(validBody));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: outcome, user: userRow });
    }
  });

  it('is 404 while the support flag is off', async () => {
    const response = await createAdminUserStatusRoute({ ...dependencies(), enabled: false })(
      post(validBody),
    );
    expect(response.status).toBe(404);
  });

  it('refuses unauthenticated, cross-origin and CSRF-less callers before the store', async () => {
    const anonymous = dependencies({ userId: null });
    expect((await createAdminUserStatusRoute(anonymous)(post(validBody))).status).toBe(401);
    expect(anonymous.store.setUserStatus).not.toHaveBeenCalled();

    const crossOrigin = dependencies();
    const response = await createAdminUserStatusRoute(crossOrigin)(
      post(validBody, { Origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(400);
    expect(crossOrigin.store.setUserStatus).not.toHaveBeenCalled();

    const noCsrf = dependencies();
    expect(
      (await createAdminUserStatusRoute(noCsrf)(post(validBody, {}, ['x-learnbox-csrf-token'])))
        .status,
    ).toBe(400);
    expect(noCsrf.store.setUserStatus).not.toHaveBeenCalled();

    const wrongCsrf = dependencies();
    expect(
      (
        await createAdminUserStatusRoute(wrongCsrf)(
          post(validBody, { 'x-learnbox-csrf-token': 'x'.repeat(43) }),
        )
      ).status,
    ).toBe(400);
    expect(wrongCsrf.store.setUserStatus).not.toHaveBeenCalled();
  });

  it('demands recent re-authentication', async () => {
    const stale = dependencies({ recent: false });
    const response = await createAdminUserStatusRoute(stale)(post(validBody));
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ code: 'reauthentication_required' });
    expect(stale.store.setUserStatus).not.toHaveBeenCalled();
  });

  it('demands an idempotency key', async () => {
    const deps = dependencies();
    expect(
      (await createAdminUserStatusRoute(deps)(post(validBody, {}, ['Idempotency-Key']))).status,
    ).toBe(400);
    expect(deps.store.setUserStatus).not.toHaveBeenCalled();
  });

  it('demands a real human-readable reason', async () => {
    for (const reason of [undefined, '', '  ', 'ok', 42, null, 'x'.repeat(501)]) {
      const deps = dependencies();
      const response = await createAdminUserStatusRoute(deps)(
        post({ userId: targetUserId, status: 'disabled', reason }),
      );
      expect(response.status).toBe(400);
      expect(deps.store.setUserStatus).not.toHaveBeenCalled();
    }
  });

  it('refuses a status outside the canonical pair and a malformed target', async () => {
    for (const body of [
      { userId: targetUserId, status: 'deleted', reason: 'حذف کامل' },
      { userId: targetUserId, status: 'suspended', reason: 'تعلیق' },
      { userId: 'not-a-uuid', status: 'disabled', reason: 'هدف نامعتبر' },
      { status: 'disabled', reason: 'بدون کاربر' },
      'not json at all',
      [{ userId: targetUserId, status: 'disabled', reason: 'آرایه' }],
    ]) {
      const deps = dependencies();
      const response = await createAdminUserStatusRoute(deps)(post(body));
      expect(response.status).toBe(400);
      expect(deps.store.setUserStatus).not.toHaveBeenCalled();
    }
  });

  it('hides a role-less operator and an unknown target behind the same 404', async () => {
    for (const outcome of ['forbidden', 'not_found'] as const) {
      const deps = {
        ...dependencies(),
        store: { setUserStatus: vi.fn(async () => ({ status: outcome })) },
      };
      const response = await createAdminUserStatusRoute(deps)(post(validBody));
      expect(response.status).toBe(404);
    }
  });

  it('never leaks internals when the database fails', async () => {
    const deps = {
      ...dependencies(),
      store: {
        setUserStatus: vi.fn(async () => {
          throw new Error('connection terminated: host=db-primary password=hunter2');
        }),
      },
    };
    const response = await createAdminUserStatusRoute(deps)(post(validBody));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/hunter2|db-primary/);
  });
});

describe('support surface source boundary', () => {
  const root = join(__dirname, '..');
  const source = (relative: string) => readFileSync(join(root, relative), 'utf8');

  it('cannot delete an account, grant an entitlement or touch learning state', () => {
    for (const file of [
      'lib/server/admin-users-routes.ts',
      'lib/server/postgres-admin-users-store.ts',
      'app/api/support/users/route.ts',
      'app/api/support/users/status/route.ts',
    ]) {
      const text = source(file);
      expect(text).not.toMatch(/DELETE\s+FROM/i);
      expect(text).not.toMatch(
        /user_packs|purchase_events|card_schedules\s+SET|review_events\s+SET/,
      );
      expect(text).not.toMatch(/account_deletion_events/);
    }
  });

  it('writes the canonical audit trail and the canonical session cutoff, not private copies', () => {
    const store = source('lib/server/postgres-admin-users-store.ts');
    expect(store).toMatch(/INSERT INTO audit_logs/);
    expect(store).toMatch(/INSERT INTO user_session_cutoffs/);
    // No second audit or suspension table may appear alongside the canonical ones.
    expect(store).not.toMatch(/admin_audit_log|user_suspensions|support_actions/);
  });
});
