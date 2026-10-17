import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import { deleteAccount } from '../lib/account-deletion-store';
import {
  createPurchase,
  readLearnerPurchases,
  reconcilePurchases,
  refreshPurchaseForLearner,
  maxAutomaticChecks,
  verifyPurchase,
} from '../lib/store-purchase';
import type { ZarinpalProvider, ZarinpalVerifyOutcome } from '../lib/zarinpal';

/**
 * Commerce core v1 (docs/architecture/COMMERCE_CORE_CONTRACT.md, §8) against a REAL Postgres.
 *
 * The first three cases are the gaps reproduced on unchanged main before this change (gap 1: two
 * parallel checkouts both payable, the second payment silently absorbed; gap 2: nothing re-checks
 * an attempt without a callback; gap 3: account deletion dropped pack-purchase evidence) — now
 * asserting the fixed behaviour. The provider is a fixture; no gateway, no money.
 *
 * Requires TEST_DATABASE_URL (see m2.4-paid-acquisition-db.test.ts for the local recipe).
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `commerce_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;
let teardown: ReturnType<typeof guardForcedTeardown>;

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const carol = '44444444-4444-4444-8444-444444444444';
const pack = 'paid-published-listed';
const price = 150000;
const authorityOf = (n: number) => `A${String(n).padStart(35, '0')}`;

/** Fixture gateway: a fresh Authority per request; verification answer is scriptable. */
function gateway(
  verify?: (authority: string) => ZarinpalVerifyOutcome | Promise<ZarinpalVerifyOutcome>,
) {
  let n = 0;
  const requests: Parameters<ZarinpalProvider['requestPayment']>[0][] = [];
  const verifications: string[] = [];
  const provider: ZarinpalProvider = {
    async requestPayment(input) {
      requests.push(input);
      n += 1;
      // Yield so concurrent callers genuinely overlap inside the order lock.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { status: 'created', authority: authorityOf(n + Math.floor(Math.random() * 1e9)) };
    },
    async verifyPayment(input) {
      verifications.push(input.authority);
      return verify
        ? verify(input.authority)
        : {
            status: 'verified',
            referenceId: `ref-${input.authority.slice(-6)}`,
            alreadyVerified: false,
            code: 100,
          };
    },
    paymentUrl: (a) => `https://sandbox.zarinpal.com/pg/StartPay/${a}`,
  };
  return { provider, requests, verifications };
}

const deps = (provider: ZarinpalProvider) => ({
  pool,
  provider,
  callbackOrigin: 'https://app.learnbox.example',
  sandbox: true,
});

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params)).rows[0];
const entitlements = async (userId: string) =>
  Number(
    (await one<{ n: string }>(
      `SELECT count(*) AS n FROM user_packs WHERE user_id=$1 AND pack_id=$2`,
      [userId, pack],
    ))!.n,
  );
const authorityOfAttempt = async (id: string) =>
  (await one<{ a: string }>(`SELECT provider_purchase_id AS a FROM purchase_events WHERE id=$1`, [
    id,
  ]))!.a;
/** Ages an attempt (and its order) so time-based rules can be exercised without waiting. */
const age = (id: string, interval: string) =>
  pool.query(
    `WITH a AS (UPDATE purchase_events SET created_at = created_at - $2::interval WHERE id=$1 RETURNING order_id)
     UPDATE purchase_orders SET created_at = created_at - $2::interval WHERE id IN (SELECT order_id FROM a)`,
    [id, interval],
  );

