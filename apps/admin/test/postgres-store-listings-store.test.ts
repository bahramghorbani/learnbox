import { describe, expect, it } from 'vitest';

import type { Pool } from 'pg';

import { PostgresStoreListingsStore } from '../lib/server/postgres-store-listings-store.js';

/**
 * Phase 2 / M2.1 — canonical Store listing store.
 *
 * The invariants under test are the ones that keep the Store honest: it writes exactly one table,
 * it never touches content, roles are resolved server-side, mutations are idempotent, and the
 * "for sale since" timestamp belongs to the server.
 */

const actorUserId = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const packId = 'learnbox-start-a1-essentials';
const idempotencyKey = ['dcd8e2a0', '3d55', '4b2e', '9d4b', '9b3b8e6f4c7a'].join('-');

type QueryCall = { sql: string; params?: readonly unknown[] };
type Row = Record<string, unknown>;

function createClient(respond: (sql: string, params: readonly unknown[] | undefined) => Row[]) {
  const calls: QueryCall[] = [];
  const client = {
    calls,
    async query(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      return { rows: respond(sql, params) };
    },
    release: () => undefined,
  };
  return client;
}

function poolFor(client: ReturnType<typeof createClient>) {
  return { connect: async () => client } as unknown as Pool;
}

const packRow = (listing: Row | undefined) => ({
  pack_id: packId,
  display_name: 'بستهٔ شروع',
  pack_status: 'published',
  category: 'essentials',
  is_free: true,
  price_tomans: null,
  ...(listing ?? {}),
});

/**
 * World with a publisher actor, one canonical pack, and an optional existing listing.
 * `auditRows` lets a test simulate a replayed idempotency key.
 */
function world(
  options: {
    role?: string;
    listing?: Row;
    auditRows?: Row[];
    packMissing?: boolean;
  } = {},
) {
  return (sql: string, params?: readonly unknown[]): Row[] => {
    if (sql.includes('FROM admin_role_assignments')) {
      const roles = (params?.[1] ?? []) as string[];
      return roles.includes(options.role ?? 'content_publisher')
        ? [{ role: options.role ?? 'content_publisher' }]
        : [];
    }
    if (sql.includes('FROM audit_logs')) return options.auditRows ?? [];
    if (sql.startsWith('SELECT id FROM packs')) return options.packMissing ? [] : [{ id: packId }];
    if (sql.includes('FROM store_listings WHERE pack_id')) {
      return options.listing ? [options.listing] : [];
    }
    if (sql.includes('FROM packs')) {
      // The LEFT JOIN read-back: the listing reflects whatever was just written.
      return [packRow(options.listing)];
    }
    return [];
  };
}

const baseInput = {
  packId,
  storeStatus: 'listed' as const,
  featured: true,
  displayOrder: 3,
  coverObjectKey: 'covers/start.webp',
  commercialSummary: 'بستهٔ آغازین',
  actorUserId,
  idempotencyKey,
};

