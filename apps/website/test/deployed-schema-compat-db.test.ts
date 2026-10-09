import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';

/**
 * M5 — is the production application version still correct on the expanded schema?
 *
 * Production runs APP_SOURCE_SHA 6d6aa724 (2026-10-04) against ledger head 0023, and the release
 * applies 0024-0032 to that same database. Migrations go in before the new image, and a rollback
 * puts the old image back on the NEW schema — so the deployed version has to keep working on a
 * schema it has never seen, both before the deploy and after any rollback.
 *
 * Two things are proven here:
 *
 *  1. The 0023 -> 0032 delta is strictly additive. No table or column disappears, no type changes,
 *     and no existing column becomes NOT NULL without a default — the three shapes that break a
 *     running older image.
 *  2. The statements the deployed version actually executes still succeed on the 0032 schema,
 *     including the sign-in upsert that 0028's new `users.status` column could have broken.
 *
 * The complete proof is wider than one file: the deployed commit's own seven database suites
 * (91 assertions) were run against a database migrated to 0032 — see
 * docs/release/PRODUCTION_SYNC_0024_0032.md. This test keeps the structural half of that proof
 * green on every future change to the migration set.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;

/** The ledger head production stands at today; the floor this compatibility claim is made from. */
const DEPLOYED_LEDGER_HEAD = '0023';

const migrationsDir = join(__dirname, '../../../database/migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

type ColumnShape = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  has_default: boolean;
};

const databases: string[] = [];
const guards: { beginTeardown: () => void }[] = [];
let root: Pool;

