import { describe, expect, it, vi } from 'vitest';

import {
  createPackArchiveRoute,
  createPackLifecycleRoute,
  createPackPublishRoute,
  createPackSubmitForReviewRoute,
} from '../lib/server/admin-content-lifecycle-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 1 / Milestone 1.6 — lifecycle route security boundary.
 *
 * The guarantee under test: publication is intentional and server-authorised. An unauthenticated,
 * cross-origin, CSRF-less, stale-reauth or key-less caller must be refused BEFORE the store is
 * reached, so no request can make protected learning content learner-visible by accident, and the
 * publish endpoint is never an anonymous content switch.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-06T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const packId = 'learnbox-start';
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

const readiness = {
  ready: true,
  packStatus: 'approved' as const,
  publishableCardCount: 1,
  blockers: [],
  cardBlockers: [],
};

function store() {
  return {
    getPackLifecycle: vi.fn(async () => ({
      status: 'ok' as const,
      view: {
        packId,
        status: 'approved' as const,
        publishedAt: null,
        targetItemCount: 0,
        cards: [],
        submittableCardCount: 0,
        readiness,
        canSubmitForReview: false,
        canPublish: true,
        canArchive: true,
      },
    })),
    submitPackForReview: vi.fn(async () => ({
      status: 'applied' as const,
      submittedCardCount: 2,
      packStatus: 'needs_review' as const,
    })),
    publishPack: vi.fn(async () => ({ status: 'applied' as const, publishedCardCount: 1 })),
    archivePack: vi.fn(async () => ({ status: 'applied' as const, deactivatedCardCount: 1 })),
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

function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  omit: string[] = [],
) {
  const base: Record<string, string> = {
    Origin: config.origin,
    'Content-Type': 'application/json',
    'x-learnbox-csrf-token': csrfToken,
    Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
    'Idempotency-Key': idempotencyKey,
    ...headers,
  };
  for (const key of omit) delete base[key];
  return new Request(`https://admin.learnbox.app/api/content/lifecycle/${path}`, {
    method: 'POST',
    headers: base,
    body: JSON.stringify(body),
  });
}

const mutations = [
  ['publish', createPackPublishRoute, 'publishPack'],
  ['submit-review', createPackSubmitForReviewRoute, 'submitPackForReview'],
  ['archive', createPackArchiveRoute, 'archivePack'],
] as const;

describe.each(mutations)(
  '%s cannot be reached without full authorisation',
  (path, create, method) => {
    it('refuses a request with no session and never calls the store', async () => {
      const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
      const response = await create(deps as never)(post(path, { packId }));
      expect(response.status).toBe(401);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('refuses a cross-origin request', async () => {
      const deps = dependencies();
      const response = await create(deps as never)(
        post(path, { packId }, { Origin: 'https://evil.example' }),
      );
      expect(response.status).toBe(400);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('refuses a request with no CSRF token', async () => {
      const deps = dependencies();
      const response = await create(deps as never)(
        post(path, { packId }, {}, ['x-learnbox-csrf-token']),
      );
      expect(response.status).toBe(400);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('demands a fresh re-authentication before a lifecycle change', async () => {
      const deps = { ...dependencies(), sessionStore: sessionStore({ recent: false }) };
      const response = await create(deps as never)(post(path, { packId }));
      expect(response.status).toBe(428);
      expect(await response.json()).toEqual({ code: 'reauthentication_required' });
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('demands an idempotency key', async () => {
      const deps = dependencies();
      const response = await create(deps as never)(post(path, { packId }, {}, ['Idempotency-Key']));
      expect(response.status).toBe(400);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('refuses a malformed pack id and a malformed expected status', async () => {
      const deps = dependencies();
      const route = create(deps as never);
      expect((await route(post(path, { packId: 'Not A Slug!' }))).status).toBe(400);
      expect((await route(post(path, { packId, expectedStatus: 'live' }))).status).toBe(400);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('404s when the manage gate is off, so the route does not exist by default', async () => {
      const deps = { ...dependencies(), enabled: false };
      const response = await create(deps as never)(post(path, { packId }));
      expect(response.status).toBe(404);
      expect(deps.store[method]).not.toHaveBeenCalled();
    });

    it('never caches a lifecycle response', async () => {
      const response = await create(dependencies() as never)(post(path, { packId }));
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
  },
);

describe('publish route outcomes', () => {
  it('passes the actor, key and expected status to the store and reports the release', async () => {
    const deps = dependencies();
    const response = await createPackPublishRoute(deps as never)(
      post('publish', { packId, expectedStatus: 'approved' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'applied', publishedCardCount: 1 });
    expect(deps.store.publishPack).toHaveBeenCalledWith({
      packId,
      expectedStatus: 'approved',
      actorUserId,
      idempotencyKey,
    });
  });

  it('reports concrete blockers with 409 when content is not ready', async () => {
    const notReady = {
      ready: false,
      packStatus: 'approved' as const,
      publishableCardCount: 0,
      blockers: [{ code: 'cards_not_ready' as const }],
      cardBlockers: [
        {
          cardVersionId: '44444444-4444-4444-8444-444444444444',
          contentId: 'start-a1-apfel',
          lemma: 'Apfel',
          code: 'not_approved' as const,
          status: 'needs_review' as const,
          issues: [],
        },
      ],
    };
    const deps = dependencies();
    deps.store.publishPack = vi.fn(async () => ({
      status: 'not_ready' as const,
      readiness: notReady,
    })) as never;
    const response = await createPackPublishRoute(deps as never)(post('publish', { packId }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'not_ready', readiness: notReady });
  });

  it('reports a stale lifecycle view with 409 rather than overwriting newer content', async () => {
    const deps = dependencies();
    deps.store.publishPack = vi.fn(async () => ({
      status: 'stale' as const,
      currentStatus: 'needs_review' as const,
    })) as never;
    const response = await createPackPublishRoute(deps as never)(
      post('publish', { packId, expectedStatus: 'approved' }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'stale', currentStatus: 'needs_review' });
  });

  it('hides an unauthorised actor behind 404 and leaks no pack existence', async () => {
    const deps = dependencies();
    deps.store.publishPack = vi.fn(async () => ({ status: 'forbidden' as const })) as never;
    const response = await createPackPublishRoute(deps as never)(post('publish', { packId }));
    expect(response.status).toBe(404);
  });

  it('answers 503 without detail when the database is unavailable', async () => {
    const deps = dependencies();
    deps.store.publishPack = vi.fn(async () => {
      throw new Error('connection terminated: host=db-1 user=learnbox_admin');
    }) as never;
    const response = await createPackPublishRoute(deps as never)(post('publish', { packId }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('learnbox_admin');
  });
});

describe('submit-review and archive outcomes', () => {
  it('reports the submitted card count and the new pack state', async () => {
    const deps = dependencies();
    const response = await createPackSubmitForReviewRoute(deps as never)(
      post('submit-review', { packId }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'applied',
      submittedCardCount: 2,
      packStatus: 'needs_review',
    });
  });

  it('reports an empty submission with 409', async () => {
    const deps = dependencies();
    deps.store.submitPackForReview = vi.fn(async () => ({
      status: 'nothing_to_submit' as const,
      packStatus: 'draft' as const,
    })) as never;
    const response = await createPackSubmitForReviewRoute(deps as never)(
      post('submit-review', { packId }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'nothing_to_submit', packStatus: 'draft' });
  });

  it('reports the deactivated card count on archive', async () => {
    const deps = dependencies();
    const response = await createPackArchiveRoute(deps as never)(post('archive', { packId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'applied', deactivatedCardCount: 1 });
  });
});

describe('lifecycle read route', () => {
  function get(url: string, headers: Record<string, string> = {}) {
    return new Request(url, {
      headers: {
        Origin: config.origin,
        Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
        ...headers,
      },
    });
  }

  const url = `https://admin.learnbox.app/api/content/lifecycle?packId=${packId}`;

  it('returns the lifecycle view with its readiness to an authenticated operator', async () => {
    const deps = dependencies();
    const response = await createPackLifecycleRoute(deps as never)(get(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lifecycle: { status: 'approved' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses an anonymous read of lifecycle state', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const response = await createPackLifecycleRoute(deps as never)(get(url));
    expect(response.status).toBe(401);
    expect(deps.store.getPackLifecycle).not.toHaveBeenCalled();
  });

  it('404s an unauthorised or unknown pack identically', async () => {
    for (const outcome of ['forbidden', 'not_found'] as const) {
      const deps = dependencies();
      deps.store.getPackLifecycle = vi.fn(async () => ({ status: outcome })) as never;
      const response = await createPackLifecycleRoute(deps as never)(get(url));
      expect(response.status).toBe(404);
    }
  });

  it('refuses a malformed pack id', async () => {
    const deps = dependencies();
    const response = await createPackLifecycleRoute(deps as never)(
      get('https://admin.learnbox.app/api/content/lifecycle?packId=Not%20A%20Slug!'),
    );
    expect(response.status).toBe(400);
    expect(deps.store.getPackLifecycle).not.toHaveBeenCalled();
  });
});
