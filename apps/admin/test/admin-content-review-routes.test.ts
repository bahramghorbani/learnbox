import { describe, expect, it } from 'vitest';

import {
  createContentReviewQueueRoute,
  createContentReviewCheckRoute,
  createContentReviewDecisionRoute,
} from '../lib/server/admin-content-review-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import type { ContentReviewQueueEntry } from '../lib/server/postgres-content-review-store.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-09-09T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const cardVersionId = 'b89dabb1-406a-5b88-b535-4e90ba6af24c';
const idempotencyKey = 'dcd8e2a0-3d55-4b2e-9d4b-9b3b8e6f4c7a';
const decisionKey = 'b9188cc4-434c-43ea-a1d5-7ddba994367c';

function sessionStore(overrides: { userId?: string | null; recent?: boolean } = {}) {
  return {
    findActiveSession: async () => ({
      userId: overrides.userId ?? actorUserId,
      csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      recentAuthenticatedAt:
        overrides.recent === false ? new Date(now.getTime() - 6 * 60_000) : now,
    }),
    touchSession: async () => true,
  };
}

const queueItem: ContentReviewQueueEntry = {
  cardVersionId,
  contentId: 'start-a1-haus',
  lemma: 'Haus',
  status: 'needs_review',
  article: 'das',
  partOfSpeech: 'noun',
  persianMeanings: ['خانه'],
  essentialInflection: 'die Häuser',
  pronunciationIpa: 'haʊs',
  examples: [{ german: 'Das Haus ist klein.', persian: 'خانه کوچک است.' }],
  mediaCount: 0,
  sourceProvider: 'ai_suggestion',
  sourceReference: 'Goethe A1 scope reference.',
  checks: [],
};

function queueStore(
  overrides: { status?: 'forbidden' | 'ok'; items?: ContentReviewQueueEntry[] } = {},
) {
  return {
    listReviewQueue: async () =>
      overrides.status === 'forbidden'
        ? { status: 'forbidden' as const }
        : { status: 'ok' as const, items: overrides.items ?? [queueItem] },
  };
}

function jsonRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', config.origin);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Request(`https://admin.learnbox.app${path}`, { ...init, headers });
}

function authorizedPostRequest(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return jsonRequest(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      cookie: `__Host-learnbox_admin_session=${sessionToken}`,
      'x-learnbox-csrf-token': csrfToken,
      'idempotency-key': idempotencyKey,
      ...extraHeaders,
    },
  });
}

const baseDeps = {
  enabled: true,
  config,
  now: () => now,
};

