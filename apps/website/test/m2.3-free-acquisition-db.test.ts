import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import { canLearnerAccessPack } from '../lib/pack-access';
import { activateFreePack } from '../lib/store-activation';
import { readLearnerPacks, readStoreCatalogue } from '../lib/store-catalogue';

/**
 * M2.3 acceptance — canonical FREE pack acquisition.
 *
 * Runs the REAL activation statement against a REAL Postgres with every repo migration applied.
 * The milestone is the SQL and the UNIQUE constraint that makes it idempotent, so the SQL and the
 * constraint are what get executed; a mocked pool would assert nothing about either.
 *
 * Requires TEST_DATABASE_URL (an empty database). CI provides one; locally:
 *   docker run -d --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=lbtest -p 55433:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:***@localhost:55433/lbtest \
 *     pnpm --filter @learnbox/website exec vitest run test/m2.3-free-acquisition-db.test.ts
 *
 * A hard failure, not a skip, when the variable is missing in CI: a skipped authorization test
 * would silently stop guarding the boundary it exists to guard.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
const dbName = `m23_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;
let teardown: ReturnType<typeof guardForcedTeardown>;

const migrationsDir = join(__dirname, '../../../database/migrations');

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

/**
 * The full truth table free acquisition must respect: (free|paid) x (published|draft) x
 * (listed|unlisted). `freeListed` is the only cell that may ever produce an entitlement.
 */
const packs = {
  freeListed: 'free-published-listed',
  freeUnlisted: 'free-published-unlisted',
  freeDraft: 'free-draft-listed',
  paidListed: 'paid-published-listed',
};

const cardUuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

