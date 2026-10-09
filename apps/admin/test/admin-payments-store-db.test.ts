import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAdminPaymentsStore } from '../lib/server/postgres-admin-payments-store.js';

/**
 * Store transactions / payment configuration against a REAL Postgres with every repo migration
 * applied.
 *
 * Why this suite exists: the role lookup in `PostgresAdminPaymentsStore` queried a table that does
 * not exist in the canonical schema (`admin_user_roles`; the real table is
 * `admin_role_assignments`). Every unit test used a fake client that answered any SQL, so the
 * defect was invisible until Production returned `42P01` for an authenticated super_admin. Only a
 * suite that runs the real SQL against the real schema can catch that class of bug, so the asserts
 * below are deliberately about authorization *outcomes* rather than SQL text.
 *
 * Read-only by construction: the store has no write path, and the suite asserts the purchase ledger
 * is byte-identical before and after. Requires TEST_DATABASE_URL (it creates and drops its own
 * database).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `pay_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

const superAdmin = randomUUID();
const reviewer = randomUUID();
const outsider = randomUUID();
const learner = randomUUID();
const packId = 'pay-db-pack';

let owner: PgPool;
let pool: PgPool;
let store: PostgresAdminPaymentsStore;
let purchaseId = '';

async function ledgerFingerprint() {
  const result = await pool.query(
    `SELECT count(*)::int AS n, coalesce(max(updated_at)::text, '-') AS touched,
            coalesce(string_agg(status::text, ',' ORDER BY id::text), '-') AS statuses
       FROM purchase_events`,
  );
  return result.rows[0];
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  owner = new Pool({ connectionString: url, max: 1 });
  owner.on('error', () => undefined);
  await owner.query(`CREATE DATABASE ${dbName}`);

  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);

  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  await pool.query(
    `INSERT INTO users (id, phone_e164) VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
    [
      superAdmin,
      '+989****5101',
      reviewer,
      '+989****5102',
      outsider,
      '+989****5103',
      learner,
      '+989****5104',
    ],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role)
     VALUES ($1, 'super_admin'), ($2, 'content_reviewer')`,
    [superAdmin, reviewer],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free, price_tomans)
     VALUES ($1, 'بستهٔ آزمون تراکنش', 1, 'published', false, 50000)`,
    [packId],
  );
  const created = await pool.query<{ id: string }>(
    `INSERT INTO purchase_events
       (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans)
     VALUES ($1, 'zarinpal', 'production', $2, 'verified', $3, 50000)
     RETURNING id`,
    [learner, `auth-${randomBytes(4).toString('hex')}`, packId],
  );
  purchaseId = created.rows[0].id;
  await pool.query(`UPDATE purchase_events SET verified_at = now() WHERE id = $1`, [purchaseId]);

  store = new PostgresAdminPaymentsStore(pool as never);
});

afterAll(async () => {
  await pool?.end();
  await owner?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await owner?.end();
});

suite('Store transactions — authorization against the canonical schema', () => {
  it('lists the real purchase ledger for a super_admin', async () => {
    const result = await store.listTransactions({ actorUserId: superAdmin });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      transactionId: purchaseId,
      packId,
      packDisplayName: 'بستهٔ آزمون تراکنش',
      status: 'verified',
      provider: 'zarinpal',
      environment: 'production',
      amountTomans: 50000,
    });
  });

  it('reports gateway status for a super_admin while payments stay disabled', async () => {
    const result = await store.readConfigurationStatus({
      actorUserId: superAdmin,
      environment: { ZARINPAL_SANDBOX: 'false' },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // The flag is absent, so the paid flow reports disabled even though a verified row exists.
    expect(result.configuration).toMatchObject({
      state: 'disabled',
      enabled: false,
      environment: null,
      verifiedCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
  });

  it('serves a content_reviewer and refuses an actor with no admin role', async () => {
    expect((await store.listTransactions({ actorUserId: reviewer })).status).toBe('ok');
    expect((await store.listTransactions({ actorUserId: outsider })).status).toBe('forbidden');
    expect(
      (await store.readConfigurationStatus({ actorUserId: outsider, environment: {} })).status,
    ).toBe('forbidden');
    // A revoked role is a refusal, not an error.
    await pool.query(`DELETE FROM admin_role_assignments WHERE user_id = $1`, [reviewer]);
    expect((await store.listTransactions({ actorUserId: reviewer })).status).toBe('forbidden');
  });

  it('narrows by pack and status without touching the ledger', async () => {
    const before = await ledgerFingerprint();
    expect(
      (await store.listTransactions({ actorUserId: superAdmin, packId: 'other-pack' })).status,
    ).toBe('ok');
    const byStatus = await store.listTransactions({ actorUserId: superAdmin, status: 'pending' });
    expect(byStatus.status).toBe('ok');
    if (byStatus.status === 'ok') expect(byStatus.rows).toHaveLength(0);
    expect(await ledgerFingerprint()).toEqual(before);
  });
});
