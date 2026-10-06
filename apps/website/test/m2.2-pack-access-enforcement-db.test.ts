import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';
import {
  canLearnerAccessContentId,
  canLearnerAccessPack,
  isLearnerUserId,
  readAccessiblePackIds,
} from '../lib/pack-access';
import { readLearnerPacks, readStoreCatalogue } from '../lib/store-catalogue';
import { readCurriculumProgress, readPackProgress } from '../lib/learner-read-model';
import { countUnseenCatalogCards } from '../lib/learner-workload';

/**
 * M2.2 acceptance — server-side pack access and canonical entitlement.
 *
 * Runs the REAL access predicate and the REAL learner read paths against a REAL Postgres with every
 * repo migration applied, including 0026_store_listings. Mocking the pool here would prove nothing:
 * the whole milestone IS the SQL, so the SQL is what gets executed.
 *
 * Requires TEST_DATABASE_URL (an empty database). CI provides one; locally:
 *   docker run -d --rm -e POSTGRES_PASSWORD=t -e POSTGRES_DB=lbtest -p 55433:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:***@localhost:55433/lbtest \
 *     pnpm --filter @learnbox/website exec vitest run test/m2.2-pack-access-enforcement-db.test.ts
 *
 * A hard failure, not a skip, when the variable is missing in CI: a skipped authorization test
 * would silently stop guarding the boundary it exists to guard.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;
const dbName = `m22_${Math.random().toString(36).slice(2, 10)}`;

let pool: Pool;
let admin: Pool;
let teardown: ReturnType<typeof guardForcedTeardown>;

const migrationsDir = join(__dirname, '../../../database/migrations');

/** Alice is entitled to the paid packs; Bob is a paying-nothing authenticated learner. */
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

/**
 * Four packs covering the whole truth table of (publication x free/paid x listed/unlisted).
 * `freeStart` mirrors the real published free Start Pack: no `user_packs` row anywhere.
 */
const packs = {
  freeStart: 'free-start-published',
  paidListed: 'paid-published-listed',
  paidDraftListed: 'paid-draft-listed',
  paidUnlisted: 'paid-published-unlisted',
};
const content = {
  freeStart: 'start-a1-freecard',
  paidListed: 'paid-listed-card',
  paidDraftListed: 'paid-draft-card',
  paidUnlisted: 'paid-unlisted-card',
};

const cardUuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

