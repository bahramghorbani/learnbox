import { describe, expect, it } from 'vitest';

import { readAdminContentPacksConfig } from '../lib/server/admin-content-packs-config';
import {
  createContentPackCardsRoute,
  createContentPacksListRoute,
} from '../lib/server/admin-content-packs-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import type {
  ContentPackCardEntry,
  ContentPackEntry,
} from '../lib/server/postgres-content-packs-store';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-05T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const packId = 'b1f0c0de-1111-4222-8333-444455556666';

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

const pack: ContentPackEntry = {
  id: packId,
  displayName: 'بستهٔ شروع',
  description: null,
  locale: 'de-DE',
  targetCefr: 'A1',
  targetItemCount: 35,
  category: null,
  isFree: true,
  priceTomans: null,
  status: 'published',
  cardCount: 35,
  publishedCardCount: 35,
  reviewableCardCount: 0,
  createdAt: now.toISOString(),
  publishedAt: now.toISOString(),
};

const card: ContentPackCardEntry = {
  cardId: '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d',
  contentId: 'start-a1-haus',
  cardVersionId: 'b89dabb1-406a-5b88-b535-4e90ba6af24c',
  lemma: 'Haus',
  article: 'das',
  partOfSpeech: 'noun',
  persianMeanings: ['خانه'],
  essentialInflection: 'die Häuser',
  pronunciationIpa: 'haʊs',
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  versionStatus: 'published',
  sortOrder: 1,
  media: { imageCount: 0, wordAudioCount: 0, sentenceAudioCount: 0, unrecorded: true },
};

function authenticatedRequest(path = `/api/content/packs`) {
  return new Request(`https://admin.learnbox.app${path}`, {
    headers: { cookie: `__Host-learnbox_admin_session=${sessionToken}` },
  });
}

describe('content packs runtime gate', () => {
  it('stays disabled unless the dedicated flag and the passkey runtime are both enabled', () => {
    expect(readAdminContentPacksConfig({}).enabled).toBe(false);
    expect(
      readAdminContentPacksConfig({ LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED: 'true' }).enabled,
    ).toBe(false);
    expect(
      readAdminContentPacksConfig({
        LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
        LEARNBOX_ADMIN_ORIGIN: config.origin,
        LEARNBOX_ADMIN_RP_ID: config.rpId,
        LEARNBOX_ADMIN_TOKEN_HASH_KEY: config.tokenHashKey,
      }).enabled,
    ).toBe(false);
  });
});

describe('content packs read routes — authorization', () => {
  it('never returns pack data to an unauthenticated caller', async () => {
    const route = createContentPacksListRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: {
        async listPacks() {
          throw new Error('store must not be reached without a session');
        },
      },
      now: () => now,
    });

    const response = await route(new Request('https://admin.learnbox.app/api/content/packs'));

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('بستهٔ شروع');
  });

  it('never returns card data to an unauthenticated caller', async () => {
    const route = createContentPackCardsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: {
        async listPackCards() {
          throw new Error('store must not be reached without a session');
        },
      },
      now: () => now,
    });

    const response = await route(
      new Request(`https://admin.learnbox.app/api/content/packs/${packId}`),
      packId,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('Haus');
  });

  it('answers 404 when the session actor lacks a content role', async () => {
    const route = createContentPacksListRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPacks() {
          return { status: 'forbidden' as const };
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest());
    expect(response.status).toBe(404);
  });

  it('returns canonical packs for an authorized actor and never caches them', async () => {
    const route = createContentPacksListRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPacks(userId: string) {
          expect(userId).toBe(actorUserId);
          return { status: 'ok' as const, packs: [pack] };
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const payload = (await response.json()) as { packs: ContentPackEntry[] };
    expect(payload.packs).toHaveLength(1);
    expect(payload.packs[0]?.cardCount).toBe(35);
    expect(payload.packs[0]?.publishedCardCount).toBe(35);
  });

  it('returns canonical cards for an authorized actor', async () => {
    const route = createContentPackCardsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPackCards(userId: string, requestedPackId: string) {
          expect(userId).toBe(actorUserId);
          expect(requestedPackId).toBe(packId);
          return { status: 'ok' as const, pack, cards: [card] };
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest(`/api/content/packs/${packId}`), packId);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { cards: ContentPackCardEntry[] };
    expect(payload.cards[0]?.lemma).toBe('Haus');
    expect(payload.cards[0]?.media.unrecorded).toBe(true);
  });

  it('hides pack existence behind 404 for a missing pack', async () => {
    const route = createContentPackCardsRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPackCards() {
          return { status: 'not_found' as const };
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest(), 'missing-pack');
    expect(response.status).toBe(404);
  });

  it('answers 503 instead of leaking details when the database fails', async () => {
    const route = createContentPacksListRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPacks() {
          throw new Error('connection terminated unexpectedly');
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('connection terminated');
  });

  it('is unreachable while the feature gate is closed', async () => {
    const route = createContentPacksListRoute({
      enabled: false,
      config,
      sessionStore: sessionStore(),
      store: {
        async listPacks() {
          return { status: 'ok' as const, packs: [pack] };
        },
      },
      now: () => now,
    });

    const response = await route(authenticatedRequest());
    expect(response.status).toBe(404);
  });
});
