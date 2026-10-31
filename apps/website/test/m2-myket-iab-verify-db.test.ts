import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import { readPurchasableIabSku, verifyStoreIabPurchase } from '../lib/store-iab-purchase';
import type { StoreIabVerifier } from '../lib/myket-iab';

/**
 * Myket IAB verify-and-grant — real Postgres (M2-Myket backend).
 *
 * The one thing this path must get right: a store receipt grants the entitlement EXACTLY once,
 * even if the client retries the same purchaseToken. The receipt check itself is a deterministic
 * fixture (never the real Myket API, which has no sandbox and would be a live external call).
 *
 * Requires TEST_DATABASE_URL (see m2.4-paid-acquisition-db.test.ts for the local docker command).
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
const dbName = `myket_iab_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;

const migrationsDir = join(__dirname, '../../../database/migrations');

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const packId = 'myket-test-pack';
const sku = 'TEST_SKU_1';
const packPrice = 25000;

function fixtureVerifier(outcome: Awaited<ReturnType<StoreIabVerifier>> = { status: 'paid' }): {
  verify: StoreIabVerifier;
  calls: Array<{ sku: string; purchaseToken: string }>;
} {
  const calls: Array<{ sku: string; purchaseToken: string }> = [];
  return {
    calls,
    verify: async (input) => {
      calls.push(input);
      return outcome;
    },
  };
}

suite('Myket IAB purchase verify-and-grant (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    guardForcedTeardown(admin);
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 6 });
    guardForcedTeardown(pool);
    for (const file of readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1,'+491****0003','alice'),($2,'+491****0004','bob')`,
      [alice, bob],
    );
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, category, is_free, price_tomans, status)
       VALUES ($1,'Myket Test Pack',1,'essentials',false,$2,'published')`,
      [packId, packPrice],
    );
    await pool.query(
      `INSERT INTO store_listings (pack_id, store_status, listed_at) VALUES ($1, 'listed', now())`,
      [packId],
    );
    await pool.query(
      `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
       VALUES ('myket', $1, $2, $3)`,
      [packId, sku, packPrice],
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('resolves only the database-approved Myket SKU for a purchasable pack', async () => {
    await expect(readPurchasableIabSku(pool, alice, 'myket', packId)).resolves.toEqual({
      ok: true,
      sku,
    });
  });

  it('verifies a paid receipt once and grants the entitlement', async () => {
    const { verify, calls } = fixtureVerifier({ status: 'paid' });
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: verify },
      { userId: alice, provider: 'myket', sku, purchaseToken: 'token-abc-1' },
    );
    expect(outcome).toEqual({
      status: 'verified',
      purchaseId: expect.any(String),
      packId,
      alreadyEntitled: false,
    });
    expect(calls).toEqual([{ sku, purchaseToken: 'token-abc-1' }]);

    const entitlement = await pool.query(
      `SELECT 1 FROM user_packs WHERE user_id = $1 AND pack_id = $2`,
      [alice, packId],
    );
    expect(entitlement.rows).toHaveLength(1);

    const order = await pool.query<{ channel: string; status: string }>(
      `SELECT channel, status FROM purchase_orders WHERE user_id = $1 AND pack_id = $2`,
      [alice, packId],
    );
    expect(order.rows[0]).toEqual({ channel: 'android_myket', status: 'fulfilled' });
  });

  it('replaying the same purchaseToken does not grant twice', async () => {
    const { verify } = fixtureVerifier({ status: 'paid' });
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: verify },
      { userId: alice, provider: 'myket', sku, purchaseToken: 'token-abc-1' },
    );
    expect(outcome.status).toBe('already_processed');

    const entitlement = await pool.query(
      `SELECT count(*)::int AS n FROM user_packs WHERE user_id = $1 AND pack_id = $2`,
      [alice, packId],
    );
    expect(entitlement.rows[0].n).toBe(1);
  });

  it('rejects a receipt the store says is not paid, grants nothing', async () => {
    const { verify } = fixtureVerifier({ status: 'not_paid' });
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: verify },
      { userId: bob, provider: 'myket', sku, purchaseToken: 'token-unpaid' },
    );
    expect(outcome.status).toBe('not_paid');

    const event = await pool.query(
      `SELECT 1 FROM purchase_events WHERE provider_purchase_id = 'token-unpaid'`,
    );
    expect(event.rows).toHaveLength(0);
  });

  it('an unmapped sku is denied without calling the store', async () => {
    const { verify, calls } = fixtureVerifier({ status: 'paid' });
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: verify },
      { userId: alice, provider: 'myket', sku: 'UNMAPPED_SKU', purchaseToken: 'token-x' },
    );
    expect(outcome.status).toBe('unknown_sku');
    expect(calls).toHaveLength(0);
  });

  it('Cafe Bazaar: same token as Myket is a separate receipt, recorded on the android_bazaar channel', async () => {
    await pool.query(
      `INSERT INTO store_iab_catalog_items (provider, pack_id, sku_id, synced_price_tomans)
       VALUES ('cafe_bazaar', $1, 'learnbox.myket.test.pack.0123456789abcdef', $2)`,
      [packId, packPrice],
    );
    await expect(readPurchasableIabSku(pool, bob, 'cafe_bazaar', packId)).resolves.toEqual({
      ok: true,
      sku: 'learnbox.myket.test.pack.0123456789abcdef',
    });
    const { verify } = fixtureVerifier({ status: 'paid' });
    // Token uniqueness is scoped by provider: a Myket token value must not block a Bazaar receipt.
    const outcome = await verifyStoreIabPurchase(
      { pool, verifier: verify },
      { userId: bob, provider: 'cafe_bazaar', sku: 'learnbox.myket.test.pack.0123456789abcdef', purchaseToken: 'token-abc-1' },
    );
    expect(outcome).toMatchObject({ status: 'verified', packId, alreadyEntitled: false });
    const order = await pool.query<{ channel: string; provider: string }>(
      `SELECT o.channel, e.provider::text FROM purchase_orders o JOIN purchase_events e ON e.order_id = o.id
        WHERE o.user_id = $1 AND o.pack_id = $2`,
      [bob, packId],
    );
    expect(order.rows).toEqual([{ channel: 'android_bazaar', provider: 'cafe_bazaar' }]);
  });
});
