import { describe, expect, it } from 'vitest';
import {
  createDictionaryEditorialCreateRoute,
  createDictionaryEditorialListRoute,
  createDictionaryEditorialUpdateRoute,
} from '../lib/server/admin-dictionary-editorial-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-11-04T12:00:00Z');
const actor = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const id = 'dcd8e2a0-3d55-4b2e-9d4b-9b3b8e6f4c7a';
const token = 't'.repeat(43);
const csrf = 'c'.repeat(43);
const item = {
  id,
  dictionaryKey: 'haus',
  aiPayload: { lemma: 'haus', gloss: 'خانه' },
  manualPayload: null,
  status: 'queued' as const,
  revision: 1,
  source: 'test',
  model: null,
  costMetadata: {},
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
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
function request(body: unknown, extra: HeadersInit = {}) {
  return new Request('https://admin.learnbox.app/api/dictionary/editorial', {
    method: 'POST',
    headers: {
      origin: config.origin,
      'content-type': 'application/json',
      cookie: `__Host-learnbox_admin_session=${token}`,
      'x-learnbox-csrf-token': csrf,
      'idempotency-key': id,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
const deps = { enabled: true, config, now: () => now, sessionStore: sessionStore() };

describe('dictionary editorial routes', () => {
  it('is unreachable when the default-off runtime gate is disabled', async () => {
    let touched = false;
    const handler = createDictionaryEditorialCreateRoute({
      ...deps,
      enabled: false,
      store: {
        list: async () => ({ status: 'ok' as const, items: [], total: 0 }),
        create: async () => {
          touched = true;
          return { status: 'applied' as const, item };
        },
        update: async () => ({ status: 'applied' as const, item }),
      },
    });
    expect((await handler(request({}))).status).toBe(404);
    expect(touched).toBe(false);
  });
  it('requires origin, CSRF, a UUID idempotency key, and immutable AI JSON for creation', async () => {
    const handler = createDictionaryEditorialCreateRoute({
      ...deps,
      store: {
        list: async () => ({ status: 'ok' as const, items: [], total: 0 }),
        create: async () => ({ status: 'applied' as const, item }),
        update: async () => ({ status: 'applied' as const, item }),
      },
    });
    expect(
      (
        await handler(
          request(
            { dictionaryKey: 'haus', aiPayload: {}, source: 'ai' },
            { origin: 'https://evil.example' },
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (await handler(request({ dictionaryKey: 'haus', aiPayload: [], source: 'ai' }))).status,
    ).toBe(400);
  });
  it('returns optimistic-revision conflicts from the atomic store operation', async () => {
    const handler = createDictionaryEditorialUpdateRoute({
      ...deps,
      store: {
        list: async () => ({ status: 'ok' as const, items: [], total: 0 }),
        create: async () => ({ status: 'applied' as const, item }),
        update: async () => ({ status: 'conflict' as const }),
      },
    });
    const response = await handler(request({ revision: 1, status: 'approved' }), id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'revision_conflict' });
  });
});

describe('dictionary editorial list route', () => {
  it('always asks the store for one bounded page and rejects unknown filters', async () => {
    const seen: unknown[] = [];
    const handler = createDictionaryEditorialListRoute({
      ...deps,
      store: {
        list: async (_actor, query) => {
          seen.push(query);
          return { status: 'ok' as const, items: [], total: 0 };
        },
        create: async () => ({ status: 'applied' as const, item }),
        update: async () => ({ status: 'applied' as const, item }),
      },
    });
    const get = (query: string) =>
      handler(
        new Request(`https://admin.learnbox.app/api/dictionary/editorial${query}`, {
          headers: { cookie: `__Host-learnbox_admin_session=${token}` },
        }),
      );
    expect((await get('')).status).toBe(200);
    expect((await get('?q=%20Haus%20&filter=review')).status).toBe(200);
    expect(seen).toEqual([
      { q: '', filter: 'all', limit: 50 },
      { q: 'Haus', filter: 'review', limit: 50 },
    ]);
    expect((await get('?filter=everything')).status).toBe(400);
    expect((await get(`?q=${'x'.repeat(101)}`)).status).toBe(400);
    expect(seen).toHaveLength(2);
  });
});