suite('commerce core v1 (real Postgres, fixture gateway)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    guardForcedTeardown(admin);
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 8 });
    teardown = guardForcedTeardown(pool);
    const dir = join(__dirname, '../../../database/migrations');
    for (const f of readdirSync(dir)
      .filter((x) => /^\d{4}_.+\.sql$/.test(x))
      .sort()) {
      await pool.query(readFileSync(join(dir, f), 'utf8'));
    }
    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name)
       VALUES ($1,'+491****0001','alice'),($2,'+491****0002','bob'),($3,'+491****0004','carol')`,
      [alice, bob, carol],
    );
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, category, is_free, price_tomans, status)
       VALUES ($1,'Paid',1,'essentials',false,$2,'published')`,
      [pack, price],
    );
    await pool.query(
      `INSERT INTO store_listings (pack_id, store_status, listed_at) VALUES ($1,'listed',now())`,
      [pack],
    );
  });

  afterAll(async () => {
    teardown?.beginTeardown();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM user_packs`);
    await pool.query(`DELETE FROM purchase_order_events`);
    await pool.query(`DELETE FROM purchase_events`);
    await pool.query(`DELETE FROM purchase_orders`);
    await pool.query(`UPDATE packs SET status='published', price_tomans=$2 WHERE id=$1`, [
      pack,
      price,
    ]);
  });

  describe('gap 1 — concurrent and repeated checkout', () => {
    it('serialises parallel checkouts onto one order and one gateway session', async () => {
      const g = gateway();
      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () =>
          createPurchase(deps(g.provider), { userId: alice, packId: pack }),
        ),
      );
      expect(outcomes.every((o) => o.status === 'created')).toBe(true);
      const redirects = new Set(outcomes.map((o) => (o.status === 'created' ? o.redirectUrl : '')));
      expect(redirects.size).toBe(1);
      expect(g.requests).toHaveLength(1);
      expect(await one(`SELECT count(*)::int AS n FROM purchase_events`)).toEqual({ n: 1 });
      expect(
        await one(`SELECT count(*)::int AS n FROM purchase_orders WHERE status='open'`),
      ).toEqual({ n: 1 });
    });

    it('records an extra valid payment under its own id and flags it, without a second entitlement', async () => {
      const g = gateway();
      const first = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (first.status !== 'created') throw new Error('expected created');
      // The learner abandons the first gateway page; 25 minutes later a second attempt opens.
      await age(first.purchaseId, '25 minutes');
      const second = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (second.status !== 'created') throw new Error('expected created');
      expect(second.reused).toBe(false);
      expect(second.purchaseId).not.toBe(first.purchaseId);
      expect(second.orderCode).toBe(first.orderCode);

      // Both turn out to be paid (the first one late).
      const a = await verifyPurchase(
        { pool, provider: g.provider },
        { authority: await authorityOfAttempt(second.purchaseId), callbackStatus: 'OK' },
      );
      const b = await verifyPurchase(
        { pool, provider: g.provider },
        { authority: await authorityOfAttempt(first.purchaseId), callbackStatus: 'OK' },
      );
      expect(a).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(b).toMatchObject({
        status: 'verified',
        entitlementCreated: false,
        reviewReason: 'already_entitled',
      });

      expect(await entitlements(alice)).toBe(1);
      const rows = (
        await pool.query(
          `SELECT id, status::text, review_reason FROM purchase_events ORDER BY created_at`,
        )
      ).rows;
      expect(rows).toEqual([
        { id: first.purchaseId, status: 'verified', review_reason: 'already_entitled' },
        { id: second.purchaseId, status: 'verified', review_reason: null },
      ]);
      expect(await one(`SELECT status FROM purchase_orders`)).toEqual({ status: 'fulfilled' });
    });

    it('marks the order needs_review when the learner already held the pack before paying', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      // Support grants the pack while the learner is on the gateway page.
      await pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1,$2,'support')`,
        [alice, pack],
      );
      const outcome = await verifyPurchase(
        { pool, provider: g.provider },
        { authority: await authorityOfAttempt(created.purchaseId), callbackStatus: 'OK' },
      );
      expect(outcome).toMatchObject({ status: 'verified', reviewReason: 'already_entitled' });
      expect(await one(`SELECT status FROM purchase_orders`)).toEqual({ status: 'needs_review' });
      expect(
        await one(`SELECT acquisition_type FROM user_packs WHERE user_id=$1`, [alice]),
      ).toEqual({ acquisition_type: 'support' });
    });

    it('never lets an abandoned order block: a stale order expires and a fresh one opens', async () => {
      const g = gateway();
      const first = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (first.status !== 'created') throw new Error('expected created');
      await age(first.purchaseId, '25 hours');
      const second = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (second.status !== 'created') throw new Error('expected created');
      expect(second.orderCode).not.toBe(first.orderCode);
      expect(
        (await pool.query(`SELECT status FROM purchase_orders ORDER BY created_at`)).rows.map(
          (r) => r.status,
        ),
      ).toEqual(['expired', 'open']);
    });

    it('expires the open order when the price changed, so the learner pays the current price', async () => {
      const g = gateway();
      await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      await pool.query(`UPDATE packs SET price_tomans = 99000 WHERE id=$1`, [pack]);
      const again = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      expect(again).toMatchObject({ status: 'created', amountTomans: 99000, reused: false });
      expect(g.requests.map((r) => r.amountRials)).toEqual([price * 10, 990000]);
    });
  });

  describe('amount and unit', () => {
    it('stores the exact rial amount sent, and the database refuses any other conversion', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      expect(
        await one(`SELECT provider_amount::text AS a, provider_currency AS c FROM purchase_events`),
      ).toEqual({ a: '1500000', c: 'IRR' });
      expect(g.requests[0]).toMatchObject({ amountRials: 1500000, orderCode: created.orderCode });
      await expect(
        pool.query(`UPDATE purchase_events SET provider_amount = 150000`),
      ).rejects.toThrow(/provider_amount_check/);
      await expect(
        pool.query(`UPDATE purchase_events SET provider_currency = 'IRT'`),
      ).rejects.toThrow(/provider_amount_check/);
    });
  });

  describe('callbacks and provider codes', () => {
    it('a forged NOK cannot destroy a real payment: a later OK still grants once', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      const authority = await authorityOfAttempt(created.purchaseId);
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'NOK' }),
      ).toMatchObject({ status: 'cancelled' });
      expect(g.verifications).toHaveLength(0);
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
      ).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(await entitlements(alice)).toBe(1);
    });

    it("accepts 101 only with the attempt's own data: a foreign echoed order code grants nothing", async () => {
      const g = gateway(() => ({
        status: 'verified',
        referenceId: '777',
        alreadyVerified: true,
        code: 101,
        orderCode: 'LB-NOTOURS000',
      }));
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      const outcome = await verifyPurchase(
        { pool, provider: g.provider },
        { authority: await authorityOfAttempt(created.purchaseId), callbackStatus: 'OK' },
      );
      expect(outcome.status).toBe('verification_error');
      expect(await entitlements(alice)).toBe(0);
      expect(
        await one(`SELECT status::text, review_reason, last_provider_code FROM purchase_events`),
      ).toEqual({ status: 'pending', review_reason: 'provider_mismatch', last_provider_code: 101 });
    });

    it('accepts 101 carrying our own order code', async () => {
      let code = '';
      const g = gateway(() => ({
        status: 'verified',
        referenceId: '778',
        alreadyVerified: true,
        code: 101,
        orderCode: code,
      }));
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      code = created.orderCode;
      const outcome = await verifyPurchase(
        { pool, provider: g.provider },
        { authority: await authorityOfAttempt(created.purchaseId), callbackStatus: 'OK' },
      );
      expect(outcome).toMatchObject({
        status: 'verified',
        entitlementCreated: true,
        referenceId: '778',
      });
    });

    it('flags -50 / -54 and other definitive codes for review, never fails them, and stops auto-retry', async () => {
      for (const code of [-50, -54, -9]) {
        const g = gateway(() => ({ status: 'rejected', code }));
        const created = await createPurchase(deps(g.provider), { userId: bob, packId: pack });
        if (created.status !== 'created') throw new Error('expected created');
        const outcome = await verifyPurchase(
          { pool, provider: g.provider },
          { authority: await authorityOfAttempt(created.purchaseId), callbackStatus: 'OK' },
        );
        expect(outcome.status).toBe('verification_error');
        expect(
          await one(
            `SELECT status::text, last_provider_code, review_reason FROM purchase_events WHERE id=$1`,
            [created.purchaseId],
          ),
        ).toEqual({
          status: 'pending',
          last_provider_code: code,
          review_reason: 'provider_rejected',
        });
        // Definitive answer: automatic reconciliation and learner polling stop asking.
        await age(created.purchaseId, '40 minutes');
        const asked = g.verifications.length;
        expect(await reconcilePurchases({ pool, provider: g.provider })).toMatchObject({
          checked: 0,
        });
        await refreshPurchaseForLearner({ pool, provider: g.provider }, bob, created.purchaseId);
        expect(g.verifications).toHaveLength(asked);
        await pool.query(`UPDATE purchase_orders SET status='expired' WHERE status='open'`);
      }
    });

    it('a network error or rate limit stays unresolved, is retried, and stops at the check cap', async () => {
      let answer: ZarinpalVerifyOutcome = { status: 'error' };
      const g = gateway(() => answer);
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      await age(created.purchaseId, '40 minutes');
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 1,
        verified: 0,
      });
      answer = { status: 'rejected', code: -12 };
      await pool.query(
        `UPDATE purchase_events SET last_checked_at = now() - interval '11 minutes'`,
      );
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 1,
        verified: 0,
      });
      expect(
        await one(`SELECT status::text, review_reason, check_count FROM purchase_events`),
      ).toEqual({ status: 'pending', review_reason: null, check_count: 2 });
      // At the cap automatic checks stop (the attempt stays pending, visible for review).
      await pool.query(
        `UPDATE purchase_events SET check_count = ${maxAutomaticChecks}, last_checked_at = now() - interval '11 minutes'`,
      );
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 0,
        verified: 0,
      });
    });
  });

  describe('full purchase path (mock of the official-sandbox run)', () => {
    it('parallel checkout → one IRR attempt → verify 100 → one grant; replay asks nobody', async () => {
      const g = gateway();
      const [a, b] = await Promise.all([
        createPurchase(deps(g.provider), { userId: alice, packId: pack }),
        createPurchase(deps(g.provider), { userId: alice, packId: pack }),
      ]);
      if (a.status !== 'created' || b.status !== 'created') throw new Error('expected created');
      expect(b.purchaseId).toBe(a.purchaseId);
      expect(g.requests).toEqual([
        expect.objectContaining({ amountRials: 1500000, orderCode: a.orderCode }),
      ]);
      const authority = await authorityOfAttempt(a.purchaseId);
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
      ).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
      ).toMatchObject({ status: 'verified', entitlementCreated: false });
      expect(g.verifications).toHaveLength(1);
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 0,
        verified: 0,
      });
      expect(await entitlements(alice)).toBe(1);
      expect(
        (
          await pool.query(
            `SELECT kind, source, provider_code FROM purchase_order_events ORDER BY id`,
          )
        ).rows,
      ).toEqual([
        { kind: 'order_opened', source: 'learner_initiate', provider_code: null },
        { kind: 'attempt_created', source: 'learner_initiate', provider_code: null },
        { kind: 'attempt_reused', source: 'learner_initiate', provider_code: null },
        { kind: 'verified', source: 'provider_callback', provider_code: 100 },
      ]);
      const mine = await readLearnerPurchases(pool, alice);
      expect(mine).toEqual([
        expect.objectContaining({
          status: 'verified',
          orderCode: a.orderCode,
          referenceId: expect.any(String),
        }),
      ]);
    });
  });

  describe('gap 2 — recovery of an unsettled payment', () => {
    it('reconciliation settles a paid attempt whose callback never arrived, exactly once', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 0,
        verified: 0,
      });
      await age(created.purchaseId, '40 minutes');
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 1,
        verified: 1,
      });
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 0,
        verified: 0,
      });
      expect(await entitlements(alice)).toBe(1);
      const kinds = (await pool.query(`SELECT kind, source FROM purchase_order_events ORDER BY id`))
        .rows;
      expect(kinds.at(-1)).toEqual({ kind: 'verified', source: 'reconciliation' });
    });

    it('a young unpaid attempt polled by the learner stays pending; reconciliation later fails it', async () => {
      const g = gateway(() => ({ status: 'rejected', code: -51 }));
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      const polled = await refreshPurchaseForLearner(
        { pool, provider: g.provider },
        alice,
        created.purchaseId,
      );
      expect(polled).toMatchObject({ status: 'pending', orderCode: created.orderCode });
      // Throttled: an immediate second poll does not ask the gateway again.
      await refreshPurchaseForLearner({ pool, provider: g.provider }, alice, created.purchaseId);
      expect(g.verifications).toHaveLength(1);
      // Another learner polling this id learns nothing and triggers nothing.
      expect(
        await refreshPurchaseForLearner({ pool, provider: g.provider }, bob, created.purchaseId),
      ).toBeNull();
      await age(created.purchaseId, '40 minutes');
      await pool.query(
        `UPDATE purchase_events SET last_checked_at = now() - interval '11 minutes'`,
      );
      await reconcilePurchases({ pool, provider: g.provider });
      expect(await one(`SELECT status::text FROM purchase_events`)).toEqual({ status: 'failed' });
    });

    it('an entitlement write failure rolls back and the next check grants exactly once', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      const authority = await authorityOfAttempt(created.purchaseId);
      await pool.query(`
        CREATE OR REPLACE FUNCTION fail_once() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'simulated entitlement write failure'; END $$;
        CREATE TRIGGER fail_once BEFORE INSERT ON user_packs FOR EACH ROW EXECUTE FUNCTION fail_once();`);
      try {
        await expect(
          verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
        ).rejects.toThrow(/simulated/);
      } finally {
        await pool.query(`DROP TRIGGER fail_once ON user_packs; DROP FUNCTION fail_once();`);
      }
      // Nothing half-written: attempt still open, no entitlement, order still open.
      expect(await one(`SELECT status::text, provider_reference FROM purchase_events`)).toEqual({
        status: 'pending',
        provider_reference: null,
      });
      expect(await entitlements(alice)).toBe(0);
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
      ).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(
        await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' }),
      ).toMatchObject({ status: 'verified', entitlementCreated: false });
      expect(await entitlements(alice)).toBe(1);
    });

    it('an Admin re-check request is executed on the next reconciliation run', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      await pool.query(
        `INSERT INTO purchase_order_events (order_id, attempt_id, kind, source)
         SELECT order_id, id, 'recheck_requested', 'admin_recheck' FROM purchase_events`,
      );
      expect(await reconcilePurchases({ pool, provider: g.provider })).toEqual({
        checked: 1,
        verified: 1,
      });
      expect(
        (await pool.query(`SELECT source FROM purchase_order_events WHERE kind='verified'`)).rows,
      ).toEqual([{ source: 'admin_recheck' }]);
    });
  });

  describe('archive', () => {
    it('blocks new checkouts but still honours a payment made before archiving', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: alice, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      await pool.query(`UPDATE packs SET status='archived' WHERE id=$1`, [pack]);
      expect(await createPurchase(deps(g.provider), { userId: bob, packId: pack })).toEqual({
        status: 'denied',
        reason: 'unavailable',
      });
      expect(
        await verifyPurchase(
          { pool, provider: g.provider },
          { authority: await authorityOfAttempt(created.purchaseId), callbackStatus: 'OK' },
        ),
      ).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(await entitlements(alice)).toBe(1);
    });
  });

  describe('gap 3 — purchase evidence on account deletion (test account only)', () => {
    it('keeps a minimal, bounded claim and removes every learner-linked commerce row', async () => {
      const g = gateway();
      const created = await createPurchase(deps(g.provider), { userId: carol, packId: pack });
      if (created.status !== 'created') throw new Error('expected created');
      const authority = await authorityOfAttempt(created.purchaseId);
      await verifyPurchase({ pool, provider: g.provider }, { authority, callbackStatus: 'OK' });
      expect(await readLearnerPurchases(pool, carol)).toHaveLength(1);

      const out = await deleteAccount(pool, {
        userId: carol,
        subjectHash: 'test-subject-hash',
        actor: 'learner',
        requestedAt: new Date(),
        requestId: '55555555-5555-4555-8555-555555555555',
      });
      expect(out.status).toBe('deleted');
      if (out.status === 'deleted') expect(out.counts.purchasesPreserved).toBe(1);

      const claim = await one<Record<string, unknown>>(`SELECT * FROM purchase_ownership_claims`);
      expect(claim).toMatchObject({
        provider: 'zarinpal',
        provider_purchase_id: authority,
        product_id: null,
        pack_id: pack,
        amount_tomans: price,
        provider_reference: `ref-${authority.slice(-6)}`,
        subject_hash: 'test-subject-hash',
        status: 'verified',
      });
      const years =
        ((claim!.retain_until as Date).getTime() - (claim!.purchased_at as Date).getTime()) /
        (365.25 * 864e5);
      expect(Math.round(years)).toBe(5);
      // Nothing personal: no user id, phone, name or order snapshot in the evidence.
      const serialised = JSON.stringify(claim);
      for (const leak of [carol, '+491', 'carol', 'snapshot', created.orderCode])
        expect(serialised).not.toContain(leak);

      for (const table of ['purchase_events', 'purchase_orders']) {
        expect(
          await one(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1`, [carol]),
        ).toEqual({ n: 0 });
      }
      expect(await one(`SELECT count(*)::int AS n FROM purchase_order_events`)).toEqual({ n: 0 });
    });
  });
});