describe('Admin content review queue route', () => {
  it('returns 404 before any session or review-data access when the runtime is disabled', async () => {
    let sessionTouched = false;
    let storeTouched = false;
    const handler = createContentReviewQueueRoute({
      ...baseDeps,
      enabled: false,
      sessionStore: {
        findActiveSession: async () => {
          sessionTouched = true;
          return undefined;
        },
        touchSession: async () => true,
      },
      store: {
        listReviewQueue: async () => {
          storeTouched = true;
          return { status: 'ok', items: [] };
        },
      },
    });

    const response = await handler(new Request('https://admin.learnbox.app/api/content/review'));
    expect(response.status).toBe(404);
    expect(sessionTouched).toBe(false);
    expect(storeTouched).toBe(false);
  });

  it('returns 401 no-store without a canonical Passkey session and reads no queue', async () => {
    let storeTouched = false;
    const handler = createContentReviewQueueRoute({
      ...baseDeps,
      sessionStore: {
        findActiveSession: async () => undefined,
        touchSession: async () => true,
      },
      store: {
        listReviewQueue: async () => {
          storeTouched = true;
          return { status: 'ok', items: [] };
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/content/review', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(storeTouched).toBe(false);
  });

  it('serves the role-authorized queue with no-store and strict output', async () => {
    let storeActor: string | undefined;
    const handler = createContentReviewQueueRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        listReviewQueue: async (actor: string) => {
          storeActor = actor;
          return { status: 'ok', items: [queueItem] };
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/content/review', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(storeActor).toBe(actorUserId);
    const body = (await response.json()) as { items: unknown[] };
    expect(body.items).toEqual([queueItem]);
  });

  it('keeps a role-less actor indistinguishable from a missing resource', async () => {
    const handler = createContentReviewQueueRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: queueStore({ status: 'forbidden' }),
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/content/review', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reports queue failure as a generic unavailable response', async () => {
    const handler = createContentReviewQueueRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        listReviewQueue: async () => {
          throw new Error('boom');
        },
      },
    });

    const response = await handler(
      new Request('https://admin.learnbox.app/api/content/review', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(503);
  });
});

describe('Admin content review check route', () => {
  const checkBody = {
    cardVersionId,
    dimension: 'german_linguistic',
    outcome: 'passed',
    notes: 'ساختار و منابع بررسی شدند.',
  };

  it('returns 404 before touching the store when the runtime is disabled', async () => {
    let storeTouched = false;
    const handler = createContentReviewCheckRoute({
      ...baseDeps,
      enabled: false,
      sessionStore: sessionStore(),
      store: {
        recordCheck: async () => {
          storeTouched = true;
          return { status: 'applied' };
        },
      },
    });

    const response = await handler(authorizedPostRequest('/api/content/review/check', checkBody));
    expect(response.status).toBe(404);
    expect(storeTouched).toBe(false);
  });

  it('enforces trusted origin, CSRF and recent authentication before any write', async () => {
    const calls: Array<'origin' | 'csrf' | 'recent'> = [];
    const handler = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        recordCheck: async () => {
          calls.push('origin');
          return { status: 'applied' };
        },
      },
    });

    const untrusted = await handler(
      jsonRequest('/api/content/review/check', {
        method: 'POST',
        body: JSON.stringify(checkBody),
        headers: {
          origin: 'https://evil.example',
          cookie: `__Host-learnbox_admin_session=${sessionToken}`,
          'x-learnbox-csrf-token': csrfToken,
          'idempotency-key': idempotencyKey,
        },
      }),
    );
    expect(untrusted.status).toBe(400);

    const missingCsrf = await handler(
      authorizedPostRequest('/api/content/review/check', checkBody, {
        'x-learnbox-csrf-token': 'wrong-token-value',
      }),
    );
    expect(missingCsrf.status).toBe(400);

    const staleHandler = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore({ recent: false }),
      store: {
        recordCheck: async () => {
          calls.push('recent');
          return { status: 'applied' };
        },
      },
    });
    const staleResponse = await staleHandler(
      authorizedPostRequest('/api/content/review/check', checkBody),
    );
    expect(staleResponse.status).toBe(428);
    expect(calls).toEqual([]);
  });

  it('submits the parsed verdict with the session-derived actor and idempotency key', async () => {
    let recorded: { actor: string; input: unknown } | undefined;
    const handler = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        recordCheck: async (actor: string, input: unknown) => {
          recorded = { actor, input };
          return { status: 'applied' };
        },
      },
    });

    const response = await handler(authorizedPostRequest('/api/content/review/check', checkBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'applied' });
    expect(recorded).toEqual({
      actor: actorUserId,
      input: {
        cardVersionId,
        dimension: 'german_linguistic',
        outcome: 'passed',
        notes: 'ساختار و منابع بررسی شدند.',
        idempotencyKey,
      },
    });
  });

  it('maps conflict, not-reviewable, forbidden and invalid input truthfully', async () => {
    const conflict = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: { recordCheck: async () => ({ status: 'conflict' as const }) },
    });
    expect(
      (await conflict(authorizedPostRequest('/api/content/review/check', checkBody))).status,
    ).toBe(409);

    const notReviewable = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        recordCheck: async () => ({ status: 'not_reviewable' as const, currentStatus: 'approved' }),
      },
    });
    const notReviewableResponse = await notReviewable(
      authorizedPostRequest('/api/content/review/check', checkBody),
    );
    expect(notReviewableResponse.status).toBe(409);
    expect(await notReviewableResponse.json()).toEqual({
      code: 'not_reviewable',
      currentStatus: 'approved',
    });

    const forbidden = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: { recordCheck: async () => ({ status: 'forbidden' as const }) },
    });
    expect(
      (await forbidden(authorizedPostRequest('/api/content/review/check', checkBody))).status,
    ).toBe(404);

    const handler = createContentReviewCheckRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: { recordCheck: async () => ({ status: 'applied' as const }) },
    });
    const invalidBody = await handler(
      authorizedPostRequest('/api/content/review/check', {
        ...checkBody,
        dimension: 'unknown_dimension',
      }),
    );
    expect(invalidBody.status).toBe(400);
    const invalidKey = await handler(
      authorizedPostRequest('/api/content/review/check', checkBody, { 'idempotency-key': 'nope' }),
    );
    expect(invalidKey.status).toBe(400);
    const missingIdempotency = await handler(
      authorizedPostRequest('/api/content/review/check', checkBody, { 'idempotency-key': '' }),
    );
    expect(missingIdempotency.status).toBe(400);
  });
});

