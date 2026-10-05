import { describe, expect, it } from 'vitest';

import { readAdminContentPacksManageConfig } from '../lib/server/admin-content-packs-config';
import {
  createContentCardCreateRoute,
  createContentCardEditRoute,
  createContentPackCreateRoute,
  createContentPackEditRoute,
} from '../lib/server/admin-content-packs-write-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import {
  buildCardContent,
  deriveContentId,
  type CardContentInput,
} from '../lib/server/postgres-content-packs-write-store';

/**
 * Phase 1 / Milestone 1.2 — Pack & Card management.
 *
 * These tests pin the security boundary and the review-integrity invariant, which are the two
 * things that must not regress: an unauthenticated or non-editorial caller must never mutate
 * canonical content, and an edit must never silently rewrite reviewed or published content.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-05T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const idempotencyKey = '11111111-1111-4111-8111-111111111111';
const cardId = '33333333-3333-4333-8333-333333333333';

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
            // A stale reauthentication must force 428 on a content write.
            recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 86_400_000),
          },
    touchSession: async () => true,
  };
}

const validContent: CardContentInput = {
  lemma: 'Tisch',
  article: 'der',
  partOfSpeech: 'noun',
  essentialInflection: 'die Tische',
  pronunciationIpa: 'tɪʃ',
  persianMeanings: ['میز'],
  examples: [{ german: 'Der Tisch ist neu.', persian: 'میز نو است.' }],
  simpleGermanDefinition: 'Ein Möbelstück mit einer Platte.',
  grammarNote: 'اسم مذکر؛ جمع با -e.',
  topicTags: ['home'],
  difficulty: 1,
  cefr: 'A1',
  visualConcept: 'A table is the dominant object.',
  imagePrompt: 'Soft 3D table, no text.',
  sourceReference: 'Goethe A1 scope reference.',
};

function mutationRequest(
  path: string,
  body: unknown,
  options: {
    method?: string;
    origin?: string | null;
    csrf?: string | null;
    key?: string | null;
    contentType?: string;
    cookie?: boolean;
  } = {},
) {
  const headers = new Headers();
  headers.set('content-type', options.contentType ?? 'application/json');
  if (options.origin !== null) headers.set('origin', options.origin ?? config.origin);
  if (options.cookie !== false) {
    headers.set('cookie', `__Host-learnbox_admin_session=${sessionToken}`);
  }
  if (options.csrf !== null) headers.set('x-learnbox-csrf-token', options.csrf ?? csrfToken);
  if (options.key !== null) headers.set('idempotency-key', options.key ?? idempotencyKey);
  return new Request(`https://admin.learnbox.app${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const packContext = { params: Promise.resolve({ packId: 'learnbox-m12' }) };
const cardContext = { params: Promise.resolve({ cardId }) };

function unreachableStore(method: string) {
  return {
    [method]: async () => {
      throw new Error(`${method} must not be reached`);
    },
  } as never;
}

describe('content packs manage runtime gate', () => {
  const base = {
    LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
    LEARNBOX_ADMIN_ORIGIN: config.origin,
    LEARNBOX_ADMIN_RP_ID: config.rpId,
    LEARNBOX_ADMIN_TOKEN_HASH_KEY: config.tokenHashKey,
  };

  it('is off by default, even with the read workspace enabled', () => {
    expect(readAdminContentPacksManageConfig({}).enabled).toBe(false);
    expect(
      readAdminContentPacksManageConfig({
        ...base,
        LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED: 'true',
      }).enabled,
    ).toBe(false);
  });

  it('requires the read workspace as well as its own flag', () => {
    expect(
      readAdminContentPacksManageConfig({
        ...base,
        LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED: 'true',
      }).enabled,
    ).toBe(false);
    expect(
      readAdminContentPacksManageConfig({
        ...base,
        LEARNBOX_ADMIN_CONTENT_PACKS_ENABLED: 'true',
        LEARNBOX_ADMIN_CONTENT_PACKS_MANAGE_ENABLED: 'true',
      }).enabled,
    ).toBe(true);
  });
});

describe('pack/card mutation authorization', () => {
  it('rejects an unauthenticated pack creation with 401 and never reaches the store', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: unreachableStore('createPack'),
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs', { packId: 'x', displayName: 'y' }, { cookie: false }),
    );

    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated card creation with 401', async () => {
    const route = createContentCardCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ userId: null }),
      store: unreachableStore('createCard'),
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs/learnbox-m12/cards', validContent, { cookie: false }),
      packContext,
    );

    expect(response.status).toBe(401);
  });

  it('rejects a cross-site origin before touching the session', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: unreachableStore('createPack'),
      now: () => now,
    });

    const response = await route(
      mutationRequest(
        '/api/content/packs',
        { packId: 'x', displayName: 'y' },
        { origin: 'https://evil.example' },
      ),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a missing or wrong CSRF token', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: unreachableStore('createPack'),
      now: () => now,
    });

    for (const csrf of [null, 'w'.repeat(43)]) {
      const response = await route(
        mutationRequest('/api/content/packs', { packId: 'x', displayName: 'y' }, { csrf }),
      );
      expect(response.status).toBe(400);
    }
  });

  it('demands fresh reauthentication for a content write', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore({ recent: false }),
      store: unreachableStore('createPack'),
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs', { packId: 'x', displayName: 'y' }),
    );

    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ code: 'reauthentication_required' });
  });

  it('requires an Idempotency-Key', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: unreachableStore('createPack'),
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs', { packId: 'x', displayName: 'y' }, { key: null }),
    );

    expect(response.status).toBe(400);
  });

  it('404s every mutation route while the manage flag is off', async () => {
    const disabled = { enabled: false, config, sessionStore: sessionStore(), now: () => now };
    const create = createContentPackCreateRoute({
      ...disabled,
      store: unreachableStore('createPack'),
    });
    const edit = createContentPackEditRoute({ ...disabled, store: unreachableStore('editPack') });
    const addCard = createContentCardCreateRoute({
      ...disabled,
      store: unreachableStore('createCard'),
    });
    const editCard = createContentCardEditRoute({
      ...disabled,
      store: unreachableStore('editCard'),
    });

    expect((await create(mutationRequest('/api/content/packs', {}))).status).toBe(404);
    expect(
      (
        await edit(
          mutationRequest('/api/content/packs/learnbox-m12', {}, { method: 'PATCH' }),
          packContext,
        )
      ).status,
    ).toBe(404);
    expect(
      (await addCard(mutationRequest('/api/content/packs/learnbox-m12/cards', {}), packContext))
        .status,
    ).toBe(404);
    expect(
      (
        await editCard(
          mutationRequest(`/api/content/cards/${cardId}`, {}, { method: 'PATCH' }),
          cardContext,
        )
      ).status,
    ).toBe(404);
  });

  it('surfaces a store-resolved role denial as 403', async () => {
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: { createPack: async () => ({ status: 'forbidden' as const }) },
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs', { packId: 'learnbox-m12', displayName: 'y' }),
    );

    expect(response.status).toBe(403);
  });

  it('passes the session actor to the store and never trusts a body-supplied actor', async () => {
    let seen: { actorUserId?: string } = {};
    const route = createContentPackCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        createPack: async (input) => {
          seen = input;
          return { status: 'applied' as const, packId: input.packId };
        },
      },
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs', {
        packId: 'learnbox-m12',
        displayName: 'بستهٔ آزمایشی',
        actorUserId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      }),
    );

    expect(response.status).toBe(200);
    expect(seen.actorUserId).toBe(actorUserId);
  });

  it('reports canonical validation issues as a structured 422', async () => {
    const route = createContentCardCreateRoute({
      enabled: true,
      config,
      sessionStore: sessionStore(),
      store: {
        createCard: async () => ({
          status: 'invalid' as const,
          issues: [{ field: 'persianMeanings', message: 'حداقل یک معنی فارسیِ معتبر لازم است.' }],
        }),
      },
      now: () => now,
    });

    const response = await route(
      mutationRequest('/api/content/packs/learnbox-m12/cards', validContent),
      packContext,
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'invalid_content' });
  });
});

describe('canonical content construction', () => {
  it('derives the canonical content_id slug shape, dropping the article', () => {
    expect(deriveContentId('learnbox-start', 'A1', 'das Haus')).toBe('start-a1-haus');
    expect(deriveContentId('learnbox-start', 'A1', 'Apfel')).toBe('start-a1-apfel');
  });

  it('transliterates umlauts the German way instead of stripping them', () => {
    expect(deriveContentId('learnbox-start', 'A1', 'die Tür')).toBe('start-a1-tuer');
    expect(deriveContentId('learnbox-start', 'A1', 'Fuß')).toBe('start-a1-fuss');
  });

  it('builds a canonical item that the canonical validator accepts', async () => {
    const { validateLearningVocabularyItem } = await import('@learnbox/content-models');
    const content = buildCardContent(validContent, {
      contentId: 'm12-a1-tisch',
      version: 1,
      media: [],
      status: 'draft',
    });

    expect(validateLearningVocabularyItem(content)).toEqual([]);
    expect(content.normalizedLemma).toBe('tisch');
    expect(content.provenance.sourceType).toBe('editorial');
    expect(content.source.provider).toBe('editorial');
  });

  it('never lets the caller author a published status or inject media', () => {
    const content = buildCardContent(
      { ...validContent, lemma: 'Stuhl' },
      { contentId: 'm12-a1-stuhl', version: 1 },
    );

    // Publication is a separate canonical gate; authoring always produces a draft with no media.
    expect(content.status).toBe('draft');
    expect(content.media).toEqual([]);
  });

  it('reports an out-of-range difficulty through the canonical validator', async () => {
    const { validateLearningVocabularyItem } = await import('@learnbox/content-models');
    const content = buildCardContent(
      { ...validContent, difficulty: 9 as CardContentInput['difficulty'] },
      { contentId: 'm12-a1-tisch', version: 1 },
    );

    expect(validateLearningVocabularyItem(content).map((issue) => issue.field)).toContain(
      'difficulty',
    );
  });
});
