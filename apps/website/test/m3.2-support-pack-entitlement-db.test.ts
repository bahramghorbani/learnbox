import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAdminUsersStore } from '../../admin/lib/server/postgres-admin-users-store';
import { canLearnerAccessPack, readAccessiblePackIds } from '../lib/pack-access';

/**
 * Phase 3 / Milestone 3.2 — manual pack grant and revoke against a REAL Postgres with every repo
 * migration applied.
 *
 * Like M3.1 this is a cross-app claim and is therefore tested as one: the REAL Admin support store
 * performs the grant, and the REAL canonical learner access rule (`apps/website/lib/pack-access.ts`,
 * M2.2) is asked whether the learner may now read the pack. Mocking either side would let the two
 * agree with each other while production disagreed — which is exactly the failure a support tool
 * must never have, because an operator would promise a learner access that does not exist.
 *
 * What it is built to catch:
 *   - a grant the learner runtime never honours (Admin-only entitlement)
 *   - a grant that fabricates or mutates payment evidence
 *   - a support grant indistinguishable from a real purchase or a free self-activation
 *   - a revoke that destroys access someone paid for
 *   - a revoke that claims to remove access a free pack grants anyway
 *   - a replayed request granting or revoking twice
 *   - one learner's entitlement change touching another
 *   - the Admin view disagreeing with the canonical access rule
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m32_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

let pool: PgPool;
let admin: PgPool;
let store: PostgresAdminUsersStore;

const operator = randomUUID();
const unprivileged = randomUUID();
let learner = '';
let bystander = '';
let suspended = '';
let purchaseId = '';

/** A paid pack (grantable), a free pack (not grantable), an unpublished paid pack, a purchased one. */
const paidPack = 'm32-paid-pack';
const freePack = 'm32-free-pack';
const draftPack = 'm32-draft-pack';
const boughtPack = 'm32-bought-pack';

function key() {
  return randomUUID();
}

async function entitlementRows(userId: string) {
  const result = await pool.query<{
    pack_id: string;
    acquisition_type: string;
    purchase_event_id: string | null;
  }>(
    `SELECT pack_id, acquisition_type, purchase_event_id
       FROM user_packs WHERE user_id = $1 ORDER BY pack_id`,
    [userId],
  );
  return result.rows;
}

/** Every payment fact that must be identical before and after any support action. */
async function paymentSnapshot() {
  const result = await pool.query(
    `SELECT id, user_id, provider, environment, provider_purchase_id, pack_id, amount_tomans,
            status::text AS status, verified_at
       FROM purchase_events ORDER BY id`,
  );
  return result.rows;
}

