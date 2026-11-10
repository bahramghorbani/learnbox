import { describe, expect, it } from 'vitest';

import { createAdminVisitsOverviewRoute } from '../lib/server/admin-visits-routes';
import { AdminVisitsStore } from '../lib/server/admin-visits-store';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import type { StatsFaClient } from '../lib/server/statsfa-client';

/**
 * Admin Visits boundary («گزارش بازدیدها»): same shape as the Dashboard overview route (Stage 2).
 * 1. Gated like every other Admin read surface: no session -> 401, session without an operational
 *    role -> 404.
 * 2. StatsFA failure surfaces as 503, never as a zero that would read as "no traffic".
 * 3. Two sites are returned, each with its own totals, series and top pages.
 */
const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-11-10T09:00:00.000Z');
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

function request(url = 'https://admin.learnbox.app/api/visits/overview') {
  return new Request(url, {
    headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
  });
}

function fakePool(hasRole: boolean) {
  return {
    query: async () => ({ rows: hasRole ? [{ ok: 1 }] : [] }),
  } as unknown as import('pg').Pool;
}

function fakeClient(fail = false): StatsFaClient {
  return {
    dailySeries: async (siteId: string, name: string) => {
      if (fail) throw new Error('statsfa down');
      return [
        { date: '2026-11-09', count: name === 'pageviews' ? (siteId === '7132' ? 40 : 12) : 25 },
      ];
    },
    topPages: async (siteId: string) =>
      fail
        ? (() => {
            throw new Error('down');
          })()
        : [{ path: '/', count: siteId === '7132' ? 10 : 3 }],
  } as unknown as StatsFaClient;
}

function route(hasRole: boolean, fail = false) {
  const store = new AdminVisitsStore(fakePool(hasRole), fakeClient(fail), [
    { id: '7132', domain: 'learnboxapp.com', label: 'لندینگ' },
    { id: '7133', domain: 'app.learnboxapp.com', label: 'اپ' },
  ]);
  return createAdminVisitsOverviewRoute({
    enabled: true,
    config,
    sessionStore: sessionStore(),
    store,
    now: () => now,
  });
}

describe('Admin Visits overview route', () => {
  it('requires a session', async () => {
    const handler = createAdminVisitsOverviewRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: new AdminVisitsStore(fakePool(true), fakeClient(), []),
      now: () => now,
    });
    const response = await handler(request());
    expect(response.status).toBe(401);
  });

  it('is 404 for a session without an operational role, never 403', async () => {
    const handler = route(false);
    const response = await handler(request());
    expect(response.status).toBe(404);
  });

  it('is 404 when the feature flag is off', async () => {
    const handler = createAdminVisitsOverviewRoute({
      enabled: false,
      config,
      sessionStore: sessionStore(),
      store: new AdminVisitsStore(fakePool(true), fakeClient(), []),
      now: () => now,
    });
    expect((await handler(request())).status).toBe(404);
  });

  it('returns both sites with their own totals and top pages', async () => {
    const handler = route(true);
    const response = await handler(request());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      overview: { windowDays: number; sites: { domain: string; pageviewsTotal: number }[] };
    };
    expect(body.overview.sites).toHaveLength(2);
    const landing = body.overview.sites.find((s) => s.domain === 'learnboxapp.com');
    expect(landing?.pageviewsTotal).toBe(40);
  });

  it('is 503 when StatsFA fails, never a silent zero', async () => {
    const handler = route(true, true);
    const response = await handler(request());
    expect(response.status).toBe(503);
  });
});
