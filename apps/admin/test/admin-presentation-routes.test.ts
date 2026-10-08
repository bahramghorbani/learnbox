import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createPresentationSlideImageRoute,
  createPresentationSlideReorderRoute,
  createPresentationSlideUpsertRoute,
  createPresentationSlidesRoute,
} from '../lib/server/admin-presentation-routes.js';
import type { UpsertSlideResult } from '../lib/server/postgres-presentation-slides-store.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 4 / Milestone 4.2 — the guard chain in front of the Slider Manager.
 *
 * Every mutation must pass the same gate as a splash replacement: the default-off flag, a trusted
 * Origin and Content-Type, an Admin session, the per-session CSRF token, authentication within the
 * last five minutes and a canonical idempotency key. These tests assert the gate FAILS CLOSED —
 * each one checks the response status AND that the store was never reached.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-08T14:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actor = '2efaf676-84e4-45b1-8a13-50735a8df2c8';
const idempotencyKey = randomUUID();
const slideId = 'banner_1a2b3c4d';

const slide = {
  id: slideId,
  title: 'اسلاید',
  description: null,
  destination: { kind: 'screen' as const, screen: 'today' as const },
  isActive: false,
  sortOrder: 0,
  hasImage: true,
  legacyImageUrl: null,
  createdAt: '2026-10-08T14:00:00.000Z',
};

function sessionStore(overrides: { recentAuthenticatedAt?: Date; missing?: boolean } = {}) {
  return {
    findActiveSession: async () =>
      overrides.missing
        ? null
        : {
            userId: actor,
            csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            recentAuthenticatedAt: overrides.recentAuthenticatedAt ?? now,
          },
    touchSession: async () => true,
  };
}

function upsertForm(payload: Record<string, unknown>, image?: Blob) {
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  if (image) form.set('image', image, 'slide.webp');
  return form;
}

const validPayload = {
  title: 'اسلاید تازه',
  description: 'توضیح',
  destination: { kind: 'screen', screen: 'store' },
  isActive: false,
};

function mutationRequest(
  body: FormData | string,
  headers: Record<string, string | undefined> = {},
  path = '/api/presentation/slides',
) {
  const merged: Record<string, string> = {
    origin: config.origin,
    cookie: `__Host-learnbox_admin_session=${sessionToken}`,
    'x-learnbox-csrf-token': csrfToken,
    'idempotency-key': idempotencyKey,
  };
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) delete merged[name];
    else merged[name] = value;
  }
  return new Request(`https://admin.learnbox.app${path}`, {
    method: 'POST',
    headers: merged,
    body,
  });
}

/** Every upsert handler in this suite shares one spying store. */
function upsertHandler(
  result: UpsertSlideResult | 'throw' = { status: 'applied', row: slide },
  options: {
    enabled?: boolean;
    recentAuthenticatedAt?: Date;
    missingSession?: boolean;
    normalize?: 'reject' | 'accept';
  } = {},
) {
  const calls: unknown[] = [];
  let normalizeCalls = 0;
  const handler = createPresentationSlideUpsertRoute({
    enabled: options.enabled ?? true,
    config,
    now: () => now,
    sessionStore: sessionStore({
      recentAuthenticatedAt: options.recentAuthenticatedAt,
      missing: options.missingSession,
    }) as never,
    normalize: async () => {
      normalizeCalls += 1;
      return options.normalize === 'reject'
        ? { kind: 'rejected' as const, code: 'aspect_ratio_invalid' as const }
        : {
            kind: 'normalized' as const,
            bytes: Buffer.from([1, 2, 3]),
            checksum: 'a'.repeat(64),
            width: 1280,
            height: 640,
            byteSize: 3,
            mediaType: 'image/webp' as const,
          };
    },
    store: {
      upsertSlide: async (input: unknown) => {
        calls.push(input);
        if (result === 'throw') throw new Error('database unavailable');
        return result;
      },
    } as never,
  });
  return { handler, calls, normalizeCalls: () => normalizeCalls };
}