describe('PostgresStoreListingsStore (M2.1)', () => {
  it('writes ONLY store_listings and audit_logs — never pack or card content', async () => {
    const client = createClient(world());
    const store = new PostgresStoreListingsStore(poolFor(client));

    await store.upsertStoreListing(baseInput);

    const writes = client.calls
      .map((call) => call.sql.trim())
      .filter((sql) => /^(INSERT|UPDATE|DELETE)/i.test(sql));
    expect(writes.length).toBeGreaterThan(0);
    for (const sql of writes) {
      expect(sql).toMatch(/INSERT INTO (store_listings|audit_logs)\b/);
    }
    // Content tables must never appear in a write issued by the Store.
    const written = writes.join('\n');
    for (const table of ['packs', 'pack_cards', 'cards', 'card_versions', 'card_media']) {
      expect(written).not.toMatch(new RegExp(`(INSERT INTO|UPDATE|DELETE FROM)\\s+${table}\\b`));
    }
  });

  it('applies a listing, stamps listed_at server-side and commits', async () => {
    const client = createClient(
      world({ listing: { store_status: 'listed', listed_at: '2026-10-06T00:00:00.000Z' } }),
    );
    const store = new PostgresStoreListingsStore(poolFor(client));

    // No prior listing: the FOR UPDATE read is what decides, so simulate absence there.
    const absent = createClient((sql, params) => {
      if (sql.includes('FROM store_listings WHERE pack_id')) return [];
      return world({ listing: { store_status: 'listed', listed_at: '2026-10-06T00:00:00.000Z' } })(
        sql,
        params,
      );
    });
    const freshStore = new PostgresStoreListingsStore(poolFor(absent));
    const result = await freshStore.upsertStoreListing(baseInput);

    expect(result.status).toBe('applied');
    const insert = absent.calls.find((call) => call.sql.includes('INSERT INTO store_listings'));
    expect(insert).toBeDefined();
    // listed_at (parameter 7) is produced by the server, not supplied by the caller.
    expect(insert?.params?.[6]).toBeTruthy();
    expect(absent.calls.some((call) => call.sql === 'COMMIT')).toBe(true);
    void store;
    void client;
  });

  it('clears listed_at when a pack is unlisted', async () => {
    const client = createClient(
      world({ listing: { store_status: 'listed', listed_at: '2026-09-01T00:00:00.000Z' } }),
    );
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing({ ...baseInput, storeStatus: 'unlisted' });

    expect(result.status).toBe('applied');
    const insert = client.calls.find((call) => call.sql.includes('INSERT INTO store_listings'));
    expect(insert?.params?.[1]).toBe('unlisted');
    expect(insert?.params?.[6]).toBeNull();
  });

  it('preserves the original listed_at while a listing stays listed', async () => {
    const original = '2026-09-01T00:00:00.000Z';
    const client = createClient(
      world({ listing: { store_status: 'listed', listed_at: original } }),
    );
    const store = new PostgresStoreListingsStore(poolFor(client));

    await store.upsertStoreListing({ ...baseInput, featured: false });

    const insert = client.calls.find((call) => call.sql.includes('INSERT INTO store_listings'));
    expect(insert?.params?.[6]).toBe(original);
  });

  it('is idempotent: a replayed key reports the stored state without writing again', async () => {
    const client = createClient(
      world({
        auditRows: [{ exists: 1 }],
        listing: { store_status: 'listed', listed_at: '2026-09-01T00:00:00.000Z' },
      }),
    );
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing(baseInput);

    expect(result.status).toBe('idempotent');
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO store_listings'))).toBe(
      false,
    );
  });

  it('rejects a stale write when the observed store status no longer matches', async () => {
    const client = createClient(world({ listing: { store_status: 'listed', listed_at: null } }));
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing({ ...baseInput, expectedStoreStatus: 'absent' });

    expect(result).toEqual({ status: 'stale', currentStoreStatus: 'listed' });
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO store_listings'))).toBe(
      false,
    );
  });

  it('accepts a write whose expected status matches the stored one', async () => {
    const client = createClient(world({ listing: { store_status: 'listed', listed_at: null } }));
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing({ ...baseInput, expectedStoreStatus: 'listed' });

    expect(result.status).toBe('applied');
  });

  it('refuses a reviewer: listing a pack needs the publisher role', async () => {
    const client = createClient(world({ role: 'content_reviewer' }));
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing(baseInput);

    expect(result).toEqual({ status: 'forbidden' });
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO store_listings'))).toBe(
      false,
    );
  });

  it('refuses a listing for a pack that does not exist', async () => {
    const client = createClient(world({ packMissing: true }));
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing(baseInput);

    expect(result).toEqual({ status: 'not_found' });
  });

  it('refuses a non-uuid idempotency key before opening a transaction', async () => {
    const client = createClient(world());
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.upsertStoreListing({ ...baseInput, idempotencyKey: 'not-a-uuid' });

    expect(result).toEqual({ status: 'forbidden' });
    expect(client.calls).toEqual([]);
  });

  it('lists canonical packs with their listing, reporting pack price/category read-only', async () => {
    const client = createClient(
      world({
        listing: { store_status: 'listed', featured: true, display_order: 2, listed_at: null },
      }),
    );
    const store = new PostgresStoreListingsStore(poolFor(client));

    const result = await store.listStoreListings({ actorUserId });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows[0]?.packId).toBe(packId);
    expect(result.rows[0]?.category).toBe('essentials');
    expect(result.rows[0]?.isFree).toBe(true);
    expect(result.rows[0]?.listing?.storeStatus).toBe('listed');
    // The pack is the driving table: the Store keeps no catalogue of its own.
    const select = client.calls.find((call) => call.sql.includes('FROM packs p'));
    expect(select?.sql).toContain('LEFT JOIN store_listings');
  });

  it('refuses to read the commercial catalogue without an editorial role', async () => {
    const client = createClient(world({ role: 'nobody' }));
    const store = new PostgresStoreListingsStore(poolFor(client));

    expect(await store.listStoreListings({ actorUserId })).toEqual({ status: 'forbidden' });
  });

  it('rolls back and rethrows when the database fails mid-transaction', async () => {
    const client = createClient((sql, params) => {
      if (sql.includes('INSERT INTO store_listings')) throw new Error('db down');
      return world()(sql, params);
    });
    const store = new PostgresStoreListingsStore(poolFor(client));

    await expect(store.upsertStoreListing(baseInput)).rejects.toThrow('db down');
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
  });
});
