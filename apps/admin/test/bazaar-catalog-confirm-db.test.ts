import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  bazaarProductIdForPack,
  PostgresBazaarCatalogExportStore,
} from '../lib/server/postgres-bazaar-catalog-export-store';

/**
 * Bazaar catalog confirm against a REAL Postgres with every migration applied: proves the
 * lowercase Bazaar product ids pass the provider-specific SKU check (0057) while Myket keeps its
 * format, and that only sellable packs are mapped. Requires TEST_DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `bzc_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const publisher = randomUUID();
const reviewer = randomUUID();

let owner: PgPool;
let pool: PgPool;

beforeAll(async () => {
  if (!url) return;
  const { Pool } = await import('pg');
  owner = new Pool({ connectionString: url, max: 1 });
  owner.on('error', () => undefined);
  await owner.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);
  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await pool.query(
    `INSERT INTO users (id, phone_e164) VALUES ($1, '+989****6101'), ($2, '+989****6102')`,
    [publisher, reviewer],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_publisher'), ($2, 'content_reviewer')`,
    [publisher, reviewer],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, price_tomans) VALUES
       ('bz-paid', 'پولی', 1, 'published', false, 25000),
       ('bz-unlisted', 'فهرست‌نشده', 1, 'published', false, 30000),
       ('bz-free', 'رایگان', 1, 'published', true, NULL)`,
  );
  await pool.query(
    `INSERT INTO store_listings (pack_id, store_status, listed_at) VALUES
       ('bz-paid', 'listed', now()), ('bz-free', 'listed', now())`,
  );
});

afterAll(async () => {
  await pool?.end();
  await owner?.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await owner?.end();
});

suite('Bazaar catalog confirm (real Postgres)', () => {
  it('a reviewer cannot write mappings', async () => {
    const store = new PostgresBazaarCatalogExportStore(pool as never);
    await expect(
      store.confirmCatalog({ actorUserId: reviewer, idempotencyKey: randomUUID() }),
    ).resolves.toEqual({ status: 'forbidden' });
  });

  it('maps only sellable packs with the Bazaar product id and price, idempotently', async () => {
    const store = new PostgresBazaarCatalogExportStore(pool as never);
    const key = randomUUID();
    await expect(
      store.confirmCatalog({ actorUserId: publisher, idempotencyKey: key }),
    ).resolves.toEqual({
      status: 'confirmed',
      count: 1,
    });
    await expect(
      store.confirmCatalog({ actorUserId: publisher, idempotencyKey: key }),
    ).resolves.toEqual({
      status: 'confirmed',
      count: 1,
    });
    const rows = await pool.query(
      `SELECT provider::text, pack_id, sku_id, synced_price_tomans FROM store_iab_catalog_items`,
    );
    expect(rows.rows).toEqual([
      {
        provider: 'cafe_bazaar',
        pack_id: 'bz-paid',
        sku_id: bazaarProductIdForPack('bz-paid'),
        synced_price_tomans: 25000,
      },
    ]);
    const audits = await pool.query(
      `SELECT 1 FROM audit_logs WHERE action = 'store_iab_catalog.bazaar_confirm'`,
    );
    expect(audits.rows).toHaveLength(1);
  });

  it('keeps the Myket SKU format strict', async () => {
    await expect(
      pool.query(
        `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
         VALUES ('myket', 'bz-paid', 'learnbox.lower.case', 25000)`,
      ),
    ).rejects.toThrow(/store_iab_catalog_items_sku_format/);
  });
});