describe('M4.2 presentation slide routes — the gate fails closed', () => {
  it('reports 404 on every handler while the presentation flag is off', async () => {
    let touched = false;
    const store = {
      listSlides: async () => {
        touched = true;
        return { status: 'ok' as const, rows: [] };
      },
      readSlideImage: async () => {
        touched = true;
        return { status: 'not_found' as const };
      },
      upsertSlide: async () => {
        touched = true;
        return { status: 'applied' as const, row: slide };
      },
      reorderSlides: async () => {
        touched = true;
        return { status: 'applied' as const, rows: [] };
      },
    };
    const dependencies = {
      enabled: false,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: store as never,
    };

    const responses = await Promise.all([
      createPresentationSlidesRoute(dependencies)(
        new Request('https://admin.learnbox.app/api/presentation/slides', {
          headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
        }),
      ),
      createPresentationSlideImageRoute(dependencies)(
        new Request(`https://admin.learnbox.app/api/presentation/slides/image?slideId=${slideId}`, {
          headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
        }),
      ),
      createPresentationSlideUpsertRoute(dependencies)(mutationRequest(upsertForm(validPayload))),
      createPresentationSlideReorderRoute(dependencies)(
        mutationRequest(JSON.stringify({ order: [slideId] }), {
          'content-type': 'application/json',
        }),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(touched).toBe(false);
  });

  it('rejects a cross-site origin, a wrong content type and a forged CSRF token', async () => {
    const crossSite = upsertHandler();
    const wrongType = upsertHandler();
    const forged = upsertHandler();

    const crossSiteResponse = await crossSite.handler(
      mutationRequest(upsertForm(validPayload), { origin: 'https://evil.example.com' }),
    );
    const wrongTypeResponse = await wrongType.handler(
      mutationRequest(JSON.stringify(validPayload), { 'content-type': 'application/json' }),
    );
    const forgedResponse = await forged.handler(
      mutationRequest(upsertForm(validPayload), { 'x-learnbox-csrf-token': 'x'.repeat(43) }),
    );

    expect([crossSiteResponse.status, wrongTypeResponse.status, forgedResponse.status]).toEqual([
      400, 400, 400,
    ]);
    expect([crossSite.calls, wrongType.calls, forged.calls]).toEqual([[], [], []]);
    expect(crossSite.normalizeCalls()).toBe(0);
  });

  it('answers 401 without a session and 428 when the last authentication is stale', async () => {
    const anonymous = upsertHandler(undefined, { missingSession: true });
    const stale = upsertHandler(undefined, {
      recentAuthenticatedAt: new Date(now.getTime() - 6 * 60_000),
    });

    const anonymousResponse = await anonymous.handler(mutationRequest(upsertForm(validPayload)));
    const staleResponse = await stale.handler(mutationRequest(upsertForm(validPayload)));

    expect(anonymousResponse.status).toBe(401);
    expect(staleResponse.status).toBe(428);
    await expect(staleResponse.json()).resolves.toEqual({ code: 'reauthentication_required' });
    // The upload is never even read before the gate is satisfied.
    expect(stale.normalizeCalls()).toBe(0);
    expect([anonymous.calls, stale.calls]).toEqual([[], []]);
  });

  it('requires a canonical idempotency key on both mutations', async () => {
    const missing = upsertHandler();
    const malformed = upsertHandler();
    const missingResponse = await missing.handler(
      mutationRequest(upsertForm(validPayload), { 'idempotency-key': undefined }),
    );
    const malformedResponse = await malformed.handler(
      mutationRequest(upsertForm(validPayload), { 'idempotency-key': 'not-a-uuid' }),
    );

    let reorderCalls = 0;
    const reorder = createPresentationSlideReorderRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: {
        reorderSlides: async () => {
          reorderCalls += 1;
          return { status: 'applied' as const, rows: [] };
        },
      } as never,
    });
    const reorderResponse = await reorder(
      mutationRequest(
        JSON.stringify({ order: [slideId] }),
        { 'content-type': 'application/json', 'idempotency-key': undefined },
        '/api/presentation/slides/reorder',
      ),
    );

    expect([missingResponse.status, malformedResponse.status, reorderResponse.status]).toEqual([
      400, 400, 400,
    ]);
    expect([missing.calls.length, malformed.calls.length, reorderCalls]).toEqual([0, 0, 0]);
  });
});

describe('M4.2 presentation slide routes — input validation', () => {
  it('refuses a payload whose destination is not an allowed one', async () => {
    const cases = [
      { ...validPayload, destination: { kind: 'screen', screen: 'admin' } },
      { ...validPayload, destination: { kind: 'url', url: 'http://example.com/x' } },
      { ...validPayload, destination: { kind: 'url', url: 'javascript:alert(1)' } },
      { ...validPayload, destination: { kind: 'url', url: 'https://user:pw@example.com/x' } },
      { ...validPayload, destination: { kind: 'url', url: 'https://localhost/x' } },
      { ...validPayload, destination: { kind: 'url', url: 'https://10.0.0.5/x' } },
      { ...validPayload, destination: { kind: 'pack', packId: '../../etc/passwd' } },
      { ...validPayload, destination: { kind: 'elsewhere', url: 'https://example.com' } },
      { ...validPayload, destination: undefined },
    ];

    for (const payload of cases) {
      const { handler, calls } = upsertHandler();
      const response = await handler(mutationRequest(upsertForm(payload)));
      expect(response.status, JSON.stringify(payload.destination)).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it('refuses a payload with no title, an overlong title or a non-boolean active flag', async () => {
    const cases = [
      { ...validPayload, title: '   ' },
      { ...validPayload, title: 'ا'.repeat(121) },
      { ...validPayload, description: 'ب'.repeat(281) },
      { ...validPayload, isActive: 'yes' },
      { ...validPayload, slideId: 'not-a-banner-id' },
    ];

    for (const payload of cases) {
      const { handler, calls } = upsertHandler();
      const response = await handler(mutationRequest(upsertForm(payload)));
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it('refuses an oversized upload before decoding it, and a rejected image after', async () => {
    const oversized = upsertHandler();
    const oversizedResponse = await oversized.handler(
      mutationRequest(upsertForm(validPayload, new Blob([new Uint8Array(6 * 1024 * 1024 + 1)]))),
    );
    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toEqual({
      code: 'image_rejected',
      reason: 'file_too_large',
    });
    expect(oversized.normalizeCalls()).toBe(0);
    expect(oversized.calls).toEqual([]);

    const rejected = upsertHandler(undefined, { normalize: 'reject' });
    const rejectedResponse = await rejected.handler(
      mutationRequest(upsertForm(validPayload, new Blob([new Uint8Array(32)]))),
    );
    expect(rejectedResponse.status).toBe(400);
    await expect(rejectedResponse.json()).resolves.toEqual({
      code: 'image_rejected',
      reason: 'aspect_ratio_invalid',
    });
    expect(rejected.normalizeCalls()).toBe(1);
    expect(rejected.calls).toEqual([]);
  });

  it('rejects a reorder body that is not a complete list of slide ids', async () => {
    for (const body of [
      {},
      { order: [] },
      { order: 'banner_1a2b3c4d' },
      { order: [slideId, 'DROP TABLE banners'] },
      { order: Array.from({ length: 51 }, () => slideId) },
    ]) {
      let calls = 0;
      const handler = createPresentationSlideReorderRoute({
        enabled: true,
        config,
        now: () => now,
        sessionStore: sessionStore() as never,
        store: {
          reorderSlides: async () => {
            calls += 1;
            return { status: 'applied' as const, rows: [] };
          },
        } as never,
      });
      const response = await handler(
        mutationRequest(
          JSON.stringify(body),
          { 'content-type': 'application/json' },
          '/api/presentation/slides/reorder',
        ),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(calls).toBe(0);
    }
  });
});

describe('M4.2 presentation slide routes — authorized behaviour', () => {
  it('hands the store the parsed slide, the normalized bytes and the session actor', async () => {
    const { handler, calls, normalizeCalls } = upsertHandler();
    const response = await handler(
      mutationRequest(
        upsertForm({ ...validPayload, slideId, isActive: true }, new Blob([new Uint8Array(64)])),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'applied', slide });
    expect(normalizeCalls()).toBe(1);
    expect(calls).toEqual([
      {
        slideId,
        title: 'اسلاید تازه',
        description: 'توضیح',
        destination: { kind: 'screen', screen: 'store' },
        isActive: true,
        imageBytes: Buffer.from([1, 2, 3]),
        actorUserId: actor,
        idempotencyKey,
      },
    ]);
  });

  it('translates each store refusal into its own actionable status', async () => {
    const limit = upsertHandler({ status: 'active_limit_reached', activeCount: 3 });
    const limitResponse = await limit.handler(mutationRequest(upsertForm(validPayload)));
    expect(limitResponse.status).toBe(409);
    await expect(limitResponse.json()).resolves.toEqual({
      code: 'active_limit_reached',
      activeCount: 3,
      maximumActiveSlides: 3,
    });

    const needsImage = upsertHandler({ status: 'image_required' });
    const needsImageResponse = await needsImage.handler(mutationRequest(upsertForm(validPayload)));
    expect(needsImageResponse.status).toBe(400);
    await expect(needsImageResponse.json()).resolves.toEqual({ code: 'image_required' });

    const unknownPack = upsertHandler({ status: 'unknown_pack' });
    const unknownPackResponse = await unknownPack.handler(
      mutationRequest(
        upsertForm({ ...validPayload, destination: { kind: 'pack', packId: 'ghost' } }),
      ),
    );
    expect(unknownPackResponse.status).toBe(400);
    await expect(unknownPackResponse.json()).resolves.toEqual({ code: 'unknown_pack' });

    // An actor without the role, and a missing slide, are the same answer: nothing to see.
    for (const status of ['forbidden', 'not_found'] as const) {
      const refused = upsertHandler({ status } as never);
      const response = await refused.handler(mutationRequest(upsertForm(validPayload)));
      expect(response.status).toBe(404);
    }
  });

  it('answers 503 without leaking a database failure', async () => {
    const { handler } = upsertHandler('throw');
    const response = await handler(mutationRequest(upsertForm(validPayload)));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/database/i);
  });

  it('lists slides with the server-side maximum and no image bytes', async () => {
    const handler = createPresentationSlidesRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: { listSlides: async () => ({ status: 'ok' as const, rows: [slide] }) } as never,
    });
    const response = await handler(
      new Request('https://admin.learnbox.app/api/presentation/slides', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      slides: [slide],
      maximumActiveSlides: 3,
    });
  });

  it('hides the list from an Admin without the presentation role', async () => {
    const handler = createPresentationSlidesRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: { listSlides: async () => ({ status: 'forbidden' as const }) } as never,
    });
    const response = await handler(
      new Request('https://admin.learnbox.app/api/presentation/slides', {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('streams one slide image privately, and only for a well-formed slide id', async () => {
    const reads: unknown[] = [];
    const dependencies = {
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: {
        readSlideImage: async (input: unknown) => {
          reads.push(input);
          return {
            status: 'ok' as const,
            bytes: Buffer.from([7, 8, 9]),
            checksum: 'b'.repeat(64),
          };
        },
      } as never,
    };
    const handler = createPresentationSlideImageRoute(dependencies);

    const response = await handler(
      new Request(`https://admin.learnbox.app/api/presentation/slides/image?slideId=${slideId}`, {
        headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([7, 8, 9]);
    expect(reads).toEqual([{ slideId, actorUserId: actor }]);

    // The caller names a slide, never a path or an object key.
    for (const value of ['', '../../etc/passwd', 'admin/splash/private-object.webp', 'banner_x!']) {
      const bad = await handler(
        new Request(
          `https://admin.learnbox.app/api/presentation/slides/image?slideId=${encodeURIComponent(value)}`,
          { headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` } },
        ),
      );
      expect(bad.status, value).toBe(400);
    }
    expect(reads).toHaveLength(1);

    const anonymous = await createPresentationSlideImageRoute({
      ...dependencies,
      sessionStore: sessionStore({ missing: true }) as never,
    })(new Request(`https://admin.learnbox.app/api/presentation/slides/image?slideId=${slideId}`));
    expect(anonymous.status).toBe(401);
  });

  it('answers 404 for a slide with no stored bytes and for an actor without the role', async () => {
    for (const status of ['not_found', 'forbidden'] as const) {
      const handler = createPresentationSlideImageRoute({
        enabled: true,
        config,
        now: () => now,
        sessionStore: sessionStore() as never,
        store: { readSlideImage: async () => ({ status }) } as never,
      });
      const response = await handler(
        new Request(`https://admin.learnbox.app/api/presentation/slides/image?slideId=${slideId}`, {
          headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
        }),
      );
      expect(response.status).toBe(404);
    }
  });

  it('applies and replays a reorder through the shared gate', async () => {
    const calls: unknown[] = [];
    const handler = createPresentationSlideReorderRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: {
        reorderSlides: async (input: unknown) => {
          calls.push(input);
          return { status: 'idempotent' as const, rows: [slide] };
        },
      } as never,
    });

    const response = await handler(
      mutationRequest(
        JSON.stringify({ order: [slideId, 'banner_99887766'] }),
        { 'content-type': 'application/json' },
        '/api/presentation/slides/reorder',
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'idempotent', slides: [slide] });
    expect(calls).toEqual([
      { order: [slideId, 'banner_99887766'], actorUserId: actor, idempotencyKey },
    ]);
  });

  it('reports an impossible order as a client error, not a server failure', async () => {
    const handler = createPresentationSlideReorderRoute({
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore() as never,
      store: { reorderSlides: async () => ({ status: 'invalid_order' as const }) } as never,
    });
    const response = await handler(
      mutationRequest(
        JSON.stringify({ order: [slideId] }),
        { 'content-type': 'application/json' },
        '/api/presentation/slides/reorder',
      ),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'invalid_order' });
  });
});
