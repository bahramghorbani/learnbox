import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import { canLearnerAccessPack } from '../lib/pack-access';
import { activateFreePack } from '../lib/store-activation';
import { readLearnerPacks, readStoreCatalogue } from '../lib/store-catalogue';
import { createPurchase, readPurchaseForLearner, verifyPurchase } from '../lib/store-purchase';
import type { ZarinpalProvider } from '../lib/zarinpal';

/**
 * M2.4 acceptance — paid pack acquisition through Zarinpal.
 *
 * Runs the REAL purchase and verification statements against a REAL Postgres with every repo
 * migration applied. The milestone is the atomic verify-and-grant statement, the `status='pending'`
 * idempotency lock and the UNIQUE(provider, provider_purchase_id) duplicate guard — so those are
 * what get executed. A mocked pool would assert nothing about any of them.
 *
 * The PROVIDER is a deterministic fixture, never the real Zarinpal: the owner has no Merchant ID
 * yet, and contacting a live gateway with a fake credential is forbidden. The fixture implements
 * the same `ZarinpalProvider` interface the production adapter does, so everything between the
 * route and the database is the real code path.
 *
 * Requires TEST_DATABASE_URL (an empty database). CI provides one; locally:
 *   docker run -d --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=lbtest -p 55433:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:***@localhost:55433/lbtest \
 *     pnpm --filter @learnbox/website exec vitest run test/m2.4-paid-acquisition-db.test.ts
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
const dbName = `m24_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;
let teardown: ReturnType<typeof guardForcedTeardown>;

const migrationsDir = join(__dirname, '../../../database/migrations');

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

/** The truth table paid acquisition must respect, mirroring the M2.3 free-acquisition matrix. */
const packs = {
  paidListed: 'paid-published-listed',
  paidUnlisted: 'paid-published-unlisted',
  paidDraft: 'paid-draft-listed',
  freeListed: 'free-published-listed',
  paidNoPrice: 'paid-published-listed-noprice',
};

const paidPrice = 150000;

const cardUuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const authorityOf = (suffix: string) => `A${suffix.padStart(35, '0')}`;

/**
 * Deterministic stand-in for Zarinpal. Records what it was asked, so the tests can assert that the
 * SERVER decided the amount — the single most important property of the paid flow.
 */
function fixtureProvider(
  overrides: Partial<ZarinpalProvider> & { authority?: string } = {},
): ZarinpalProvider & {
  requests: Array<{ amountTomans: number; callbackUrl: string; description: string }>;
  verifications: Array<{ amountTomans: number; authority: string }>;
} {
  const requests: Array<{ amountTomans: number; callbackUrl: string; description: string }> = [];
  const verifications: Array<{ amountTomans: number; authority: string }> = [];
  const authority = overrides.authority ?? authorityOf('1');
  return {
    requests,
    verifications,
    async requestPayment(input) {
      requests.push(input);
      if (overrides.requestPayment) return overrides.requestPayment(input);
      return { status: 'created', authority };
    },
    async verifyPayment(input) {
      verifications.push(input);
      if (overrides.verifyPayment) return overrides.verifyPayment(input);
      return { status: 'verified', referenceId: '987654321', alreadyVerified: false };
    },
    paymentUrl(value) {
      return `https://sandbox.zarinpal.com/pg/StartPay/${value}`;
    },
  };
}

const dependencies = (provider: ZarinpalProvider) => ({
  pool,
  provider,
  callbackOrigin: 'https://app.learnbox.example',
  sandbox: true,
});

const countEntitlements = async (userId: string, packId: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM user_packs WHERE user_id = $1 AND pack_id = $2`,
    [userId, packId],
  );
  return Number(result.rows[0].count);
};

const countTransactions = async (packId: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM purchase_events WHERE pack_id = $1`,
    [packId],
  );
  return Number(result.rows[0].count);
};