const countEntitlements = async (userId: string, packId: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM user_packs WHERE user_id = $1 AND pack_id = $2`,
    [userId, packId],
  );
  return Number(result.rows[0].count);
};

suite('M2.3 canonical free pack acquisition (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    guardForcedTeardown(admin);
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
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
      [packs.freeListed, 'Free Listed', true, null, 'published', 'listed'],
      [packs.freeUnlisted, 'Free Unlisted', true, null, 'published', 'unlisted'],
      [packs.freeDraft, 'Free Draft', true, null, 'draft', 'listed'],
      [packs.paidListed, 'Paid Listed', false, 150000, 'published', 'listed'],
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
        `m23-card-${seq}`,
      ]);
      await pool.query(
        `INSERT INTO card_versions (card_id, version, status, content_json, source_provider)
         VALUES ($1, 1, 'published', $2, 'editorial')`,
        [card, JSON.stringify({ id: `m23-card-${seq}`, lemma: `wort${seq}`, cefr: 'A1' })],
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

  describe('what free acquisition grants', () => {
    it('creates an entitlement for a free, published, listed pack', async () => {
      await expect(activateFreePack(pool, bob, packs.freeListed)).resolves.toEqual({
        status: 'activated',
      });
      expect(await countEntitlements(bob, packs.freeListed)).toBe(1);

      const row = await pool.query<{ acquisition_type: string; purchase_event_id: string | null }>(
        `SELECT acquisition_type, purchase_event_id FROM user_packs WHERE user_id=$1 AND pack_id=$2`,
        [bob, packs.freeListed],
      );
      expect(row.rows[0].acquisition_type).toBe('free');
      // Nothing was bought, so nothing links to a purchase.
      expect(row.rows[0].purchase_event_id).toBeNull();
    });

    it('is idempotent: repeating it succeeds and still leaves exactly one row', async () => {
      await expect(activateFreePack(pool, bob, packs.freeListed)).resolves.toEqual({
        status: 'already_owned',
      });
      await expect(activateFreePack(pool, bob, packs.freeListed)).resolves.toEqual({
        status: 'already_owned',
      });
      expect(await countEntitlements(bob, packs.freeListed)).toBe(1);
    });

    it('survives concurrent activation with exactly one row, not a unique-violation crash', async () => {
      // The UNIQUE constraint, not a prior read, is what enforces this.
      const results = await Promise.all(
        Array.from({ length: 5 }, () => activateFreePack(pool, alice, packs.freeListed)),
      );
      expect(results.every((r) => r.status === 'activated' || r.status === 'already_owned')).toBe(
        true,
      );
      expect(results.filter((r) => r.status === 'activated')).toHaveLength(1);
      expect(await countEntitlements(alice, packs.freeListed)).toBe(1);
    });
  });

  describe('what free acquisition refuses', () => {
    it('refuses a paid pack — there are no free rides on paid content', async () => {
      await expect(activateFreePack(pool, bob, packs.paidListed)).resolves.toEqual({
        status: 'denied',
        reason: 'not_free',
      });
      expect(await countEntitlements(bob, packs.paidListed)).toBe(0);
    });

    it('refuses an unpublished pack even though it is free and listed', async () => {
      await expect(activateFreePack(pool, bob, packs.freeDraft)).resolves.toEqual({
        status: 'denied',
        reason: 'unavailable',
      });
      expect(await countEntitlements(bob, packs.freeDraft)).toBe(0);
    });

    it('refuses an unlisted pack even though it is free and published', async () => {
      await expect(activateFreePack(pool, bob, packs.freeUnlisted)).resolves.toEqual({
        status: 'denied',
        reason: 'unavailable',
      });
      expect(await countEntitlements(bob, packs.freeUnlisted)).toBe(0);
    });

    it('refuses an unknown pack id and a hostile one without interpolating it', async () => {
      await expect(activateFreePack(pool, bob, 'no-such-pack')).resolves.toEqual({
        status: 'denied',
        reason: 'unavailable',
      });
      // Parameterized, so this is just a string that matches nothing.
      await expect(
        activateFreePack(pool, bob, `x'; DROP TABLE user_packs; --`),
      ).resolves.toMatchObject({ status: 'denied' });
      const survived = await pool.query(`SELECT to_regclass('public.user_packs') AS t`);
      expect(survived.rows[0].t).toBe('user_packs');
    });

    it('denies a malformed learner id instead of raising a cast error', async () => {
      await expect(activateFreePack(pool, 'not-a-uuid', packs.freeListed)).resolves.toEqual({
        status: 'denied',
        reason: 'unavailable',
      });
    });
  });

  describe('what the learner sees afterwards', () => {
    it('does not leak one learner’s acquisition to another learner', async () => {
      const stranger = '44444444-4444-4444-8444-444444444444';
      await pool.query(
        `INSERT INTO users (id, phone_e164, first_name) VALUES ($1,'+491****0003','stranger')
         ON CONFLICT DO NOTHING`,
        [stranger],
      );
      // Alice buys the paid pack. Entitlement is per learner, so nobody else inherits it.
      await pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1,$2,'purchased')
         ON CONFLICT DO NOTHING`,
        [alice, packs.paidListed],
      );

      await expect(canLearnerAccessPack(pool, packs.paidListed, alice)).resolves.toBe(true);
      await expect(canLearnerAccessPack(pool, packs.paidListed, bob)).resolves.toBe(false);
      await expect(canLearnerAccessPack(pool, packs.paidListed, stranger)).resolves.toBe(false);

      expect(await countEntitlements(stranger, packs.freeListed)).toBe(0);
      expect((await readLearnerPacks(pool, stranger)).map((p) => p.id)).not.toContain(
        packs.paidListed,
      );
      // Bob's own free acquisition stayed his: it created no row for anyone else.
      const holders = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM user_packs WHERE pack_id = $1`,
        [packs.freeListed],
      );
      expect(Number(holders.rows[0].count)).toBe(2); // bob + alice, from the tests above
    });

    it('reflects the real entitlement in the learner library', async () => {
      const library = await readLearnerPacks(pool, bob);
      expect(library.map((p) => p.id)).toContain(packs.freeListed);
    });

    it('lets the learner actually reach the content it just acquired', async () => {
      // Acquisition and access are the same fact: both read user_packs via the M2.2 rule.
      await expect(canLearnerAccessPack(pool, packs.freeListed, bob)).resolves.toBe(true);
      // And the refusals stayed refusals.
      await expect(canLearnerAccessPack(pool, packs.paidListed, bob)).resolves.toBe(false);
      await expect(canLearnerAccessPack(pool, packs.freeDraft, bob)).resolves.toBe(false);
    });

    it('keeps an unlisted free pack readable — unlisting closes the shop, not the library', async () => {
      // M2.2 compatibility: published AND (is_free OR entitled). No entitlement row needed.
      await expect(canLearnerAccessPack(pool, packs.freeUnlisted, bob)).resolves.toBe(true);
    });

    it('shows only published AND listed packs in the catalogue', async () => {
      const catalogue = await readStoreCatalogue(pool, bob);
      const ids = catalogue.map((p) => p.id);
      expect(ids).toContain(packs.freeListed);
      expect(ids).toContain(packs.paidListed);
      expect(ids).not.toContain(packs.freeDraft);
      expect(ids).not.toContain(packs.freeUnlisted);
    });

    it('marks the acquired pack as owned in the catalogue', async () => {
      const catalogue = await readStoreCatalogue(pool, bob);
      expect(catalogue.find((p) => p.id === packs.freeListed)?.owned).toBe(true);
      expect(catalogue.find((p) => p.id === packs.paidListed)?.owned).toBe(false);
    });

    it('exposes no card content through either Store read path', async () => {
      const serialized = JSON.stringify([
        await readStoreCatalogue(pool, bob),
        await readLearnerPacks(pool, bob),
      ]);
      // The seeded lemmas and content ids are the protected payload; none may appear.
      for (const secret of ['wort1', 'wort2', 'wort3', 'wort4', 'm23-card-']) {
        expect(serialized).not.toContain(secret);
      }
    });
  });

  describe('what free acquisition must never touch', () => {
    it('creates no payment or purchase record of any kind', async () => {
      for (const table of ['payment_logs', 'purchase_events', 'payment_gateways']) {
        const exists = await pool.query<{ t: string | null }>(`SELECT to_regclass($1) AS t`, [
          `public.${table}`,
        ]);
        if (!exists.rows[0].t) continue;
        const count = await pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${table}`,
        );
        expect(count.rows[0].count).toBe('0');
      }
    });

    it('never records a free acquisition as purchased', async () => {
      // Scoped to free packs: a genuinely purchased paid pack is allowed to be 'purchased'.
      const rows = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM user_packs up JOIN packs p ON p.id = up.pack_id
          WHERE p.is_free = true AND up.acquisition_type <> 'free'`,
      );
      expect(rows.rows[0].count).toBe('0');
    });
  });
});
