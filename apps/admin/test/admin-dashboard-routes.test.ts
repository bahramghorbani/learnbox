import { describe, expect, it, vi } from 'vitest';

import { createAdminDashboardOverviewRoute } from '../lib/server/admin-dashboard-routes';
import { PostgresAdminDashboardStore } from '../lib/server/postgres-admin-dashboard-store';
import { readAdminDashboardConfig } from '../lib/server/admin-content-packs-config';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Stage 2 — Admin Dashboard boundary.
 *
 * Four guarantees under test.
 *
 * 1. The surface is gated exactly like every other Admin read surface: flag off → 404, no session
 *    → 401, valid session without an operational role → 404 (never 403, which would confirm the
 *    surface exists to someone who may not use it).
 * 2. It is read-only. The module exports no mutating verb, and a non-GET request cannot reach a
 *    write path because there is none.
 * 3. No aggregate is computed from a list, and no metric without a live source is reported as 0.
 * 4. The payload carries no personal learner field — the query that feeds the recent-learner panel
 *    does not even select one.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-12T09:00:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';

function sessionStore(overrides: { userId?: string | null } = {}) {
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
            recentAuthenticatedAt: now,
          },
    touchSession: async () => true,
  };
}

function request(url = 'https://admin.learnbox.app/api/dashboard/overview') {
  return new Request(url, {
    headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
  });
}

const counterRow = {
  learner_total: '1204',
  learner_joined_in_window: '37',
  learner_active_in_window: '512',
  pack_total: '31',
  pack_published: '24',
  pack_published_in_window: '4',
  pack_needs_review: '5',
  pack_draft: '2',
  review_queue_cards: '9',
};

/**
 * A fake pool that answers by matching the statement, so each test can assert on the SQL the store
 * actually issues rather than on a mock's call order.
 */
function pool(options: { hasRole?: boolean; purchases?: boolean } = {}) {
  const statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes('admin_role_assignments'))
      return { rows: options.hasRole === false ? [] : [{ '?column?': 1 }] };
    if (sql.includes('WITH learner AS')) return { rows: [counterRow] };
    if (sql.includes('FROM card_versions'))
      return {
        rows: [
          { status: 'published', total: '120' },
          { status: 'needs_review', total: '80' },
        ],
      };
    if (sql.includes('width_bucket') && sql.includes('FROM users'))
      return { rows: [{ bucket: '30', total: '3' }] };
    if (sql.includes('verified_total'))
      return { rows: [{ verified_total: '18', revenue_in_window: '5400000' }] };
    if (sql.includes('width_bucket') && sql.includes('FROM purchase_events'))
      return { rows: [{ bucket: '30', total: '2', revenue: '300000' }] };
    if (sql.includes('FROM users\n          ORDER BY created_at DESC'))
      return {
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'active',
            created_at: new Date('2026-10-10T08:00:00.000Z'),
          },
        ],
      };
    if (sql.includes('FROM packs p'))
      return {
        rows: [
          {
            id: 'pack-1',
            display_name: 'بستهٔ آزمون',
            status: 'needs_review',
            created_at: new Date('2026-10-09T08:00:00.000Z'),
            card_count: '42',
          },
        ],
      };
    if (sql.includes('FROM audit_logs'))
      return {
        rows: [
          {
            action: 'content_pack.edit',
            entity_type: 'content_pack',
            created_at: new Date('2026-10-12T08:30:00.000Z'),
          },
        ],
      };
    return { rows: [] };
  };
  const release = vi.fn();
  return {
    statements,
    release,
    query,
    connect: async () => ({ query, release }),
  };
}

function route(options: {
  enabled?: boolean;
  hasRole?: boolean;
  userId?: string | null;
  environment?: Record<string, string | undefined>;
  store?: ReturnType<typeof pool>;
}) {
  const fakePool = options.store ?? pool({ hasRole: options.hasRole });
  return {
    fakePool,
    handler: createAdminDashboardOverviewRoute({
      enabled: options.enabled ?? true,
      config,
      sessionStore: sessionStore({ userId: options.userId }),
      store: new PostgresAdminDashboardStore(fakePool as never),
      now: () => now,
      environment: options.environment ?? {},
    }),
  };
}

