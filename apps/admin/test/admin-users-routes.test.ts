import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createAdminUserPackEntitlementRoute,
  createAdminUserPacksRoute,
  createAdminUserStatusRoute,
  createAdminUsersRoute,
} from '../lib/server/admin-users-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import type {
  ReadPackEntitlementsResult,
  SetPackEntitlementResult,
} from '../lib/server/postgres-admin-users-store';

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

describe('support pack entitlement routes', () => {
  const packId = 'm32-paid-pack';
  const packRow = {
    packId,
    title: 'بستهٔ پولی',
    isFree: false,
    published: true,
    acquisition: 'support' as const,
    acquiredAt: '2026-10-07T09:15:00+00:00',
    purchase: null,
    hasAccess: true,
    accessVia: 'entitlement' as const,
    grant: 'already_owned' as const,
    revoke: 'allowed' as const,
  };

  type PackOverrides = {
    read?: ReadPackEntitlementsResult;
    set?: SetPackEntitlementResult;
  };

  function packStore(overrides: PackOverrides = {}) {
    return {
      readPackEntitlements: vi.fn(
        async () => overrides.read ?? { status: 'ok' as const, rows: [packRow] },
      ),
      setPackEntitlement: vi.fn(
        async () => overrides.set ?? { status: 'applied' as const, row: packRow },
      ),
    };
  }

  function packDeps(overrides: Parameters<typeof sessionStore>[0] & PackOverrides = {}) {
    return {
      enabled: true,
      config,
      sessionStore: sessionStore(overrides),
      store: packStore(overrides),
      now: () => now,
    };
  }

  const grantBody = { userId: targetUserId, packId, action: 'grant', reason: 'جبران خرید ناموفق' };

  function packPost(body: unknown, headers: Record<string, string> = {}, omit: string[] = []) {
    const base: Record<string, string> = {
      Origin: config.origin,
      'Content-Type': 'application/json',
      'x-learnbox-csrf-token': csrfToken,
      Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      'Idempotency-Key': idempotencyKey,
      ...headers,
    };
    for (const key of omit) delete base[key];
    return new Request('https://admin.learnbox.app/api/support/users/packs', {
      method: 'POST',
      headers: base,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  function packGet(query = `?userId=${targetUserId}`) {
    return new Request(`https://admin.learnbox.app/api/support/users/packs${query}`, {
      headers: { Cookie: `__Host-learnbox_admin_session=${sessionToken}` },
    });
  }

  it('returns the canonical entitlement view for an authenticated operator', async () => {
    const deps = packDeps();
    const response = await createAdminUserPacksRoute(deps)(packGet());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ packs: [packRow] });
    expect(deps.store.readPackEntitlements).toHaveBeenCalledWith({
      actorUserId,
      userId: targetUserId,
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('refuses the view without a session, with a bad target, and while the flag is off', async () => {
    expect((await createAdminUserPacksRoute(packDeps({ userId: null }))(packGet())).status).toBe(
      401,
    );
    expect(
      (await createAdminUserPacksRoute(packDeps())(packGet('?userId=not-a-uuid'))).status,
    ).toBe(400);
    expect((await createAdminUserPacksRoute(packDeps())(packGet(''))).status).toBe(400);
    const off = { ...packDeps(), enabled: false };
    expect((await createAdminUserPacksRoute(off)(packGet())).status).toBe(404);
    const roleless = packDeps({ read: { status: 'forbidden' } });
    expect((await createAdminUserPacksRoute(roleless)(packGet())).status).toBe(404);
  });

  it('grants and revokes for a fully authorized operator', async () => {
    for (const action of ['grant', 'revoke'] as const) {
      const deps = packDeps();
      const response = await createAdminUserPackEntitlementRoute(deps)(
        packPost({ ...grantBody, action }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'applied', pack: packRow });
      expect(deps.store.setPackEntitlement).toHaveBeenCalledWith({
        actorUserId,
        userId: targetUserId,
        packId,
        action,
        reason: 'جبران خرید ناموفق',
        idempotencyKey,
      });
    }
  });

  it('refuses every unauthorized caller before the store is reached', async () => {
    const requests = [
      packPost(grantBody, {}, ['Cookie']),
      packPost(grantBody, { Origin: 'https://evil.example' }),
      packPost(grantBody, {}, ['x-learnbox-csrf-token']),
      packPost(grantBody, { 'x-learnbox-csrf-token': 'x'.repeat(43) }),
      packPost(grantBody, {}, ['Idempotency-Key']),
      packPost(grantBody, { 'Content-Type': 'text/plain' }),
    ];
    for (const request of requests) {
      const deps = packDeps();
      const response = await createAdminUserPackEntitlementRoute(deps)(request);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(deps.store.setPackEntitlement).not.toHaveBeenCalled();
    }

    // Stale re-authentication is its own refusal: the operator must prove presence again.
    const stale = packDeps({ recent: false });
    expect((await createAdminUserPackEntitlementRoute(stale)(packPost(grantBody))).status).toBe(
      428,
    );
    expect(stale.store.setPackEntitlement).not.toHaveBeenCalled();

    const missingSession = packDeps({ userId: null });
    expect(
      (await createAdminUserPackEntitlementRoute(missingSession)(packPost(grantBody))).status,
    ).toBe(401);

    const off = { ...packDeps(), enabled: false };
    expect((await createAdminUserPackEntitlementRoute(off)(packPost(grantBody))).status).toBe(404);
  });

  it('demands a real human-readable reason in BOTH directions', async () => {
    for (const action of ['grant', 'revoke'] as const) {
      for (const reason of [undefined, '', '   ', 'ok', 42, null, 'x'.repeat(501)]) {
        const deps = packDeps();
        const response = await createAdminUserPackEntitlementRoute(deps)(
          packPost({ userId: targetUserId, packId, action, reason }),
        );
        expect(response.status).toBe(400);
        expect(deps.store.setPackEntitlement).not.toHaveBeenCalled();
      }
    }
  });

  it('refuses an unknown action, a malformed target and a malformed pack id', async () => {
    for (const body of [
      { userId: targetUserId, packId, action: 'delete', reason: 'اقدام ناشناس' },
      { userId: targetUserId, packId, action: 'refund', reason: 'بازپرداخت' },
      { userId: targetUserId, packId, reason: 'بدون اقدام' },
      { userId: 'not-a-uuid', packId, action: 'grant', reason: 'هدف نامعتبر' },
      { userId: targetUserId, packId: 'bad pack id', action: 'grant', reason: 'بستهٔ نامعتبر' },
      { userId: targetUserId, packId: 'p'.repeat(200), action: 'grant', reason: 'بستهٔ بلند' },
      { userId: targetUserId, action: 'grant', reason: 'بدون بسته' },
      'not json at all',
      [grantBody],
    ]) {
      const deps = packDeps();
      const response = await createAdminUserPackEntitlementRoute(deps)(packPost(body));
      expect(response.status).toBe(400);
      expect(deps.store.setPackEntitlement).not.toHaveBeenCalled();
    }
  });

  it('reports a refused action as 409 with the verdict, not as success', async () => {
    const verdicts = ['purchased', 'free_acquisition', 'not_entitled', 'already_owned'] as const;
    for (const verdict of verdicts) {
      const deps = packDeps({ set: { status: 'refused', verdict, row: packRow } });
      const response = await createAdminUserPackEntitlementRoute(deps)(packPost(grantBody));
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ status: 'refused', verdict, pack: packRow });
    }
  });

  it('hides a role-less operator and an unknown target behind the same 404', async () => {
    for (const outcome of ['forbidden', 'not_found'] as const) {
      const deps = packDeps({ set: { status: outcome } });
      expect((await createAdminUserPackEntitlementRoute(deps)(packPost(grantBody))).status).toBe(
        404,
      );
    }
  });

  it('never leaks internals when the database fails', async () => {
    const deps = {
      ...packDeps(),
      store: {
        setPackEntitlement: vi.fn(async () => {
          throw new Error('connection terminated: host=db-primary password=hunter2');
        }),
      },
    };
    const response = await createAdminUserPackEntitlementRoute(deps)(packPost(grantBody));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/hunter2|db-primary/);
  });
});

describe('support surface source boundary', () => {
  const root = join(__dirname, '..');
  const source = (relative: string) => readFileSync(join(root, relative), 'utf8');
  const surface = [
    'lib/server/admin-users-routes.ts',
    'lib/server/postgres-admin-users-store.ts',
    'app/api/support/users/route.ts',
    'app/api/support/users/status/route.ts',
    'app/api/support/users/packs/route.ts',
  ];

  it('cannot delete an account or touch learning state', () => {
    for (const file of surface) {
      const text = source(file);
      expect(text).not.toMatch(/account_deletion_events/);
      // Learning state is read for context (counts) and never written.
      expect(text).not.toMatch(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+(card_schedules|review_events)/i,
      );
    }
  });

  /**
   * M3.2 gives this surface exactly one DELETE. It must stay exactly one, and it must stay scoped
   * to a support-issued entitlement — the statement itself is the guard that makes a purchased or
   * self-activated entitlement unremovable, so a change here is a change to the safety property.
   */
  it('owns exactly one delete, and it can only remove a support-issued entitlement', () => {
    const statements = surface.flatMap((file) => source(file).match(/DELETE\s+FROM[^`]*/gi) ?? []);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/DELETE FROM user_packs/);
    expect(statements[0]).toMatch(/acquisition_type = 'support'/);
  });

  it('never writes payment history', () => {
    for (const file of surface) {
      const text = source(file);
      expect(text).not.toMatch(/INSERT INTO purchase_events/i);
      expect(text).not.toMatch(/UPDATE\s+purchase_events/i);
      expect(text).not.toMatch(/DELETE\s+FROM\s+purchase_events/i);
      // A support grant may never attach itself to a transaction.
      expect(text).not.toMatch(/INSERT INTO user_packs[^`]*purchase_event_id/i);
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
