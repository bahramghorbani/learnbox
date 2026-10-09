import { describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createStoreListingUpsertRoute,
  createStoreListingsRoute,
} from '../lib/server/admin-store-listing-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 2 / Milestone 2.1 — Store listing route boundary.
 *
 * Two guarantees under test.
 *
 * 1. Changing what LearnBox offers commercially is exactly as hard to trigger as publishing content:
 *    unauthenticated, cross-origin, CSRF-less, stale-reauth and key-less callers are refused BEFORE
 *    the store is reached, and the whole surface is 404 while the feature flag is off.
 * 2. The Store cannot edit content. Content fields in the request body are ignored rather than
 *    forwarded, so no amount of client creativity turns this endpoint into a pack editor.
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
const packId = 'learnbox-start-a1-essentials';
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

const listingRow = {
  packId,
  packDisplayName: 'بستهٔ شروع',
  packStatus: 'published',
  category: 'essentials',
  isFree: true,
  priceTomans: null,
  listing: {
    storeStatus: 'listed' as const,
    featured: true,
    displayOrder: 3,
    coverObjectKey: 'covers/start.webp',
    commercialSummary: 'بستهٔ آغازین',
    listedAt: now.toISOString(),
  },
};

function store() {
  return {
    listStoreListings: vi.fn(async () => ({ status: 'ok' as const, rows: [listingRow] })),
    upsertStoreListing: vi.fn(async () => ({ status: 'applied' as const, row: listingRow })),
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

const validBody = {
  packId,
  storeStatus: 'listed',
  featured: true,
  displayOrder: 3,
  coverObjectKey: 'covers/start.webp',
  commercialSummary: 'بستهٔ آغازین',
};

function put(body: unknown, headers: Record<string, string> = {}, omit: string[] = []) {
  const base: Record<string, string> = {
    Origin: config.origin,
    'Content-Type': 'application/json',
    'x-learnbox-csrf-token': csrfToken,
    Cookie: `__Host-learnbox_admin_session=${sessionToken}`,
    'Idempotency-Key': idempotencyKey,
    ...headers,
  };
  for (const key of omit) delete base[key];
  return new Request('https://admin.learnbox.app/api/store/listings', {
    method: 'PUT',
    headers: base,
    body: JSON.stringify(body),
  });
}

function get(headers: Record<string, string> = {}) {
  return new Request('https://admin.learnbox.app/api/store/listings', {
    headers: { Cookie: `__Host-learnbox_admin_session=${sessionToken}`, ...headers },
  });
}

describe('Store listing upsert authorisation (M2.1)', () => {
  it('is 404 while the Store feature flag is off, and never reaches the store', async () => {
    const deps = { ...dependencies(), enabled: false };
    const response = await createStoreListingUpsertRoute(deps as never)(put(validBody));
    expect(response.status).toBe(404);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('refuses a request with no session', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    const response = await createStoreListingUpsertRoute(deps as never)(put(validBody));
    expect(response.status).toBe(401);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request', async () => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(
      put(validBody, { Origin: 'https://evil.example' }),
    );
    expect(response.status).toBe(400);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('refuses a request with no CSRF token', async () => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(
      put(validBody, {}, ['x-learnbox-csrf-token']),
    );
    expect(response.status).toBe(400);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('demands recent re-authentication', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ recent: false }) };
    const response = await createStoreListingUpsertRoute(deps as never)(put(validBody));
    expect(response.status).toBe(428);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('demands a uuid idempotency key', async () => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(
      put(validBody, { 'Idempotency-Key': 'nope' }),
    );
    expect(response.status).toBe(400);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('applies a fully authorised commercial change', async () => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(put(validBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'applied' });
    expect(deps.store.upsertStoreListing).toHaveBeenCalledWith(
      expect.objectContaining({ packId, storeStatus: 'listed', actorUserId, idempotencyKey }),
    );
  });

  it('reports a stale write as 409 so two operators cannot silently overwrite each other', async () => {
    const deps = dependencies();
    deps.store.upsertStoreListing = vi.fn(async () => ({
      status: 'stale' as const,
      currentStoreStatus: 'listed' as const,
    })) as never;
    const response = await createStoreListingUpsertRoute(deps as never)(
      put({ ...validBody, expectedStoreStatus: 'absent' }),
    );
    expect(response.status).toBe(409);
  });

  it('hides a forbidden role behind 404 rather than confirming the pack exists', async () => {
    const deps = dependencies();
    deps.store.upsertStoreListing = vi.fn(async () => ({ status: 'forbidden' as const })) as never;
    const response = await createStoreListingUpsertRoute(deps as never)(put(validBody));
    expect(response.status).toBe(404);
  });
});

describe('Store listing payload validation (M2.1)', () => {
  it.each([
    ['a missing pack id', { ...validBody, packId: undefined }],
    ['a uuid-shaped pack id that is not a slug', { ...validBody, packId: 'NOT A SLUG' }],
    ['an unknown store status', { ...validBody, storeStatus: 'published' }],
    ['a non-boolean featured flag', { ...validBody, featured: 'yes' }],
    ['a negative display order', { ...validBody, displayOrder: -1 }],
    ['a fractional display order', { ...validBody, displayOrder: 1.5 }],
    ['an over-long commercial summary', { ...validBody, commercialSummary: 'x'.repeat(2001) }],
    ['an over-long cover key', { ...validBody, coverObjectKey: 'x'.repeat(513) }],
    ['a bogus expected status', { ...validBody, expectedStoreStatus: 'whatever' }],
  ])('rejects %s', async (_label, body) => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(put(body));
    expect(response.status).toBe(400);
    expect(deps.store.upsertStoreListing).not.toHaveBeenCalled();
  });

  it('IGNORES content fields instead of forwarding them: the Store cannot edit pack content', async () => {
    const deps = dependencies();
    const response = await createStoreListingUpsertRoute(deps as never)(
      put({
        ...validBody,
        // Everything below is canonical content or canonical commercial data owned by `packs`.
        displayName: 'سرقت نام',
        description: 'سرقت توضیح',
        priceTomans: 999_000,
        isFree: false,
        category: 'hijacked',
        status: 'published',
        cards: [{ lemma: 'Apfel' }],
      }),
    );
    expect(response.status).toBe(200);
    const calls = deps.store.upsertStoreListing.mock.calls as unknown as Record<
      string,
      unknown
    >[][];
    const forwarded = calls[0]?.[0] ?? {};
    expect(Object.keys(forwarded).sort()).toEqual(
      [
        'actorUserId',
        'commercialSummary',
        'coverObjectKey',
        'displayOrder',
        'expectedStoreStatus',
        'featured',
        'idempotencyKey',
        'packId',
        'storeStatus',
      ].sort(),
    );
  });
});

describe('Store listing read (M2.1)', () => {
  it('is 404 while the flag is off', async () => {
    const deps = { ...dependencies(), enabled: false };
    expect((await createStoreListingsRoute(deps as never)(get())).status).toBe(404);
    expect(deps.store.listStoreListings).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated read', async () => {
    const deps = { ...dependencies(), sessionStore: sessionStore({ userId: null }) };
    expect((await createStoreListingsRoute(deps as never)(get())).status).toBe(401);
    expect(deps.store.listStoreListings).not.toHaveBeenCalled();
  });

  it('returns canonical listings to an authorised session', async () => {
    const deps = dependencies();
    const response = await createStoreListingsRoute(deps as never)(get());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ listings: [listingRow] });
  });

  it('hides a forbidden role behind 404', async () => {
    const deps = dependencies();
    deps.store.listStoreListings = vi.fn(async () => ({ status: 'forbidden' as const })) as never;
    expect((await createStoreListingsRoute(deps as never)(get())).status).toBe(404);
  });
});