describe('Admin content review decision route', () => {
  const decisionBody = {
    cardVersionId,
    action: 'approve',
    reason: 'همهٔ شش بُعد بررسی شدند.',
  };

  function decisionRequest(action: string, key = decisionKey) {
    return jsonRequest('/api/content/review/decision', {
      method: 'POST',
      body: JSON.stringify({ ...decisionBody, action }),
      headers: {
        cookie: `__Host-learnbox_admin_session=${sessionToken}`,
        'x-learnbox-csrf-token': csrfToken,
        'idempotency-key': key,
      },
    });
  }

  it('returns 404 when disabled and never publishes through any response path', async () => {
    const handler = createContentReviewDecisionRoute({
      ...baseDeps,
      enabled: false,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async () => ({
          status: 'applied' as const,
          nextStatus: 'approved' as const,
        }),
      },
    });
    expect((await handler(decisionRequest('approve'))).status).toBe(404);
  });

  it('applies an approved decision only for a session actor with recent auth and CSRF', async () => {
    let submitted: { actor: string; input: unknown } | undefined;
    const handler = createContentReviewDecisionRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async (submission: { actorUserId: string }) => {
          const { actorUserId, ...input } = submission;
          submitted = { actor: actorUserId, input };
          return { status: 'applied' as const, nextStatus: 'approved' as const };
        },
      },
    });

    const response = await handler(decisionRequest('approve'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'applied', nextStatus: 'approved' });
    expect(submitted).toEqual({
      actor: actorUserId,
      input: {
        cardVersionId,
        action: 'approve',
        reason: 'همهٔ شش بُعد بررسی شدند.',
        decisionKey,
      },
    });
  });

  it('surfaces review_incomplete with the pending dimensions and never claims approval', async () => {
    const handler = createContentReviewDecisionRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async () => ({
          status: 'review_incomplete' as const,
          pendingDimensions: ['audio', 'provenance'],
        }),
      },
    });

    const response = await handler(decisionRequest('approve'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: 'review_incomplete',
      pendingDimensions: ['audio', 'provenance'],
    });
  });

  it('keeps reject and return semantics truthful through the route boundary', async () => {
    const rejectHandler = createContentReviewDecisionRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async () => ({
          status: 'applied' as const,
          nextStatus: 'rejected' as const,
        }),
      },
    });
    const rejected = await rejectHandler(
      decisionRequest('reject', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toEqual({ status: 'applied', nextStatus: 'rejected' });

    const returnedHandler = createContentReviewDecisionRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async () => ({
          status: 'applied' as const,
          nextStatus: 'needs_review' as const,
        }),
      },
    });
    const returned = await returnedHandler(
      decisionRequest('return_for_revision', 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'),
    );
    expect(returned.status).toBe(200);
    expect(await returned.json()).toEqual({ status: 'applied', nextStatus: 'needs_review' });
  });

  it('rejects unknown actions and malformed bodies before the store', async () => {
    const handler = createContentReviewDecisionRoute({
      ...baseDeps,
      sessionStore: sessionStore(),
      store: {
        submitDecision: async () => ({
          status: 'applied' as const,
          nextStatus: 'approved' as const,
        }),
      },
    });

    const unknownAction = await handler(decisionRequest('publish'));
    expect(unknownAction.status).toBe(400);
    const notFoundTarget = await handler(decisionRequest('approve', 'not-a-uuid'));
    expect(notFoundTarget.status).toBe(400);
  });
});
