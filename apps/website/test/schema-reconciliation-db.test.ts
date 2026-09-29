import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../lib/account-deletion-store';

/**
 * Schema reconciliation (0022). A read-only comparison of Production against the migrations found
 * user_packs, payment_logs, payment_gateways, banners and splash_versions.image_data in Production
 * but in no migration, so a database rebuilt from migrations alone could not run account deletion.
 *
 * Runs against a real Postgres (TEST_DATABASE_URL); skipped locally without one, required in CI.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const migrationsDir = join(process.cwd(), '../../database/migrations');
const dbName = `lb_reconcile_${process.pid}_${Date.now()}`;
const USER = '11111111-0000-4000-8000-0000000000aa';

let admin: Pool;
let pool: Pool;
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const reconcile = files.find((f) => f.startsWith('0022_'));

suite('schema reconciliation 0022 (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    for (const file of files) await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin?.end();
  });

  it('a database rebuilt from migrations alone has every table the code and deletion use', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const have = new Set(rows.map((r) => r.table_name));
    for (const table of [
      'user_packs',
      'payment_logs',
      'payment_gateways',
      'banners',
      'splash_versions',
    ]) {
      expect(have.has(table), table).toBe(true);
    }
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'splash_versions' AND column_name = 'image_data'`,
    );
    expect(col.rowCount).toBe(1);
  });

  it('0022 is idempotent: re-applying changes neither rows nor schema', async () => {
    expect(reconcile).toBeDefined();
    await pool.query(
      `INSERT INTO users (id, phone_e164) VALUES ($1, '+491****0077') ON CONFLICT DO NOTHING`,
      [USER],
    );
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, status) VALUES ('p_rec', 'Rec', 35, 'published') ON CONFLICT DO NOTHING`,
    );
    await pool.query(
      `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1, 'p_rec', 'free') ON CONFLICT DO NOTHING`,
      [USER],
    );
    await pool.query(
      `INSERT INTO banners (id, title) VALUES ('banner_rec', 'Rec') ON CONFLICT DO NOTHING`,
    );
    const snapshot = async () =>
      JSON.stringify([
        (await pool.query(`SELECT * FROM user_packs ORDER BY id`)).rows,
        (await pool.query(`SELECT * FROM banners ORDER BY id`)).rows,
        (
          await pool.query(
            `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`,
          )
        ).rows,
        (
          await pool.query(
            `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
          )
        ).rows,
        (
          await pool.query(
            `SELECT conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1`,
          )
        ).rows,
      ]);
    const before = await snapshot();
    const sql = readFileSync(join(migrationsDir, reconcile as string), 'utf8');
    await pool.query(sql);
    await pool.query(sql);
    expect(await snapshot()).toBe(before);
  });

  it('0022 contains no destructive statement', () => {
    const sql = readFileSync(join(migrationsDir, reconcile as string), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+\w+\s+(ALTER|DROP|RENAME)/i);
  });

  it('real account deletion runs end to end on a migrations-only database', async () => {
    const result = await deleteAccount(pool, {
      userId: USER,
      subjectHash: 'b'.repeat(64),
      actor: 'learner',
      requestedAt: new Date('2026-09-29T12:00:00Z'),
      requestId: 'rec-1',
    });
    expect(result.status).toBe('deleted');
    const left = await pool.query(`SELECT count(*)::int n FROM users WHERE id = $1`, [USER]);
    expect(left.rows[0].n).toBe(0);
    const packs = await pool.query(`SELECT count(*)::int n FROM user_packs WHERE user_id = $1`, [
      USER,
    ]);
    expect(packs.rows[0].n).toBe(0);
  });
});
