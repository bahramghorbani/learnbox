import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  runDatabaseMigrations,
  type DatabaseMigration,
  type MigrationClient,
} from '../src/database/migration-runner';

/**
 * M5 — the full migration set, applied by the REAL runner to a REAL isolated Postgres, plus the
 * partial-failure recovery behaviour the release depends on.
 *
 * Production stands at ledger head 0033; 0034 (the Admin pack metadata grants) is the next
 * migration it must take. Two properties have to hold before that is safe:
 *
 *  1. The whole set applies to an empty database, is idempotent on a second run, and the ledger
 *     ends at the newest migration on disk.
 *  2. A migration that was interrupted — or applied out of band by an operator with psql — can be
 *     re-run. 0026 created `store_listings` with a bare `CREATE TABLE`, so a retry hit
 *     "relation already exists" (42P07) forever and the release could only be rescued by hand.
 *
 * Requires TEST_DATABASE_URL; hard-fails in CI if absent.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;

const migrationsDir = join(__dirname, '../../../database/migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const allMigrations: DatabaseMigration[] = files.map((file) => ({
  version: file.replace(/\.sql$/, ''),
  sql: readFileSync(join(migrationsDir, file), 'utf8'),
}));

let root: Pool;
const scratchDatabases: string[] = [];

/** A throwaway database plus a MigrationClient view of it, as the real runner consumes. */
async function freshDatabase(): Promise<{ pool: Pool; client: MigrationClient; name: string }> {
  const name = `mig_${randomBytes(4).toString('hex')}`;
  await root.query(`CREATE DATABASE ${name}`);
  scratchDatabases.push(name);
  const scoped = new URL(url as string);
  scoped.pathname = `/${name}`;
  const pool = new Pool({ connectionString: scoped.toString(), max: 1 });
  // max: 1 keeps BEGIN/COMMIT on the single connection the runner assumes.
  const client: MigrationClient = {
    query: (sql, parameters) =>
      pool.query(sql, parameters as unknown[]) as unknown as ReturnType<MigrationClient['query']>,
  };
  return { pool, client, name };
}

