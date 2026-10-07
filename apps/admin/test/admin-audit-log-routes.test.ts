import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createAdminAuditLogRoute } from '../lib/server/admin-users-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import { summariseAuditMetadata } from '../lib/server/audit-metadata';

/**
 * Phase 3 / Milestone 3.3 — the Audit Log boundary.
 *
 * Two properties are tested here, and they are the two that make an audit viewer trustworthy.
 *
 * It must not leak. The trail names every administrative action taken against real learners, so an
 * unauthenticated, unauthorised or flag-off caller gets nothing — and gets it as an indistinguishable
 * 404, so probing cannot even confirm that a trail exists.
 *
 * It must not lie. A malformed filter is refused instead of being silently dropped, because an audit
 * search that quietly ignored a date bound would show a reviewer a page they would reasonably read
 * as the whole truth. Metadata written by six independent producers is redacted and bounded before
 * it is ever returned, so a future writer cannot put a credential on an operator's screen by
 * accident.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-08T09:15:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const targetUserId = '44444444-4444-4444-8444-444444444444';

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

const page = {
  status: 'ok' as const,
  rows: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      createdAt: '2026-10-08T08:00:00+00:00',
      actorUserId,
      actorLabel: 'نگین رضایی',
      action: 'user_status.disabled',
      entityType: 'user_account_status',
      entityId: targetUserId,
      reason: 'گزارش تخلف شمارهٔ ۴۲',
      details: [{ key: 'previous_status', value: 'active', redacted: false }],
    },
  ],
  total: 1,
  limit: 25,
  offset: 0,
  actions: ['user_status.disabled'],
  entityTypes: ['user_account_status'],
  actors: [{ id: actorUserId, label: 'نگین رضایی' }],
};

function dependencies(overrides: { userId?: string | null; forbidden?: boolean } = {}) {
  return {
    enabled: true,
    config,
    sessionStore: sessionStore(overrides),
    store: {
      listAuditLog: vi.fn(async () =>
        overrides.forbidden ? { status: 'forbidden' as const } : page,
      ),
    },
    now: () => now,
  };
}

function get(url: string, cookie = `__Host-learnbox_admin_session=${sessionToken}`) {
  return new Request(url, { method: 'GET', headers: cookie ? { cookie } : {} });
}

const base = 'https://admin.learnbox.app/api/support/audit';

describe('Audit Log route authorization (M3.3)', () => {
  it('serves an authorized operator the canonical trail', async () => {
    const deps = dependencies();
    const response = await createAdminAuditLogRoute(deps)(get(base));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].action).toBe('user_status.disabled');
    expect(body.total).toBe(1);
    expect(deps.store.listAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorUserId }));
  });

  it('is 404 while the support flag is off', async () => {
    const response = await createAdminAuditLogRoute({ ...dependencies(), enabled: false })(
      get(base),
    );
    expect(response.status).toBe(404);
  });

  it('is 401 without a valid Admin session', async () => {
    const response = await createAdminAuditLogRoute(dependencies({ userId: null }))(get(base, ''));
    expect(response.status).toBe(401);
  });

  it('hides the trail from a signed-in operator without the role, as a 404', async () => {
    const response = await createAdminAuditLogRoute(dependencies({ forbidden: true }))(get(base));
    // Not 403: an unauthorized caller must not learn that an audit trail is there to be read.
    expect(response.status).toBe(404);
  });

  it('never caches a response', async () => {
    const response = await createAdminAuditLogRoute(dependencies())(get(base));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('reports a storage failure as 503 and leaks no detail', async () => {
    const deps = dependencies();
    deps.store.listAuditLog = vi.fn(async () => {
      throw new Error('connection to 10.0.0.4:5432 refused');
    });
    const response = await createAdminAuditLogRoute(deps)(get(base));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('5432');
  });
});

describe('Audit Log filtering and paging (M3.3)', () => {
  it('passes every supported filter through to the store', async () => {
    const deps = dependencies();
    await createAdminAuditLogRoute(deps)(
      get(
        `${base}?action=pack.published&actorUserId=${actorUserId}&entityType=pack&entityId=${targetUserId}` +
          `&from=2026-10-01T00:00:00.000Z&to=2026-10-09T00:00:00.000Z&limit=10&offset=20`,
      ),
    );
    expect(deps.store.listAuditLog).toHaveBeenCalledWith({
      actorUserId,
      filters: {
        action: 'pack.published',
        actorUserId,
        entityType: 'pack',
        entityId: targetUserId,
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-09T00:00:00.000Z',
      },
      limit: 10,
      offset: 20,
    });
  });

  it('defaults to the first page when no window is asked for', async () => {
    const deps = dependencies();
    await createAdminAuditLogRoute(deps)(get(base));
    expect(deps.store.listAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 }),
    );
  });

  for (const [name, query] of [
    ['an unparseable date', 'from=yesterday'],
    ['a non-numeric limit', 'limit=all'],
    ['a negative offset', 'offset=-5'],
    ['an action that is not an identifier', "action=pack';DROP"],
    ['an entity id that is not a uuid', 'entityId=42'],
    ['an actor that is not a uuid', 'actorUserId=negin'],
  ] as const) {
    it(`refuses ${name} instead of ignoring it`, async () => {
      const deps = dependencies();
      const response = await createAdminAuditLogRoute(deps)(
        get(`${base}?${encodeURI(query).replace('%5C', '')}`),
      );
      expect(response.status).toBe(400);
      // The decisive part: no query ran, so no page of partially-filtered history was returned.
      expect(deps.store.listAuditLog).not.toHaveBeenCalled();
    });
  }
});

describe('Audit Log is read-only by construction (M3.3)', () => {
  const routeSource = readFileSync(join(process.cwd(), 'app/api/support/audit/route.ts'), 'utf8');
  const storeSource = readFileSync(
    join(process.cwd(), 'lib/server/postgres-admin-users-store.ts'),
    'utf8',
  );

  it('exports GET and no mutation verb', () => {
    expect(routeSource).toMatch(/export async function GET/);
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(routeSource).not.toMatch(new RegExp(`export async function ${verb}`));
    }
  });

  it('never writes the audit table from the viewer path', () => {
    const viewer = storeSource.slice(storeSource.indexOf('async listAuditLog('));
    expect(viewer).toMatch(/FROM audit_logs/);
    expect(viewer).not.toMatch(/UPDATE audit_logs|DELETE FROM audit_logs|INSERT INTO audit_logs/i);
  });
});

describe('Audit metadata is treated as untrusted display data (M3.3)', () => {
  it('surfaces the recorded reason as a first-class field, not a detail row', () => {
    const view = summariseAuditMetadata({ reason: 'پشتیبانی تلفنی', pack_id: 'start-a1' });
    expect(view.reason).toBe('پشتیبانی تلفنی');
    expect(view.details.map((detail) => detail.key)).toEqual(['pack_id']);
  });

  it('shows real producer fields from every Phase that writes the trail', () => {
    const view = summariseAuditMetadata({
      previous_acquisition: 'none',
      new_acquisition: 'support',
      pack_is_free: false,
      previous_version_id: null,
    });
    expect(view.details).toEqual([
      { key: 'previous_acquisition', value: 'none', redacted: false },
      { key: 'new_acquisition', value: 'support', redacted: false },
      { key: 'pack_is_free', value: 'false', redacted: false },
      { key: 'previous_version_id', value: '—', redacted: false },
    ]);
  });

  it('redacts credential-shaped and internal correlation keys but still lists them', () => {
    const view = summariseAuditMetadata({
      idempotency_key: '33333333-3333-4333-8333-333333333333',
      api_token: 'should-never-render',
      sessionId: 'should-never-render',
      password: 'should-never-render',
    });
    expect(view.details.every((detail) => detail.redacted)).toBe(true);
    // Listed, not dropped: a reviewer must be able to tell redaction from absence.
    expect(view.details.map((detail) => detail.key)).toContain('idempotency_key');
    expect(JSON.stringify(view)).not.toContain('should-never-render');
  });

  it('refuses to read a metadata shape it does not understand', () => {
    for (const hostile of ['a string', 42, null, undefined, [{ reason: 'x' }]]) {
      expect(summariseAuditMetadata(hostile)).toEqual({ reason: null, details: [] });
    }
  });

  it('bounds keys, values and row counts so one record cannot flood the viewer', () => {
    const metadata: Record<string, unknown> = { note: 'x'.repeat(5_000) };
    for (let index = 0; index < 40; index += 1) metadata[`f${index}`] = index;
    const view = summariseAuditMetadata(metadata);
    expect(view.details.length).toBeLessThanOrEqual(12);
    for (const detail of view.details) {
      expect(detail.key.length).toBeLessThanOrEqual(61);
      expect(detail.value.length).toBeLessThanOrEqual(201);
    }
  });

  it('passes markup through as text rather than as structure', () => {
    const view = summariseAuditMetadata({ note: '<script>alert(1)</script>' });
    // No sanitising, no stripping: the value stays exactly what was recorded, and React escapes it
    // at render time. Rewriting stored evidence to make it safe to display would be the real bug.
    expect(view.details[0]).toEqual({
      key: 'note',
      value: '<script>alert(1)</script>',
      redacted: false,
    });
  });
});
