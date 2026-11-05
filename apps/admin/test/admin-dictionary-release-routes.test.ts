import { describe, expect, it, vi } from 'vitest';
import {
  createDictionaryReleaseActionRoute,
  createDictionaryReleaseStatusRoute,
} from '../lib/server/admin-dictionary-release-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-11-05T12:00:00Z');
const actor = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const token = 't'.repeat(43);
const csrf = 'c'.repeat(43);
const record = {
  file: 'dict-20261105T120000Z.sqlite',
  sha256: 'a'.repeat(64),
  builtAt: now.toISOString(),
  at: now.toISOString(),
  entries: 22006,
  added: 56,
  changed: 0,
  deleted: 0,
  actor,
  kind: 'publish' as const,
};
const report = { ...record, baseEntries: 21950, skipped: [], checks: [], ok: true, bytes: 1 };
function sessionStore(recent = true) {
  return {
    findActiveSession: async () => ({
      userId: actor,
      csrfHash: hashAdminSecret(csrf, config.tokenHashKey),
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 60000),
      revokedAt: null,
      recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 360000),
    }),
    touchSession: async () => true,
  };
}
const post = (body: unknown, extra: HeadersInit = {}) =>
  new Request('https://admin.learnbox.app/api/dictionary/release', {
    method: 'POST',
    headers: {
      origin: config.origin,
      'content-type': 'application/json',
      cookie: `__Host-learnbox_admin_session=${token}`,
      'x-learnbox-csrf-token': csrf,
      ...extra,
    },
    body: JSON.stringify(body),
  });
const get = () =>
  new Request('https://admin.learnbox.app/api/dictionary/release', {
    headers: { cookie: `__Host-learnbox_admin_session=${token}` },
  });
function deps(over: Record<string, unknown> = {}) {
  const store = {
    releaseRows: vi.fn(async () => ({ status: 'ok' as const, rows: [] })),
    changedSince: vi.fn(async () => ({ status: 'ok' as const, changed: 3 })),
    recordRelease: vi.fn(async () => undefined),
  };
  const publisher = {
    state: vi.fn(() => ({ current: record, history: [record] })),
    publish: vi.fn(() => ({ status: 'published' as const, report })),
    rollback: vi.fn(() => ({
      status: 'rolled-back' as const,
      record: { ...record, kind: 'rollback' as const },
    })),
  };
  return {
    store,
    publisher,
    deps: {
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore(),
      store,
      publisher,
      ...over,
    },
  };
}

describe('dictionary release routes', () => {
  it('reports the live release and unpublished changes since it went live', async () => {
    const d = deps();
    const response = await createDictionaryReleaseStatusRoute(d.deps)(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ current: { file: record.file }, pending: 3 });
    expect(d.store.changedSince).toHaveBeenCalledWith(actor, record.at);
  });

  it('is a 404 when publishing is not configured', async () => {
    const d = deps({ publisher: undefined });
    expect((await createDictionaryReleaseStatusRoute(d.deps)(get())).status).toBe(404);
    expect(
      (await createDictionaryReleaseActionRoute(d.deps)(post({ action: 'publish' }))).status,
    ).toBe(404);
  });

  it('publishes and audits; refuses without CSRF or a recent sign-in', async () => {
    const d = deps();
    const route = createDictionaryReleaseActionRoute(d.deps);
    const ok = await route(post({ action: 'publish' }));
    expect(ok.status).toBe(200);
    expect(d.store.recordRelease).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'publish', file: record.file }),
    );
    expect(
      (await route(post({ action: 'publish' }, { 'x-learnbox-csrf-token': 'x'.repeat(43) })))
        .status,
    ).toBe(403);
    const stale = createDictionaryReleaseActionRoute({
      ...d.deps,
      sessionStore: sessionStore(false),
    });
    expect((await stale(post({ action: 'publish' }))).status).toBe(428);
    expect((await route(post({ action: 'drop' }))).status).toBe(400);
    expect(d.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('returns failed checks without auditing, and maps busy / nothing to roll back', async () => {
    const d = deps();
    d.publisher.publish.mockReturnValueOnce({
      status: 'failed',
      report: { ...report, ok: false },
    } as never);
    const route = createDictionaryReleaseActionRoute(d.deps);
    expect((await route(post({ action: 'publish' }))).status).toBe(422);
    expect(d.store.recordRelease).not.toHaveBeenCalled();
    d.publisher.publish.mockReturnValueOnce({ status: 'busy' } as never);
    expect((await route(post({ action: 'publish' }))).status).toBe(409);
    d.publisher.rollback.mockReturnValueOnce({ status: 'none' } as never);
    expect((await route(post({ action: 'rollback' }))).status).toBe(409);
    expect((await route(post({ action: 'rollback' }))).status).toBe(200);
    expect(d.store.recordRelease).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'rollback' }),
    );
  });
});