suite('M2.2 canonical pack access enforcement (real Postgres)', () => {
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

    const rows: Array<[string, string, boolean, number | null, string]> = [
      [packs.freeStart, 'Start Pack', true, null, 'published'],
      [packs.paidListed, 'Paid Listed', false, 150000, 'published'],
      [packs.paidDraftListed, 'Paid Draft', false, 200000, 'draft'],
      [packs.paidUnlisted, 'Paid Unlisted', false, 250000, 'published'],
    ];
    let seq = 0;
    for (const [id, name, isFree, price, status] of rows) {
      await pool.query(
        `INSERT INTO packs (id, display_name, target_item_count, category, is_free, price_tomans, status)
         VALUES ($1,$2,1,'essentials',$3,$4,$5)`,
        [id, name, isFree, price, status],
      );
      seq += 1;
      const card = cardUuid(seq);
      const contentId = Object.values(content)[seq - 1];
      await pool.query(`INSERT INTO cards (id, lemma, content_id) VALUES ($1,$2,$3)`, [
        card,
        `wort${seq}`,
        contentId,
      ]);
      await pool.query(
        `INSERT INTO card_versions (card_id, version, status, content_json, source_provider)
         VALUES ($1, 1, 'published', $2, 'editorial')`,
        [card, JSON.stringify({ id: contentId, lemma: `wort${seq}`, cefr: 'A1' })],
      );
      await pool.query(`INSERT INTO pack_cards (pack_id, card_id) VALUES ($1,$2)`, [id, card]);
    }

    // Store listings: three listed (one of them deliberately on a DRAFT pack), one unlisted.
    for (const [packId, status] of [
      [packs.freeStart, 'listed'],
      [packs.paidListed, 'listed'],
      [packs.paidDraftListed, 'listed'],
      [packs.paidUnlisted, 'unlisted'],
    ]) {
      await pool.query(
        `INSERT INTO store_listings (pack_id, store_status, listed_at)
         VALUES ($1, $2, CASE WHEN $2 = 'listed' THEN now() ELSE NULL END)`,
        [packId, status],
      );
    }

    // Alice owns the two paid packs. Nobody has an entitlement row for the free Start Pack.
    for (const packId of [packs.paidListed, packs.paidUnlisted]) {
      await pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1,$2,'purchased')`,
        [alice, packId],
      );
    }
  });

  afterAll(async () => {
    teardown?.beginTeardown();
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('the canonical access rule', () => {
    it('allows a free published pack with no entitlement row at all', async () => {
      // The compatibility requirement: the current Start Pack keeps working while user_packs is empty.
      await expect(canLearnerAccessPack(pool, packs.freeStart, bob)).resolves.toBe(true);
      await expect(canLearnerAccessPack(pool, packs.freeStart, alice)).resolves.toBe(true);
      const owners = await pool.query(`SELECT count(*) AS n FROM user_packs WHERE pack_id = $1`, [
        packs.freeStart,
      ]);
      expect(Number(owners.rows[0].n)).toBe(0);
    });

    it('denies a paid published pack without the canonical entitlement', async () => {
      await expect(canLearnerAccessPack(pool, packs.paidListed, bob)).resolves.toBe(false);
    });

    it('allows a paid published pack with the canonical entitlement', async () => {
      await expect(canLearnerAccessPack(pool, packs.paidListed, alice)).resolves.toBe(true);
    });

    it('denies an unpublished pack even when the owner holds an entitlement', async () => {
      await pool.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1,$2,'purchased')
         ON CONFLICT DO NOTHING`,
        [bob, packs.paidDraftListed],
      );
      // Publication is a hard precondition: owning a draft pack grants nothing.
      await expect(canLearnerAccessPack(pool, packs.paidDraftListed, bob)).resolves.toBe(false);
      await pool.query(`DELETE FROM user_packs WHERE user_id = $1 AND pack_id = $2`, [
        bob,
        packs.paidDraftListed,
      ]);
    });

    it('denies an anonymous or malformed subject without touching the database', async () => {
      expect(isLearnerUserId(null)).toBe(false);
      expect(isLearnerUserId('')).toBe(false);
      expect(isLearnerUserId('release_fixture')).toBe(false);
      expect(isLearnerUserId("'; DROP TABLE packs; --")).toBe(false);
      expect(isLearnerUserId(alice)).toBe(true);
      // A non-uuid subject must deny, not raise 22P02 and turn authorization into a 500.
      await expect(canLearnerAccessPack(pool, packs.freeStart, 'release_fixture')).resolves.toBe(
        false,
      );
      await expect(
        canLearnerAccessContentId(pool, content.freeStart, 'release_fixture'),
      ).resolves.toBe(false);
    });

    it('reports exactly the accessible packs per learner', async () => {
      await expect(readAccessiblePackIds(pool, bob)).resolves.toEqual([packs.freeStart]);
      await expect(readAccessiblePackIds(pool, alice)).resolves.toEqual([
        packs.freeStart,
        packs.paidListed,
        packs.paidUnlisted,
      ]);
    });
  });

  describe('adversarial edges', () => {
    it.each(['draft', 'needs_review', 'approved', 'archived', 'deprecated'])(
      'denies a pack in lifecycle state %s even when entitled',
      async (status) => {
        // M1.6 added these states. Only 'published' may serve content, so a pack pulled back for
        // review or retired stops serving immediately without anyone revoking entitlements.
        await pool.query(`UPDATE packs SET status = $2 WHERE id = $1`, [packs.paidListed, status]);
        await expect(canLearnerAccessPack(pool, packs.paidListed, alice)).resolves.toBe(false);
        await expect(canLearnerAccessContentId(pool, content.paidListed, alice)).resolves.toBe(
          false,
        );
        expect((await readStoreCatalogue(pool, alice)).map((p) => p.id)).not.toContain(
          packs.paidListed,
        );
        await pool.query(`UPDATE packs SET status = 'published' WHERE id = $1`, [packs.paidListed]);
      },
    );

    it('grants a card that also sits in a free published pack', async () => {
      // Membership is many-to-many. A card reachable through ANY accessible pack is accessible;
      // asserting it makes that a decision rather than an accident of the join.
      await pool.query(`INSERT INTO pack_cards (pack_id, card_id) VALUES ($1,$2)`, [
        packs.freeStart,
        cardUuid(2),
      ]);
      await expect(canLearnerAccessContentId(pool, content.paidListed, bob)).resolves.toBe(true);
      await pool.query(`DELETE FROM pack_cards WHERE pack_id = $1 AND card_id = $2`, [
        packs.freeStart,
        cardUuid(2),
      ]);
      await expect(canLearnerAccessContentId(pool, content.paidListed, bob)).resolves.toBe(false);
    });

    it("treats another learner's entitlement as irrelevant", async () => {
      // Alice owns it; Bob must not inherit access from the row existing at all.
      const owned = await pool.query(`SELECT count(*) AS n FROM user_packs WHERE pack_id = $1`, [
        packs.paidListed,
      ]);
      expect(Number(owned.rows[0].n)).toBe(1);
      await expect(canLearnerAccessPack(pool, packs.paidListed, bob)).resolves.toBe(false);
    });

    it('binds a hostile content id instead of interpolating it', async () => {
      await expect(canLearnerAccessContentId(pool, "' OR 1=1 --", alice)).resolves.toBe(false);
      // The table is still there, i.e. nothing was executed as SQL.
      const alive = await pool.query(`SELECT count(*) AS n FROM packs`);
      expect(Number(alive.rows[0].n)).toBe(4);
    });
  });

  describe('protected content media follows the same boundary', () => {
    it('allows media for a free published pack', async () => {
      await expect(canLearnerAccessContentId(pool, content.freeStart, bob)).resolves.toBe(true);
    });

    it('denies media for a paid pack the learner is not entitled to', async () => {
      await expect(canLearnerAccessContentId(pool, content.paidListed, bob)).resolves.toBe(false);
    });

    it('allows media for a paid pack the learner owns', async () => {
      await expect(canLearnerAccessContentId(pool, content.paidListed, alice)).resolves.toBe(true);
    });

    it('denies media for a listed but unpublished pack', async () => {
      for (const learner of [alice, bob]) {
        await expect(
          canLearnerAccessContentId(pool, content.paidDraftListed, learner),
        ).resolves.toBe(false);
      }
    });

    it('denies media for a content id that does not exist', async () => {
      await expect(canLearnerAccessContentId(pool, 'no-such-card', alice)).resolves.toBe(false);
    });
  });

  describe('learner Store catalogue', () => {
    it('shows only packs that are BOTH published and listed', async () => {
      const ids = (await readStoreCatalogue(pool, bob)).map((p) => p.id);
      expect(ids).toEqual([packs.freeStart, packs.paidListed]);
      // Listed but unpublished: never advertised.
      expect(ids).not.toContain(packs.paidDraftListed);
      // Published but unlisted: not in the shop window.
      expect(ids).not.toContain(packs.paidUnlisted);
    });

    it('derives `owned` from content access, never from listing state', async () => {
      const forBob = await readStoreCatalogue(pool, bob);
      const forAlice = await readStoreCatalogue(pool, alice);
      expect(forBob.map((p) => [p.id, p.owned])).toEqual([
        [packs.freeStart, true],
        [packs.paidListed, false],
      ]);
      expect(forAlice.map((p) => [p.id, p.owned])).toEqual([
        [packs.freeStart, true],
        [packs.paidListed, true],
      ]);
    });

    it('leaks no protected content through the catalogue', async () => {
      const [pack] = await readStoreCatalogue(pool, bob);
      expect(Object.keys(pack).sort()).toEqual(
        [
          'category',
          'commercialSummary',
          'coverObjectKey',
          'displayOrder',
          'featured',
          'id',
          'isFree',
          'listedAt',
          'name',
          'owned',
          'priceTomans',
          'totalCards',
        ].sort(),
      );
      const serialized = JSON.stringify(await readStoreCatalogue(pool, bob));
      for (const leak of ['lemma', 'wort1', 'content_json', 'persianMeanings', 'cefr']) {
        expect(serialized).not.toContain(leak);
      }
    });
  });

  describe('my-packs reflects access, not listing state', () => {
    it('includes a free pack with no entitlement row', async () => {
      const mine = await readLearnerPacks(pool, bob);
      expect(mine.map((p) => p.id)).toEqual([packs.freeStart]);
      expect(mine[0].acquisition).toBe('free');
      expect(mine[0].acquiredAt).toBeNull();
    });

    it('keeps an owned pack after it is unlisted', async () => {
      const mine = await readLearnerPacks(pool, alice);
      expect(mine.map((p) => p.id)).toEqual([
        packs.freeStart,
        packs.paidListed,
        packs.paidUnlisted,
      ]);
      const unlisted = mine.find((p) => p.id === packs.paidUnlisted);
      expect(unlisted?.acquisition).toBe('purchased');
      expect(unlisted?.acquiredAt).toBeInstanceOf(Date);
    });
  });

  describe('learner read paths do not count inaccessible packs', () => {
    it('scopes the curriculum denominator to accessible packs', async () => {
      // Bob: only the free pack's single card. Alice: free + two paid packs = 3 cards.
      await expect(readCurriculumProgress(pool, bob)).resolves.toMatchObject({ total: 1 });
      await expect(readCurriculumProgress(pool, alice)).resolves.toMatchObject({ total: 3 });
    });

    it('scopes per-pack progress to accessible packs', async () => {
      await expect(readPackProgress(pool, bob)).resolves.toHaveLength(1);
      await expect(readPackProgress(pool, alice)).resolves.toHaveLength(3);
    });

    it('scopes unseen-card workload to accessible packs', async () => {
      await expect(countUnseenCatalogCards(pool, bob)).resolves.toBe(1);
      await expect(countUnseenCatalogCards(pool, alice)).resolves.toBe(3);
    });
  });
});