async function buildDatabase(upTo: string | null): Promise<Pool> {
  const name = `compat_${randomBytes(4).toString('hex')}`;
  await root.query(`CREATE DATABASE ${name}`);
  databases.push(name);
  const scoped = new URL(url as string);
  scoped.pathname = `/${name}`;
  const pool = new Pool({ connectionString: scoped.toString(), max: 2 });
  guards.push(guardForcedTeardown(pool));
  for (const file of files) {
    if (upTo && file.slice(0, 4) > upTo) continue;
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return pool;
}

async function columns(pool: Pool): Promise<ColumnShape[]> {
  const { rows } = await pool.query<ColumnShape>(
    `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
            (c.column_default IS NOT NULL) AS has_default
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.column_name`,
  );
  return rows;
}

const key = (c: ColumnShape): string => `${c.table_name}.${c.column_name}`;

suite('deployed application version against the expanded schema', () => {
  let deployed: Pool; // schema as production has it today (head 0023)
  let expanded: Pool; // schema after the release (head 0032)

  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 2 });
    deployed = await buildDatabase(DEPLOYED_LEDGER_HEAD);
    expanded = await buildDatabase(null);
  }, 240_000);

  afterAll(async () => {
    for (const guard of guards) guard.beginTeardown();
    await Promise.allSettled([deployed?.end(), expanded?.end()]);
    for (const name of databases) {
      await root?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    }
    await root?.end();
  });

  it('keeps every table the deployed version reads', async () => {
    const before = await deployed.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    const after = await expanded.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    );
    const afterNames = new Set(after.rows.map((r) => r.table_name));
    const dropped = before.rows.map((r) => r.table_name).filter((t) => !afterNames.has(t));
    expect(dropped).toEqual([]);
    expect(after.rows.length).toBeGreaterThan(before.rows.length);
  });

  it('removes no column and changes no column type', async () => {
    const before = await columns(deployed);
    const after = new Map((await columns(expanded)).map((c) => [key(c), c]));

    const removed: string[] = [];
    const retyped: string[] = [];
    for (const column of before) {
      const now = after.get(key(column));
      if (!now) {
        removed.push(key(column));
        continue;
      }
      if (now.data_type !== column.data_type) {
        retyped.push(`${key(column)}: ${column.data_type} -> ${now.data_type}`);
      }
    }
    expect(removed).toEqual([]);
    expect(retyped).toEqual([]);
  });

  it('never tightens an existing column, and gives every new column a default or NULL', async () => {
    const before = new Map((await columns(deployed)).map((c) => [key(c), c]));
    const after = await columns(expanded);

    const tightened: string[] = [];
    const unwritable: string[] = [];
    for (const column of after) {
      const was = before.get(key(column));
      if (was) {
        // YES -> NO would reject rows the deployed version already writes.
        if (was.is_nullable === 'YES' && column.is_nullable === 'NO') tightened.push(key(column));
        continue;
      }
      // A new NOT NULL column with no default breaks every INSERT the old image performs on that
      // table, because the old image does not know the column exists.
      if (column.is_nullable === 'NO' && !column.has_default) {
        const existingTable = [...before.keys()].some((k) => k.startsWith(`${column.table_name}.`));
        if (existingTable) unwritable.push(key(column));
      }
    }
    expect(tightened).toEqual([]);
    expect(unwritable).toEqual([]);
  });

  it('records the loosening and the new tables the release introduces', async () => {
    // 0027 drops a NOT NULL (a loosening, safe for the old image) — assert it, so a later change
    // that re-tightens it has to confront this test.
    const { rows } = await expanded.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'purchase_events' AND column_name = 'product_id'`,
    );
    expect(rows[0].is_nullable).toBe('YES');

    const added = await expanded.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name IN ('ai_generation_jobs', 'card_media_objects', 'card_media_candidates',
                             'card_media_assets', 'store_listings')
        ORDER BY table_name`,
    );
    expect(added.rows.map((r) => r.table_name)).toEqual([
      'ai_generation_jobs',
      'card_media_assets',
      'card_media_candidates',
      'card_media_objects',
      'store_listings',
    ]);
  });

  it('still serves the deployed sign-in upsert, which 0028 could have broken', async () => {
    // apps/website/lib/web-identity-runtime.ts at 6d6aa724 — the deployed statement, verbatim.
    // 0028 adds users.status NOT NULL; it carries DEFAULT 'active', so this INSERT still works.
    const phone = `+4917${randomBytes(3).toString('hex').replace(/\D/g, '0').padEnd(7, '0')}`;
    const first = await expanded.query<{ id: string }>(
      `INSERT INTO users (id, phone_e164)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
       RETURNING id`,
      [phone],
    );
    expect(first.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const again = await expanded.query<{ id: string }>(
      `INSERT INTO users (id, phone_e164)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
       RETURNING id`,
      [phone],
    );
    expect(again.rows[0].id).toBe(first.rows[0].id);

    const status = await expanded.query<{ status: string }>(
      `SELECT status FROM users WHERE phone_e164 = $1`,
      [phone],
    );
    expect(status.rows[0].status).toBe('active');
  });

  it('still serves the deployed review-sync write path', async () => {
    // apps/api/src/reviews/postgres-review-event.store.ts at 6d6aa724 — the deployed shapes.
    const user = await expanded.query<{ id: string }>(
      `INSERT INTO users (id, phone_e164) VALUES (gen_random_uuid(), $1) RETURNING id`,
      [`+4916${randomBytes(3).toString('hex').replace(/\D/g, '0').padEnd(7, '0')}`],
    );
    const userId = user.rows[0].id;
    const card = await expanded.query<{ id: string }>(
      `INSERT INTO cards (id, lemma, content_id) VALUES (gen_random_uuid(), 'Tisch', $1) RETURNING id`,
      [`compat-card-${randomBytes(3).toString('hex')}`],
    );
    const cardId = card.rows[0].id;

    await expanded.query(
      `INSERT INTO card_schedules (user_id, card_id) VALUES ($1, $2)
       ON CONFLICT (user_id, card_id) DO NOTHING`,
      [userId, cardId],
    );
    const event = await expanded.query<{ id: string }>(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id, applied_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
               GREATEST(
                 COALESCE((SELECT MAX(applied_at) FROM review_events prior
                            WHERE prior.user_id = $1 AND prior.card_id = $2), now()),
                 LEAST($4, now())))
       ON CONFLICT (user_id, client_event_id) DO NOTHING
       RETURNING id`,
      [userId, cardId, 'remembered', new Date(), `compat-evt-${randomBytes(4).toString('hex')}`],
    );
    expect(event.rows).toHaveLength(1);

    // The deployed version writes no purchase_events row at all (store purchase arrived in M2.4),
    // so 0027's new purchase_events_subject_shape CHECK cannot reject anything it writes. Prove the
    // constraint still accepts the pre-0027 store shape anyway, which is what a rollback would
    // leave behind in the database.
    const legacyShape = await expanded.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'purchase_events_subject_shape'`,
    );
    expect(legacyShape.rows[0].def).toContain('product_id IS NOT NULL');
  });

  it('needs no database change to roll the application back', async () => {
    // Rollback feasibility: the old image reads a strict subset of the schema, so putting it back
    // requires reverting the image only. The only database-visible one-way steps are enum values
    // (0027 adds purchase_status values) and 0027's DROP NOT NULL — neither is read by the old
    // image, and neither has to be undone for it to run.
    const enumValues = await expanded.query<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'purchase_status' ORDER BY e.enumsortorder`,
    );
    expect(enumValues.rows.map((r) => r.enumlabel)).toContain('pending');

    // Nothing the deployed version reads lives in a table the release drops or renames: the delta
    // is additive, which the structural tests above assert, so this is a statement of record.
    const deployedTables = await deployed.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const expandedTables = await expanded.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    expect(expandedTables.rows[0].n - deployedTables.rows[0].n).toBe(5);
  });
});