describe('admin dashboard overview route', () => {
  it('is 404 while the dashboard flag is off', async () => {
    const { handler } = route({ enabled: false });
    expect((await handler(request())).status).toBe(404);
  });

  it('is 401 without a valid admin session', async () => {
    const { handler } = route({ userId: null });
    expect((await handler(request())).status).toBe(401);
  });

  it('is 404 — not 403 — for a signed-in actor without an operational role', async () => {
    const { handler } = route({ hasRole: false });
    const response = await handler(request());
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('role');
  });

  it('returns pre-aggregated counters, never list lengths', async () => {
    const { handler, fakePool } = route({});
    const response = await handler(request());
    expect(response.status).toBe(200);
    const { overview } = (await response.json()) as { overview: Record<string, never> };
    const typed = overview as unknown as {
      learners: { total: number; activeInWindow: number; joinedInWindow: number };
      packs: { published: number; needsReview: number };
      reviewQueueCards: number;
      recentLearners: unknown[];
      recentPacks: unknown[];
    };
    expect(typed.learners.total).toBe(1204);
    expect(typed.learners.activeInWindow).toBe(512);
    expect(typed.packs.published).toBe(24);
    expect(typed.reviewQueueCards).toBe(9);
    // The totals are far larger than the lists, which is the point: nothing is a list length.
    expect(typed.recentLearners).toHaveLength(1);
    expect(typed.recentPacks).toHaveLength(1);
    expect(fakePool.statements.some((sql) => sql.includes('count(*)'))).toBe(true);
  });

  it('reports the online-learner metric as unavailable, never as zero', async () => {
    const { handler } = route({});
    const { overview } = (await (await handler(request())).json()) as {
      overview: { learners: { onlineNow: { state: string; reason?: string } } };
    };
    expect(overview.learners.onlineNow).toEqual({
      state: 'unavailable',
      reason: 'no_data_source',
    });
  });

  it('reports sales and revenue as unavailable while the paid flow is off', async () => {
    const { handler, fakePool } = route({ environment: {} });
    const { overview } = (await (await handler(request())).json()) as {
      overview: {
        sales: { gatewayEnvironment: null; verifiedTotal: { state: string; reason: string } };
        salesSeries: null;
      };
    };
    expect(overview.sales.gatewayEnvironment).toBeNull();
    expect(overview.sales.verifiedTotal).toEqual({
      state: 'unavailable',
      reason: 'payments_disabled',
    });
    expect(overview.salesSeries).toBeNull();
    // With payments off the store must not even touch the purchase table.
    expect(fakePool.statements.some((sql) => sql.includes('purchase_events'))).toBe(false);
  });

  it('reads real sales for the configured gateway environment once the paid flow is on', async () => {
    const { handler, fakePool } = route({
      environment: { LEARNBOX_ZARINPAL_ENABLED: 'true', ZARINPAL_SANDBOX: 'false' },
    });
    const { overview } = (await (await handler(request())).json()) as {
      overview: {
        sales: {
          gatewayEnvironment: string;
          verifiedTotal: { state: string; value: number };
          revenueTomansInWindow: { state: string; value: number };
        };
        salesSeries: { day: string; count: number; revenueTomans: number }[];
      };
    };
    expect(overview.sales.gatewayEnvironment).toBe('production');
    expect(overview.sales.verifiedTotal).toEqual({ state: 'available', value: 18 });
    expect(overview.sales.revenueTomansInWindow).toEqual({ state: 'available', value: 5400000 });
    // The series is dense: one point per bucket in the window, so a gap reads as a real zero
    // rather than a missing day the chart would silently shorten.
    expect(overview.salesSeries).toHaveLength(30);
    expect(overview.salesSeries.at(-1)).toEqual({
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
      count: 2,
      revenueTomans: 300000,
    });
    expect(overview.salesSeries.slice(0, 29).every((point) => point.count === 0)).toBe(true);
    expect(fakePool.statements.some((sql) => sql.includes("provider = 'zarinpal'"))).toBe(true);
  });

  it('selects no personal learner field', async () => {
    const { handler, fakePool } = route({});
    await handler(request());
    const learnerList = fakePool.statements.find(
      (sql) => sql.includes('FROM users') && sql.includes('ORDER BY created_at DESC'),
    );
    expect(learnerList).toBeDefined();
    for (const column of ['phone', 'first_name', 'last_name', 'email']) {
      expect(learnerList).not.toContain(column);
    }
    const payload = JSON.stringify((await (await handler(request())).json()) as unknown);
    expect(payload).not.toContain('phone');
    expect(payload).not.toContain('first_name');
  });

  it('carries no audit metadata or actor into the activity preview', async () => {
    const { handler, fakePool } = route({});
    const { overview } = (await (await handler(request())).json()) as {
      overview: { recentActivity: Record<string, unknown>[] };
    };
    expect(Object.keys(overview.recentActivity[0]).sort()).toEqual(['action', 'at', 'entityType']);
    const auditQuery = fakePool.statements.find((sql) => sql.includes('FROM audit_logs'));
    expect(auditQuery).not.toContain('metadata');
    expect(auditQuery).not.toContain('actor_user_id');
  });

  it('clamps an absurd window and ignores a malformed one', async () => {
    const { handler } = route({});
    const wide = (await (
      await handler(request('https://admin.learnbox.app/api/dashboard/overview?windowDays=99'))
    ).json()) as { overview: { windowDays: number } };
    expect(wide.overview.windowDays).toBe(90);
    const broken = (await (
      await handler(
        request('https://admin.learnbox.app/api/dashboard/overview?windowDays=DROP%20TABLE'),
      )
    ).json()) as { overview: { windowDays: number } };
    expect(broken.overview.windowDays).toBe(30);
  });

  it('releases the pooled client even when a query fails', async () => {
    const release = vi.fn();
    const failing = {
      connect: async () => ({
        query: async () => {
          throw new Error('connection reset');
        },
        release,
      }),
    };
    const handler = createAdminDashboardOverviewRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: new PostgresAdminDashboardStore(failing as never),
      now: () => now,
      environment: {},
    });
    expect((await handler(request())).status).toBe(503);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('exports no mutating verb', async () => {
    const module = await import('../lib/server/admin-dashboard-routes.js');
    expect(Object.keys(module)).toEqual(['createAdminDashboardOverviewRoute']);
  });
});