suite('M2.4 paid pack acquisition through Zarinpal (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    guardForcedTeardown(admin);
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 6 });
    teardown = guardForcedTeardown(pool);
    for (const file of readdirSync(migrationsDir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1,'+491****0001','alice'),($2,'+491****0002','bob')`,
      [alice, bob],
    );

    const rows: Array<[string, string, boolean, number | null, string, string]> = [
      [packs.paidListed, 'Paid Listed', false, paidPrice, 'published', 'listed'],
      [packs.paidUnlisted, 'Paid Unlisted', false, paidPrice, 'published', 'unlisted'],
      [packs.paidDraft, 'Paid Draft', false, paidPrice, 'draft', 'listed'],
      [packs.freeListed, 'Free Listed', true, null, 'published', 'listed'],
      [packs.paidNoPrice, 'Paid No Price', false, null, 'published', 'listed'],
    ];
    let seq = 0;
    for (const [id, name, isFree, price, status, listing] of rows) {
      await pool.query(
        `INSERT INTO packs (id, display_name, target_item_count, category, is_free, price_tomans, status)
         VALUES ($1,$2,1,'essentials',$3,$4,$5)`,
        [id, name, isFree, price, status],
      );
      seq += 1;
      const card = cardUuid(seq);
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1,$2,$3)`, [
        card,
        `wort${seq}`,
        `m24-card-${seq}`,
      ]);
      await pool.query(
        `INSERT INTO card_versions (card_id, version, status, content_json, source_provider)
         VALUES ($1, 1, 'published', $2, 'editorial')`,
        [card, JSON.stringify({ id: `m24-card-${seq}`, lemma: `wort${seq}`, cefr: 'A1' })],
      );
      await pool.query(`INSERT INTO pack_cards (pack_id, card_id) VALUES ($1,$2)`, [id, card]);
      await pool.query(
        `INSERT INTO store_listings (pack_id, store_status, listed_at)
         VALUES ($1, $2, CASE WHEN $2 = 'listed' THEN now() ELSE NULL END)`,
        [id, listing],
      );
    }
  });

  afterAll(async () => {
    teardown?.beginTeardown();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  beforeEach(async () => {
    // Each test starts from no transactions and no purchased entitlements, so idempotency results
    // are genuinely about the statement under test and not about leftovers.
    await pool.query(`DELETE FROM user_packs WHERE acquisition_type = 'purchased'`);
    await pool.query(`DELETE FROM purchase_events`);
  });

  describe('who may start a purchase', () => {
    it('starts a purchase for a paid, published, listed pack', async () => {
      const provider = fixtureProvider();
      const outcome = await createPurchase(dependencies(provider), {
        userId: alice,
        packId: packs.paidListed,
      });

      expect(outcome.status).toBe('created');
      if (outcome.status !== 'created') return;
      expect(outcome.redirectUrl).toBe(
        `https://sandbox.zarinpal.com/pg/StartPay/${authorityOf('1')}`,
      );
      expect(outcome.amountTomans).toBe(paidPrice);
      expect(await countTransactions(packs.paidListed)).toBe(1);
    });

    it('records the new transaction as pending, granting nothing yet', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const row = await pool.query<{ status: string; amount_tomans: number; provider: string }>(
        `SELECT status::text AS status, amount_tomans, provider::text AS provider
           FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(row.rows[0]).toMatchObject({
        status: 'pending',
        amount_tomans: paidPrice,
        provider: 'zarinpal',
      });
      // The whole point of the two-step flow: starting a payment is not acquiring a pack.
      expect(await countEntitlements(alice, packs.paidListed)).toBe(0);
      expect(await canLearnerAccessPack(pool, packs.paidListed, alice)).toBe(false);
    });

    it('rejects a FREE pack through the paid endpoint', async () => {
      const provider = fixtureProvider();
      await expect(
        createPurchase(dependencies(provider), { userId: alice, packId: packs.freeListed }),
      ).resolves.toEqual({ status: 'denied', reason: 'free_pack' });
      // No gateway session is opened for something that costs nothing.
      expect(provider.requests).toHaveLength(0);
    });

    it('rejects an unpublished pack', async () => {
      const provider = fixtureProvider();
      await expect(
        createPurchase(dependencies(provider), { userId: alice, packId: packs.paidDraft }),
      ).resolves.toEqual({ status: 'denied', reason: 'unavailable' });
      expect(provider.requests).toHaveLength(0);
    });

    it('rejects an unlisted pack', async () => {
      const provider = fixtureProvider();
      await expect(
        createPurchase(dependencies(provider), { userId: alice, packId: packs.paidUnlisted }),
      ).resolves.toEqual({ status: 'denied', reason: 'unavailable' });
      expect(provider.requests).toHaveLength(0);
    });

    it('rejects a paid pack with no usable price instead of charging zero', async () => {
      const provider = fixtureProvider();
      await expect(
        createPurchase(dependencies(provider), { userId: alice, packId: packs.paidNoPrice }),
      ).resolves.toEqual({ status: 'denied', reason: 'unavailable' });
      expect(provider.requests).toHaveLength(0);
    });

    it('rejects a pack the learner already owns, so it cannot be sold twice', async () => {
      await activateFreePack(pool, alice, packs.freeListed);
      const provider = fixtureProvider();
      await expect(
        createPurchase(dependencies(provider), { userId: alice, packId: packs.freeListed }),
      ).resolves.toEqual({ status: 'denied', reason: 'already_owned' });
      expect(provider.requests).toHaveLength(0);
    });

    it('fails safely on hostile and malformed identifiers', async () => {
      const provider = fixtureProvider();
      for (const packId of [
        "'; DROP TABLE user_packs; --",
        '../../etc/passwd',
        'A'.repeat(200),
        '',
      ]) {
        await expect(
          createPurchase(dependencies(provider), { userId: alice, packId }),
        ).resolves.toEqual({ status: 'denied', reason: 'unavailable' });
      }
      await expect(
        createPurchase(dependencies(provider), { userId: 'not-a-uuid', packId: packs.paidListed }),
      ).resolves.toEqual({ status: 'denied', reason: 'unavailable' });

      // The hostile pack id must not have reached the database as SQL.
      const survived = await pool.query(`SELECT to_regclass('public.user_packs') AS table`);
      expect(survived.rows[0].table).toBe('user_packs');
    });
  });

  describe('where the amount comes from', () => {
    it('sends the CANONICAL pack price to the gateway, never a client value', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });
      expect(provider.requests[0].amountTomans).toBe(paidPrice);
      expect(provider.requests[0].callbackUrl).toBe(
        'https://app.learnbox.example/api/store/purchase/callback',
      );
    });

    it('verifies against the SNAPSHOT, so a later price change cannot invalidate a payment', async () => {
      const provider = fixtureProvider();
      const created = await createPurchase(dependencies(provider), {
        userId: alice,
        packId: packs.paidListed,
      });
      expect(created.status).toBe('created');

      // The operator re-prices the pack while the learner is on the gateway page.
      await pool.query(`UPDATE packs SET price_tomans = $2 WHERE id = $1`, [
        packs.paidListed,
        999000,
      ]);

      const outcome = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      expect(outcome.status).toBe('verified');
      // Verification used the amount the learner was actually asked for.
      expect(provider.verifications[0].amountTomans).toBe(paidPrice);

      const stored = await pool.query<{ amount_tomans: number }>(
        `SELECT amount_tomans FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(stored.rows[0].amount_tomans).toBe(paidPrice);

      await pool.query(`UPDATE packs SET price_tomans = $2 WHERE id = $1`, [
        packs.paidListed,
        paidPrice,
      ]);
    });

    it('cannot have its stored amount changed by a second purchase attempt', async () => {
      const first = fixtureProvider({ authority: authorityOf('1') });
      await createPurchase(dependencies(first), { userId: alice, packId: packs.paidListed });
      const second = fixtureProvider({ authority: authorityOf('2') });
      await createPurchase(dependencies(second), { userId: alice, packId: packs.paidListed });

      const amounts = await pool.query<{ amount_tomans: number }>(
        `SELECT amount_tomans FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(amounts.rows.map((r) => r.amount_tomans)).toEqual([paidPrice, paidPrice]);
    });
  });

  describe('what a verified payment grants', () => {
    const startPurchase = async (provider: ZarinpalProvider, userId = alice) =>
      createPurchase(dependencies(provider), { userId, packId: packs.paidListed });

    it('grants exactly one entitlement, marked purchased', async () => {
      const provider = fixtureProvider();
      await startPurchase(provider);
      const outcome = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      expect(outcome).toMatchObject({
        status: 'verified',
        packId: packs.paidListed,
        referenceId: '987654321',
        entitlementCreated: true,
      });
      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);

      const row = await pool.query<{ acquisition_type: string; purchase_event_id: string | null }>(
        `SELECT acquisition_type, purchase_event_id FROM user_packs
          WHERE user_id = $1 AND pack_id = $2`,
        [alice, packs.paidListed],
      );
      expect(row.rows[0].acquisition_type).toBe('purchased');
      // The entitlement points back at the transaction that paid for it.
      expect(row.rows[0].purchase_event_id).not.toBeNull();
    });

    it('makes the pack accessible under the canonical M2.2 rule', async () => {
      const provider = fixtureProvider();
      await startPurchase(provider);
      expect(await canLearnerAccessPack(pool, packs.paidListed, alice)).toBe(false);

      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      // M2.2 remains the single authority for access; M2.4 only writes the row it reads.
      expect(await canLearnerAccessPack(pool, packs.paidListed, alice)).toBe(true);
    });

    it('shows the pack as owned in the learner Store after payment', async () => {
      const provider = fixtureProvider();
      await startPurchase(provider);
      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      const owned = await readLearnerPacks(pool, alice);
      expect(owned.map((pack) => pack.id)).toContain(packs.paidListed);

      const catalogue = await readStoreCatalogue(pool, alice);
      expect(catalogue.find((pack) => pack.id === packs.paidListed)?.owned).toBe(true);
    });

    it('records the gateway reference for reconciliation', async () => {
      const provider = fixtureProvider();
      await startPurchase(provider);
      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      const row = await pool.query<{
        status: string;
        provider_reference: string;
        verified_at: Date | null;
      }>(
        `SELECT status::text AS status, provider_reference, verified_at
           FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(row.rows[0].status).toBe('verified');
      expect(row.rows[0].provider_reference).toBe('987654321');
      expect(row.rows[0].verified_at).not.toBeNull();
    });
  });

  describe('idempotency and replay', () => {
    it('keeps exactly one entitlement when the callback is replayed', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const first = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      const second = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      const third = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      expect(first).toMatchObject({ status: 'verified', entitlementCreated: true });
      // Replays are still reported as success — the payment did happen — but grant nothing new.
      expect(second).toMatchObject({ status: 'verified', entitlementCreated: false });
      expect(third).toMatchObject({ status: 'verified', entitlementCreated: false });

      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);
      expect(await countTransactions(packs.paidListed)).toBe(1);
      // A replay must not re-ask the gateway either.
      expect(provider.verifications).toHaveLength(1);
    });

    it('keeps exactly one entitlement under concurrent callbacks', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          verifyPurchase({ pool, provider }, { authority: authorityOf('1'), callbackStatus: 'OK' }),
        ),
      );

      expect(results.every((result) => result.status === 'verified')).toBe(true);
      const granted = results.filter(
        (result) => result.status === 'verified' && result.entitlementCreated,
      );
      // The `status = 'pending'` predicate is the lock: exactly one caller may grant.
      expect(granted).toHaveLength(1);
      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);
    });

    it('refuses a duplicate transaction for the same gateway authority', async () => {
      const provider = fixtureProvider({ authority: authorityOf('1') });
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });
      // A provider replaying the same Authority must hit the UNIQUE constraint, not create a
      // second transaction for the same payment.
      await expect(
        createPurchase(dependencies(provider), { userId: bob, packId: packs.paidListed }),
      ).rejects.toThrow();
      expect(await countTransactions(packs.paidListed)).toBe(1);
    });

    it('cannot be re-settled as cancelled after it is verified', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });
      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      // A late NOK for an already-paid transaction must not revoke the sale.
      const late = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'NOK' },
      );
      expect(late.status).toBe('verified');
      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);
    });
  });

  describe('what a non-successful payment grants', () => {
    it('grants nothing when the provider rejects the verification', async () => {
      const provider = fixtureProvider({
        verifyPayment: async () => ({ status: 'rejected', code: -51 }),
      });
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const outcome = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      expect(outcome).toMatchObject({ status: 'failed', code: -51 });
      expect(await countEntitlements(alice, packs.paidListed)).toBe(0);

      const row = await pool.query<{ status: string }>(
        `SELECT status::text AS status FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(row.rows[0].status).toBe('failed');
    });

    it('grants nothing when the learner cancels at the gateway', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const outcome = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'NOK' },
      );
      expect(outcome.status).toBe('cancelled');
      expect(await countEntitlements(alice, packs.paidListed)).toBe(0);
      // A cancelled return is settled locally; there is nothing to ask the gateway about.
      expect(provider.verifications).toHaveLength(0);
    });

    it('does NOT claim failure when the gateway is unreachable', async () => {
      const provider = fixtureProvider({ verifyPayment: async () => ({ status: 'error' }) });
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const outcome = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      expect(outcome.status).toBe('verification_error');
      expect(await countEntitlements(alice, packs.paidListed)).toBe(0);

      // Still pending, NOT failed: the learner may have paid and the outcome is simply unknown.
      const row = await pool.query<{ status: string }>(
        `SELECT status::text AS status FROM purchase_events WHERE pack_id = $1`,
        [packs.paidListed],
      );
      expect(row.rows[0].status).toBe('pending');
    });

    it('recovers a payment whose verification failed transiently', async () => {
      let attempt = 0;
      const provider = fixtureProvider({
        verifyPayment: async () => {
          attempt += 1;
          return attempt === 1
            ? { status: 'error' }
            : { status: 'verified', referenceId: '111222333', alreadyVerified: true };
        },
      });
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      const first = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      expect(first.status).toBe('verification_error');

      // Because the row stayed `pending`, a retry can still settle it correctly.
      const second = await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );
      expect(second).toMatchObject({ status: 'verified', entitlementCreated: true });
      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);
    });

    it('does not grant anything for an unknown or forged authority', async () => {
      const provider = fixtureProvider();
      await expect(
        verifyPurchase({ pool, provider }, { authority: authorityOf('999'), callbackStatus: 'OK' }),
      ).resolves.toEqual({ status: 'unknown' });
      await expect(
        verifyPurchase({ pool, provider }, { authority: 'not-an-authority', callbackStatus: 'OK' }),
      ).resolves.toEqual({ status: 'unknown' });
      await expect(
        verifyPurchase(
          { pool, provider },
          { authority: "'; DELETE FROM user_packs; --", callbackStatus: 'OK' },
        ),
      ).resolves.toEqual({ status: 'unknown' });
      expect(provider.verifications).toHaveLength(0);
    });
  });

  describe('ownership isolation', () => {
    it('grants to the buyer, not to whoever opens the callback', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });

      // Settlement takes the learner from the transaction, so bob replaying alice's callback URL
      // acquires nothing.
      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      expect(await countEntitlements(alice, packs.paidListed)).toBe(1);
      expect(await countEntitlements(bob, packs.paidListed)).toBe(0);
      expect(await canLearnerAccessPack(pool, packs.paidListed, bob)).toBe(false);
    });

    it('does not let one learner read another learner receipt', async () => {
      const provider = fixtureProvider();
      const created = await createPurchase(dependencies(provider), {
        userId: alice,
        packId: packs.paidListed,
      });
      expect(created.status).toBe('created');
      if (created.status !== 'created') return;

      const own = await readPurchaseForLearner(pool, alice, created.purchaseId);
      expect(own).toMatchObject({ packId: packs.paidListed, amountTomans: paidPrice });

      // Another learner asking for the same transaction id gets nothing at all.
      expect(await readPurchaseForLearner(pool, bob, created.purchaseId)).toBeNull();
    });

    it('rejects malformed transaction ids without touching the database', async () => {
      for (const id of ["' OR '1'='1", 'not-a-uuid', '']) {
        expect(await readPurchaseForLearner(pool, alice, id)).toBeNull();
      }
      expect(await readPurchaseForLearner(pool, 'not-a-uuid', authorityOf('1'))).toBeNull();
    });
  });

  describe('what paid acquisition must not disturb', () => {
    it('leaves free acquisition working exactly as M2.3 defined it', async () => {
      await expect(activateFreePack(pool, bob, packs.freeListed)).resolves.toEqual({
        status: 'activated',
      });
      expect(await countEntitlements(bob, packs.freeListed)).toBe(1);

      const row = await pool.query<{ acquisition_type: string; purchase_event_id: string | null }>(
        `SELECT acquisition_type, purchase_event_id FROM user_packs
          WHERE user_id = $1 AND pack_id = $2`,
        [bob, packs.freeListed],
      );
      // A free pack is still free: no payment record, no purchase link.
      expect(row.rows[0].acquisition_type).toBe('free');
      expect(row.rows[0].purchase_event_id).toBeNull();

      await pool.query(`DELETE FROM user_packs WHERE user_id = $1 AND pack_id = $2`, [
        bob,
        packs.freeListed,
      ]);
    });

    it('never exposes card content through a purchase or receipt', async () => {
      const provider = fixtureProvider();
      const created = await createPurchase(dependencies(provider), {
        userId: alice,
        packId: packs.paidListed,
      });
      if (created.status !== 'created') throw new Error('expected a created purchase');
      await verifyPurchase(
        { pool, provider },
        { authority: authorityOf('1'), callbackStatus: 'OK' },
      );

      const receipt = await readPurchaseForLearner(pool, alice, created.purchaseId);
      const serialised = JSON.stringify({ created, receipt, requests: provider.requests });
      for (const leak of ['lemma', 'content_json', 'cefr', 'wort1', 'card_versions']) {
        expect(serialised).not.toContain(leak);
      }
    });

    it('never puts the merchant credential into a transaction row', async () => {
      const provider = fixtureProvider();
      await createPurchase(dependencies(provider), { userId: alice, packId: packs.paidListed });
      const row = await pool.query(`SELECT * FROM purchase_events WHERE pack_id = $1`, [
        packs.paidListed,
      ]);
      const serialised = JSON.stringify(row.rows[0]);
      expect(serialised).not.toMatch(/merchant/i);
      expect(serialised).not.toMatch(/ZARINPAL_MERCHANT_ID/);
    });
  });
});