describe('Store is never a second source of truth for content (M2.1)', () => {
  const root = join(__dirname, '..');
  const storeSource = readFileSync(
    join(root, 'lib/server/postgres-store-listings-store.ts'),
    'utf8',
  );
  const routeSource = readFileSync(join(root, 'lib/server/admin-store-listing-routes.ts'), 'utf8');

  it('writes exactly one commercial table and the audit log, nothing else', () => {
    // `(?!SET\b)` skips the `ON CONFLICT ... DO UPDATE SET` clause, which names no table.
    const writes = [
      ...storeSource.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+(?!SET\b)(\w+)/g),
    ].map((match) => match[2]);
    expect(writes.length).toBeGreaterThan(0);
    expect([...new Set(writes)].sort()).toEqual(['audit_logs', 'store_listings']);
  });

  it('never writes a content, media or commerce-ownership table', () => {
    for (const table of [
      'packs',
      'pack_cards',
      'cards',
      'card_versions',
      'card_media',
      'review_decisions',
      'user_packs',
      'purchase_events',
    ]) {
      expect(storeSource).not.toMatch(
        new RegExp(`(INSERT INTO|UPDATE|DELETE FROM)\\s+${table}\\b`),
      );
    }
  });

  it('does not duplicate price, category or free state as listing columns', () => {
    // These stay canonical on `packs`; the listing may only READ them through the join.
    const insert = storeSource.slice(storeSource.indexOf('INSERT INTO store_listings'));
    const columnList = insert.slice(0, insert.indexOf('VALUES'));
    for (const column of ['price_tomans', 'category', 'is_free']) {
      expect(columnList).not.toContain(column);
    }
  });

  it('accepts no content field in the route contract', () => {
    for (const field of ['displayName', 'priceTomans', 'isFree', 'category', 'cards', 'lemma']) {
      expect(routeSource).not.toContain(`body.${field}`);
    }
  });

  it('keeps the migration additive and retry-safe: no drop, no destructive alter, no backfill', () => {
    const migration = readFileSync(
      join(root, '../../database/migrations/0026_store_listings.sql'),
      'utf8',
    );
    // Retry safety: an interrupted or out-of-band apply must not turn every retry into
    // "relation already exists" (see database/README.md and 0032_role_grant_repair.sql).
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS store_listings');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS store_listings_display_idx');
    expect(migration).toMatch(/pack_id TEXT PRIMARY KEY REFERENCES packs\(id\)/);
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE\b/i);
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(migration).not.toMatch(/\bINSERT INTO\b/i);
    // Commercial facts that already live on `packs` must not be redeclared here.
    for (const column of ['price_tomans', 'is_free', 'category ']) {
      expect(migration.slice(migration.indexOf('CREATE TABLE'))).not.toContain(column);
    }
  });
});
