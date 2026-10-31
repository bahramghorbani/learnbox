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
 * The only write is a re-check REQUEST (append-only order event); the suite asserts the purchase
 * ledger itself stays byte-identical. Requires TEST_DATABASE_URL (it creates and drops its own
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
  const order = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (user_id, pack_id, environment, amount_tomans, pack_display_name, status)
     VALUES ($1, $2, 'production', 50000, 'بستهٔ آزمون تراکنش', 'fulfilled')
     RETURNING id`,
    [learner, packId],
  );
  const created = await pool.query<{ id: string }>(
    `INSERT INTO purchase_events
       (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans, order_id)
     VALUES ($1, 'zarinpal', 'production', $2, 'verified', $3, 50000, $4)
     RETURNING id`,
    [learner, `auth-${randomBytes(4).toString('hex')}`, packId, order.rows[0].id],
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
      channel: 'web_zarinpal',
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

  it('finds an attempt by Authority, RefID, order code, attempt id and learner id', async () => {
    const order = await pool.query<{ id: string; public_code: string }>(
      `INSERT INTO purchase_orders (user_id, pack_id, environment, amount_tomans, pack_display_name, status)
       VALUES ($1, $2, 'sandbox', 50000, 'بستهٔ آزمون', 'open') RETURNING id, public_code`,
      [learner, packId],
    );
    const authority = `S${'0'.repeat(28)}${randomBytes(3).toString('hex')}x`;
    const attempt = await pool.query<{ id: string }>(
      `INSERT INTO purchase_events
         (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans,
          order_id, provider_amount, provider_currency, provider_reference, review_reason)
       VALUES ($1, 'zarinpal', 'sandbox', $2, 'pending', $3, 50000, $4, 500000, 'IRR', 'ref-9911', NULL)
       RETURNING id`,
      [learner, authority, packId, order.rows[0].id],
    );
    const attemptId = attempt.rows[0].id;
    for (const q of [authority, 'ref-9911', order.rows[0].public_code.toLowerCase(), attemptId]) {
      const found = await store.listTransactions({ actorUserId: superAdmin, query: q });
      expect(found.status === 'ok' && found.rows.map((r) => r.transactionId)).toEqual([attemptId]);
    }
    const byLearner = await store.listTransactions({ actorUserId: superAdmin, query: learner });
    expect(byLearner.status === 'ok' && byLearner.rows.length).toBe(2);
    const row = await store.listTransactions({ actorUserId: superAdmin, query: authority });
    expect(row.status === 'ok' && row.rows[0]).toMatchObject({
      orderCode: order.rows[0].public_code,
      orderStatus: 'open',
      providerAmount: '500000',
      providerCurrency: 'IRR',
      recheckPending: false,
      recheckRequestedAt: null,
      autoCheck: 'scheduled',
    });

    // Re-check request: super_admin only, idempotent while outstanding, ledger untouched.
    const before = await ledgerFingerprint();
    expect(await store.requestRecheck({ actorUserId: outsider, transactionId: attemptId })).toEqual(
      { status: 'forbidden' },
    );
    expect(
      await store.requestRecheck({ actorUserId: superAdmin, transactionId: attemptId }),
    ).toEqual({ status: 'requested' });
    expect(
      await store.requestRecheck({ actorUserId: superAdmin, transactionId: attemptId }),
    ).toEqual({ status: 'already_requested' });
    expect(
      await store.requestRecheck({ actorUserId: superAdmin, transactionId: purchaseId }),
    ).toEqual({ status: 'not_recheckable' });
    expect(await ledgerFingerprint()).toEqual(before);
    const pending = await store.listTransactions({ actorUserId: superAdmin, query: authority });
    expect(pending.status === 'ok' && pending.rows[0].recheckPending).toBe(true);
    expect(pending.status === 'ok' && typeof pending.rows[0].recheckRequestedAt).toBe('string');
    await pool.query(
      `UPDATE purchase_events SET review_reason='provider_rejected', last_provider_code=-50 WHERE id=$1`,
      [attemptId],
    );
    const stopped = await store.listTransactions({ actorUserId: superAdmin, query: authority });
    expect(stopped.status === 'ok' && stopped.rows[0].autoCheck).toBe('stopped_review');

    // Inconclusive until the check limit: still unsettled, no flagged answer, yet surfaced for review.
    await pool.query(
      `UPDATE purchase_events SET review_reason=NULL, last_provider_code=NULL, check_count=20,
              created_at=now() - interval '5 minutes' WHERE id=$1`,
      [attemptId],
    );
    const limited = await store.listTransactions({ actorUserId: superAdmin, needsReview: true });
    expect(
      limited.status === 'ok' && limited.rows.map((r) => [r.transactionId, r.autoCheck]),
    ).toEqual([[attemptId, 'stopped_limit']]);

    const timeline = await store.readOrderTimeline({
      actorUserId: superAdmin,
      transactionId: attemptId,
    });
    expect(timeline).toMatchObject({
      status: 'ok',
      events: [{ kind: 'recheck_requested', source: 'admin_recheck' }],
    });

    // Review filter: an extra valid payment is surfaced.
    await pool.query(
      `UPDATE purchase_events SET status='verified', review_reason='already_entitled' WHERE id=$1`,
      [attemptId],
    );
    const review = await store.listTransactions({ actorUserId: superAdmin, needsReview: true });
    expect(review.status === 'ok' && review.rows.map((r) => r.transactionId)).toEqual([attemptId]);
  });

  it('filters by provider/channel and groups verified sales without changing the ledger', async () => {
    const order = await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders
         (user_id, pack_id, environment, amount_tomans, pack_display_name, channel, status)
       VALUES ($1, $2, 'production', 75000, 'بستهٔ آزمون تراکنش', 'android_myket', 'fulfilled')
       RETURNING id`,
      [learner, packId],
    );
    await pool.query(
      `INSERT INTO purchase_events
         (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans, order_id, verified_at)
       VALUES ($1, 'myket', 'production', $2, 'verified', $3, 75000, $4, now())`,
      [learner, `myket-${randomBytes(4).toString('hex')}`, packId, order.rows[0].id],
    );
    const before = await ledgerFingerprint();

    const byProvider = await store.listTransactions({ actorUserId: superAdmin, provider: 'myket' });
    expect(byProvider.status === 'ok' && byProvider.rows).toHaveLength(1);
    expect(byProvider.status === 'ok' && byProvider.rows[0]).toMatchObject({
      provider: 'myket',
      channel: 'android_myket',
    });
    const byChannel = await store.listTransactions({
      actorUserId: superAdmin,
      channel: 'android_myket',
    });
    expect(byChannel.status === 'ok' && byChannel.rows.map((row) => row.provider)).toEqual([
      'myket',
    ]);

    const report = await store.getSalesReport({ actorUserId: superAdmin });
    expect(report).toMatchObject({
      status: 'ok',
      report: {
        byProvider: expect.arrayContaining([
          { provider: 'zarinpal', verifiedCount: 2, revenueTomans: 100000 },
          { provider: 'myket', verifiedCount: 1, revenueTomans: 75000 },
        ]),
        byChannel: expect.arrayContaining([
          { channel: 'web_zarinpal', verifiedCount: 2, revenueTomans: 100000 },
          { channel: 'android_myket', verifiedCount: 1, revenueTomans: 75000 },
        ]),
      },
    });
    expect(await ledgerFingerprint()).toEqual(before);
  });
});