async function auditRows(userId: string) {
  const result = await pool.query<{
    actor_user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT actor_user_id, action, entity_type, entity_id, metadata
       FROM audit_logs
      WHERE entity_type = 'user_pack_entitlement' AND entity_id = $1::uuid
      ORDER BY created_at, action`,
    [userId],
  );
  return result.rows;
}

async function viewFor(userId: string, packId: string) {
  const result = await store.readPackEntitlements({ actorUserId: operator, userId });
  if (result.status !== 'ok') throw new Error(`view unavailable: ${result.status}`);
  const row = result.rows.find((candidate) => candidate.packId === packId);
  if (!row) throw new Error(`pack missing from view: ${packId}`);
  return row;
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);

  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  learner = randomUUID();
  bystander = randomUUID();
  suspended = randomUUID();
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name, status)
     VALUES ($1, '+989****1001', 'سارا', 'active'),
            ($2, '+989****1002', 'نیما', 'active'),
            ($3, '+989****1003', 'حسن', 'disabled')`,
    [learner, bystander, suspended],
  );
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+989****1004', 'اپراتور'), ($2, '+989****1005', 'بی‌نقش')`,
    [operator, unprivileged],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super_admin')`,
    [operator],
  );

  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, is_free, price_tomans, status)
     VALUES ($1, 'بستهٔ پولی', 10, false, 250000, 'published'),
            ($2, 'بستهٔ رایگان', 10, true,  NULL,   'published'),
            ($3, 'بستهٔ پیش‌نویس', 10, false, 90000, 'draft'),
            ($4, 'بستهٔ خریداری‌شده', 10, false, 180000, 'published')`,
    [paidPack, freePack, draftPack, boughtPack],
  );

  // A REAL verified Zarinpal-shaped payment (M2.4) and the entitlement it granted. This is the
  // financial evidence every assertion below must leave untouched.
  const purchase = await pool.query<{ id: string }>(
    `INSERT INTO purchase_events
       (user_id, provider, environment, provider_purchase_id, pack_id, amount_tomans, status, verified_at)
     VALUES ($1, 'zarinpal', 'sandbox', $2, $3, 180000, 'verified', now())
     RETURNING id`,
    [learner, `A${randomUUID().replace(/-/g, '')}`, boughtPack],
  );
  purchaseId = purchase.rows[0].id;
  await pool.query(
    `INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
     VALUES ($1, $2, 'purchased', $3)`,
    [learner, boughtPack, purchaseId],
  );
  // The learner's own free self-activation (M2.3).
  await pool.query(
    `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1, $2, 'free')`,
    [learner, freePack],
  );

  store = new PostgresAdminUsersStore(pool as never);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  }
});

suite('M3.2 manual pack entitlements against real Postgres', () => {
  it('migration 0029 admits support provenance and refuses a fabricated payment link', async () => {
    const allowed = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'user_packs'::regclass AND conname = 'user_packs_acquisition_type_check'`,
    );
    expect(allowed.rows[0]?.def).toContain("'support'");

    // The invented value is still refused: widening the vocabulary is not opening it.
    await expect(
      pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1, $2, 'gift')`,
        [bystander, paidPack],
      ),
    ).rejects.toThrow();

    // A support grant may never point at a transaction — that is the falsified-payment shape.
    await expect(
      pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
         VALUES ($1, $2, 'support', $3)`,
        [bystander, paidPack, purchaseId],
      ),
    ).rejects.toThrow();
  });

  it('shows the truth about every pack: free access, purchase, and nothing owned', async () => {
    const free = await viewFor(learner, freePack);
    expect(free.hasAccess).toBe(true);
    // Access comes from the pack being free, NOT from the row the learner happens to hold.
    expect(free.accessVia).toBe('free_pack');
    expect(free.acquisition).toBe('free');
    expect(free.grant).toBe('already_owned');
    expect(free.revoke).toBe('free_acquisition');

    const bought = await viewFor(learner, boughtPack);
    expect(bought.acquisition).toBe('purchased');
    expect(bought.accessVia).toBe('entitlement');
    expect(bought.purchase).toMatchObject({ status: 'verified', amountTomans: 180000 });
    expect(bought.revoke).toBe('purchased');

    const paid = await viewFor(learner, paidPack);
    expect(paid).toMatchObject({
      acquisition: null,
      purchase: null,
      hasAccess: false,
      accessVia: null,
      grant: 'allowed',
      revoke: 'not_entitled',
    });

    // A paid pack nobody owns must never be readable, and the view must not imply otherwise.
    expect(await canLearnerAccessPack(pool, paidPack, learner)).toBe(false);
  });

  it('grants a paid pack and the canonical learner rule honours it immediately', async () => {
    const payments = await paymentSnapshot();
    const before = await viewFor(learner, paidPack);
    expect(before.hasAccess).toBe(false);

    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: learner,
      packId: paidPack,
      action: 'grant',
      reason: 'جبران اختلال پرداخت — تیکت ۱۲۳۴',
      idempotencyKey: key(),
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('grant did not apply');
    expect(result.row).toMatchObject({
      acquisition: 'support',
      hasAccess: true,
      accessVia: 'entitlement',
      revoke: 'allowed',
    });

    // The canonical rule, not the Admin view, is the thing that must now say yes.
    expect(await canLearnerAccessPack(pool, paidPack, learner)).toBe(true);
    expect(await readAccessiblePackIds(pool, learner)).toContain(paidPack);

    // Provenance is recorded as support, with no payment attached.
    const rows = await entitlementRows(learner);
    const granted = rows.find((row) => row.pack_id === paidPack);
    expect(granted).toMatchObject({ acquisition_type: 'support', purchase_event_id: null });

    // No payment was invented and none was altered.
    expect(await paymentSnapshot()).toEqual(payments);

    const audit = await auditRows(learner);
    expect(audit.at(-1)).toMatchObject({
      actor_user_id: operator,
      action: 'user_pack.grant',
      entity_type: 'user_pack_entitlement',
      entity_id: learner,
    });
    expect(audit.at(-1)?.metadata).toMatchObject({
      reason: 'جبران اختلال پرداخت — تیکت ۱۲۳۴',
      pack_id: paidPack,
      previous_acquisition: null,
      previous_access: false,
      new_acquisition: 'support',
      new_access: true,
      pack_is_free: false,
      pack_published: true,
    });
  });

  it('leaves other learners untouched by that grant', async () => {
    expect(await entitlementRows(bystander)).toEqual([]);
    expect(await canLearnerAccessPack(pool, paidPack, bystander)).toBe(false);
    expect(await auditRows(bystander)).toEqual([]);
  });

  it('treats a replayed grant as the same action and a fresh duplicate as already owned', async () => {
    const replayKey = key();
    const first = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'grant',
      reason: 'آزمون تکرار درخواست',
      idempotencyKey: replayKey,
    });
    expect(first.status).toBe('applied');

    const replay = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'grant',
      reason: 'آزمون تکرار درخواست',
      idempotencyKey: replayKey,
    });
    expect(replay.status).toBe('idempotent');

    const again = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'grant',
      reason: 'درخواست جدید برای همان بسته',
      idempotencyKey: key(),
    });
    expect(again).toMatchObject({ status: 'refused', verdict: 'already_owned' });

    // Exactly one entitlement row, and exactly one audit entry, for the whole sequence.
    expect(await entitlementRows(bystander)).toHaveLength(1);
    expect(await auditRows(bystander)).toHaveLength(1);
  });

  it('refuses to grant what a free pack already gives everyone', async () => {
    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: suspended,
      packId: freePack,
      action: 'grant',
      reason: 'تلاش برای اعطای بستهٔ رایگان',
      idempotencyKey: key(),
    });
    expect(result).toMatchObject({ status: 'refused', verdict: 'free_pack' });
    expect(await entitlementRows(suspended)).toEqual([]);
    expect(await auditRows(suspended)).toEqual([]);
  });

  it('refuses to grant to a suspended account (M3.1 remains authoritative)', async () => {
    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: suspended,
      packId: paidPack,
      action: 'grant',
      reason: 'تلاش برای اعطا به حساب غیرفعال',
      idempotencyKey: key(),
    });
    expect(result).toMatchObject({ status: 'refused', verdict: 'disabled_account' });
    expect(await entitlementRows(suspended)).toEqual([]);
  });

  it('grants an unpublished pack as a real entitlement that still grants no access', async () => {
    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: draftPack,
      action: 'grant',
      reason: 'آماده‌سازی دسترسی پیش از انتشار',
      idempotencyKey: key(),
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('grant did not apply');
    expect(result.row).toMatchObject({
      acquisition: 'support',
      published: false,
      hasAccess: false,
    });
    // Publication is still the other half of the canonical rule.
    expect(await canLearnerAccessPack(pool, draftPack, bystander)).toBe(false);
  });

  it('revokes a support-issued entitlement and the learner loses access immediately', async () => {
    const payments = await paymentSnapshot();
    expect(await canLearnerAccessPack(pool, paidPack, learner)).toBe(true);

    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: learner,
      packId: paidPack,
      action: 'revoke',
      reason: 'اعطای اشتباه — بازگردانی دسترسی',
      idempotencyKey: key(),
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('revoke did not apply');
    expect(result.row).toMatchObject({ acquisition: null, hasAccess: false, accessVia: null });

    expect(await canLearnerAccessPack(pool, paidPack, learner)).toBe(false);
    expect(await readAccessiblePackIds(pool, learner)).not.toContain(paidPack);
    expect(await paymentSnapshot()).toEqual(payments);

    const audit = await auditRows(learner);
    expect(audit.at(-1)).toMatchObject({ action: 'user_pack.revoke' });
    expect(audit.at(-1)?.metadata).toMatchObject({
      reason: 'اعطای اشتباه — بازگردانی دسترسی',
      pack_id: paidPack,
      previous_acquisition: 'support',
      previous_access: true,
      new_acquisition: null,
      new_access: false,
    });
  });

  it('is safe to replay or repeat a revoke', async () => {
    const replayKey = key();
    const applied = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'revoke',
      reason: 'آزمون تکرار لغو',
      idempotencyKey: replayKey,
    });
    expect(applied.status).toBe('applied');

    const replay = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'revoke',
      reason: 'آزمون تکرار لغو',
      idempotencyKey: replayKey,
    });
    expect(replay.status).toBe('idempotent');

    const again = await store.setPackEntitlement({
      actorUserId: operator,
      userId: bystander,
      packId: paidPack,
      action: 'revoke',
      reason: 'لغو دوباره با درخواست جدید',
      idempotencyKey: key(),
    });
    expect(again).toMatchObject({ status: 'refused', verdict: 'not_entitled' });
  });

  it('refuses to revoke a verified purchase and leaves the payment evidence intact', async () => {
    const payments = await paymentSnapshot();
    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: learner,
      packId: boughtPack,
      action: 'revoke',
      reason: 'درخواست لغو دسترسی خریداری‌شده',
      idempotencyKey: key(),
    });
    expect(result).toMatchObject({ status: 'refused', verdict: 'purchased' });

    // Access, entitlement and transaction all survive untouched.
    expect(await canLearnerAccessPack(pool, boughtPack, learner)).toBe(true);
    const rows = await entitlementRows(learner);
    expect(rows.find((row) => row.pack_id === boughtPack)).toMatchObject({
      acquisition_type: 'purchased',
      purchase_event_id: purchaseId,
    });
    expect(await paymentSnapshot()).toEqual(payments);
    expect(await auditRows(learner)).not.toContainEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ pack_id: boughtPack }) }),
    );
  });

  it('refuses to pretend a free pack can be revoked', async () => {
    const result = await store.setPackEntitlement({
      actorUserId: operator,
      userId: learner,
      packId: freePack,
      action: 'revoke',
      reason: 'درخواست لغو دسترسی رایگان',
      idempotencyKey: key(),
    });
    expect(result).toMatchObject({ status: 'refused', verdict: 'free_acquisition' });
    // The canonical free rule still grants access, which is exactly why revoke refused.
    expect(await canLearnerAccessPack(pool, freePack, learner)).toBe(true);
    expect((await entitlementRows(learner)).find((row) => row.pack_id === freePack)).toMatchObject({
      acquisition_type: 'free',
    });
  });

  it('denies an unprivileged Admin user and an unknown learner or pack', async () => {
    const forbidden = await store.setPackEntitlement({
      actorUserId: unprivileged,
      userId: learner,
      packId: paidPack,
      action: 'grant',
      reason: 'تلاش بدون نقش عملیاتی',
      idempotencyKey: key(),
    });
    expect(forbidden.status).toBe('forbidden');
    expect(
      (await store.readPackEntitlements({ actorUserId: unprivileged, userId: learner })).status,
    ).toBe('forbidden');

    const unknownUser = await store.setPackEntitlement({
      actorUserId: operator,
      userId: randomUUID(),
      packId: paidPack,
      action: 'grant',
      reason: 'کاربر ناشناس',
      idempotencyKey: key(),
    });
    expect(unknownUser.status).toBe('not_found');

    const unknownPack = await store.setPackEntitlement({
      actorUserId: operator,
      userId: learner,
      packId: 'no-such-pack',
      action: 'grant',
      reason: 'بستهٔ ناشناس',
      idempotencyKey: key(),
    });
    expect(unknownPack.status).toBe('not_found');
  });

  it('keeps concurrent identical grants to one entitlement and one audit entry', async () => {
    const racer = randomUUID();
    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+989****1006', 'رقیب')`,
      [racer],
    );

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        store.setPackEntitlement({
          actorUserId: operator,
          userId: racer,
          packId: paidPack,
          action: 'grant',
          reason: 'درخواست همزمان',
          idempotencyKey: key(),
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'applied')).toHaveLength(1);
    expect(await entitlementRows(racer)).toHaveLength(1);
    expect(await auditRows(racer)).toHaveLength(1);
    expect(await canLearnerAccessPack(pool, paidPack, racer)).toBe(true);
  });

  it('agrees with the canonical access rule on every pack it reports', async () => {
    // The Admin view re-expresses M2.2 over columns it already read. If the two ever diverge, this
    // fails — which is the point: support must not be shown an access answer the runtime rejects.
    for (const userId of [learner, bystander, suspended]) {
      const view = await store.readPackEntitlements({ actorUserId: operator, userId });
      if (view.status !== 'ok') throw new Error('view unavailable');
      for (const row of view.rows) {
        expect([row.packId, row.hasAccess]).toEqual([
          row.packId,
          await canLearnerAccessPack(pool, row.packId, userId),
        ]);
      }
    }
  });
});