describe('admin dashboard gate', () => {
  /** A fully configured passkey runtime: only the dashboard flag decides from here. */
  const passkeyRuntime = {
    LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
    LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
    LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
    LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
  };

  it('is off unless the flag is explicitly true', () => {
    expect(readAdminDashboardConfig({}).enabled).toBe(false);
    expect(readAdminDashboardConfig({ LEARNBOX_ADMIN_DASHBOARD_ENABLED: '1' }).enabled).toBe(false);
  });

  it('stays off on a fully configured passkey runtime while the flag is absent', () => {
    expect(readAdminDashboardConfig(passkeyRuntime).enabled).toBe(false);
    expect(
      readAdminDashboardConfig({ ...passkeyRuntime, LEARNBOX_ADMIN_DASHBOARD_ENABLED: 'false' })
        .enabled,
    ).toBe(false);
  });

  it('still requires the passkey auth runtime when the flag is on', () => {
    expect(readAdminDashboardConfig({ LEARNBOX_ADMIN_DASHBOARD_ENABLED: 'true' }).enabled).toBe(
      false,
    );
  });

  it('opens only when both the flag and the passkey runtime are in place', () => {
    expect(
      readAdminDashboardConfig({ ...passkeyRuntime, LEARNBOX_ADMIN_DASHBOARD_ENABLED: 'true' })
        .enabled,
    ).toBe(true);
  });

  it('does not inherit the content or support gate', () => {
    expect(
      readAdminDashboardConfig({
        ...passkeyRuntime,
        LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED: 'true',
        LEARNBOX_ADMIN_SUPPORT_ENABLED: 'true',
      }).enabled,
    ).toBe(false);
  });
});