suite('migrations 0001-0034 in an isolated database', () => {
  beforeAll(() => {
    root = new Pool({ connectionString: url, max: 2 });
  });

  afterAll(async () => {
    for (const name of scratchDatabases) {
      await root?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    }
    await root?.end();
  });

  it('applies the complete set to an empty database and is idempotent on a second run', async () => {
    const { pool, client } = await freshDatabase();
    try {
      const first = await runDatabaseMigrations(client, allMigrations);
      expect(first.applied).toBe(allMigrations.length);

      const ledger = await pool.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(ledger.rows).toHaveLength(allMigrations.length);
      expect(ledger.rows.at(-1)?.version).toBe('0034_admin_pack_metadata_grants');
      expect(ledger.rows.map((r) => r.version)).toEqual(allMigrations.map((m) => m.version));

      const second = await runDatabaseMigrations(client, allMigrations);
      expect(second.applied).toBe(0);

      const tables = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
      );
      expect(tables.rows[0].n).toBeGreaterThanOrEqual(40);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('refuses to run when a recorded migration file has been edited', async () => {
    // Why an applied migration must never be rewritten: the ledger stores the SHA-256 of the exact
    // bytes. 0026 could be corrected only because production has never recorded it.
    const { pool, client } = await freshDatabase();
    try {
      await runDatabaseMigrations(client, allMigrations);
      const tampered = allMigrations.map((m) =>
        m.version === '0026_store_listings'
          ? { ...m, sql: `${m.sql}\n-- edited after apply\n` }
          : m,
      );
      await expect(runDatabaseMigrations(client, tampered)).rejects.toThrow(
        /checksum mismatch: 0026_store_listings/,
      );
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('recovers when 0026 was already applied out of band and never recorded', async () => {
    // The exact partial-failure shape: the DDL is committed but the ledger row is missing, which is
    // what an operator applying the file with psql, or a crash between DDL and ledger insert,
    // leaves behind.
    const { pool, client } = await freshDatabase();
    try {
      const upTo0025 = allMigrations.filter((m) => m.version < '0026');
      await runDatabaseMigrations(client, upTo0025);

      const m0026 = allMigrations.find((m) => m.version === '0026_store_listings');
      expect(m0026).toBeDefined();
      await pool.query(m0026!.sql); // committed, unrecorded

      const recorded = await pool.query(
        `SELECT 1 FROM schema_migrations WHERE version = '0026_store_listings'`,
      );
      expect(recorded.rows).toHaveLength(0);
      const exists = await pool.query(`SELECT 1 FROM pg_class WHERE relname = 'store_listings'`);
      expect(exists.rows).toHaveLength(1);

      // The release re-runs the full set: 0026 must pass over its own work, not abort the release.
      const result = await runDatabaseMigrations(client, allMigrations);
      expect(result.applied).toBe(allMigrations.length - upTo0025.length);

      const ledger = await pool.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version',
      );
      expect(ledger.rows.at(-1)?.version).toBe('0034_admin_pack_metadata_grants');
      const listings = await pool.query(
        `SELECT count(*)::int AS n FROM pg_class WHERE relname = 'store_listings'`,
      );
      expect(listings.rows[0].n).toBe(1);
      const index = await pool.query(
        `SELECT count(*)::int AS n FROM pg_class WHERE relname = 'store_listings_display_idx'`,
      );
      expect(index.rows[0].n).toBe(1);
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('would have been unrecoverable with the pre-fix 0026 body', async () => {
    // Proves the `IF NOT EXISTS` change is what makes the retry above possible, rather than some
    // accident of the runner.
    const { pool } = await freshDatabase();
    try {
      const m0026 = allMigrations.find((m) => m.version === '0026_store_listings')!;
      const preFix = m0026.sql
        .replace('CREATE TABLE IF NOT EXISTS store_listings', 'CREATE TABLE store_listings')
        .replace(
          'CREATE INDEX IF NOT EXISTS store_listings_display_idx',
          'CREATE INDEX store_listings_display_idx',
        );
      expect(preFix).not.toBe(m0026.sql);

      for (const m of allMigrations.filter((x) => x.version < '0026')) await pool.query(m.sql);
      await pool.query(preFix);
      await expect(pool.query(preFix)).rejects.toMatchObject({ code: '42P07' });
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('rolls a failing migration back completely, leaving a clean retry', async () => {
    const { pool, client } = await freshDatabase();
    try {
      const broken: DatabaseMigration = {
        version: '9998_intentional_failure',
        sql: `CREATE TABLE should_not_survive (id int);\nSELECT 1 / 0;`,
      };
      await expect(runDatabaseMigrations(client, [...allMigrations, broken])).rejects.toThrow();

      const survived = await pool.query(
        `SELECT 1 FROM pg_class WHERE relname = 'should_not_survive'`,
      );
      expect(survived.rows).toHaveLength(0);
      const ledger = await pool.query(
        `SELECT 1 FROM schema_migrations WHERE version = '9998_intentional_failure'`,
      );
      expect(ledger.rows).toHaveLength(0);

      // Everything before the failure stayed applied, so the retry only needs the fixed migration.
      const head = await pool.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
      );
      expect(head.rows[0].version).toBe('0034_admin_pack_metadata_grants');
    } finally {
      await pool.end();
    }
  }, 180_000);

  it('no migration takes transaction control away from the runner', async () => {
    // A file containing its own COMMIT ends the runner's transaction early: the DDL is committed
    // before the ledger insert, so a failure in between leaves exactly the unrecorded-apply state
    // the test above has to recover from. The runner cannot defend against it, so the rule is
    // enforced on the files.
    const offenders = files.filter((file) =>
      /^\s*(BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\s*;/im.test(
        readFileSync(join(migrationsDir, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('ends with the newest migration recorded as the head of the ledger', async () => {
    expect(files.at(-1)).toBe('0034_admin_pack_metadata_grants.sql');
    const numbers = files.map((f) => Number(f.slice(0, 4)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    // The checksum the release will record, derived from the exact bytes on disk.
    const head = allMigrations.at(-1)!;
    expect(createHash('sha256').update(head.sql).digest('hex')).toMatch(/^[a-f0-9]{64}$/);
  });
});
