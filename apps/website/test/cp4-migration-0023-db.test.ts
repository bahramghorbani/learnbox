import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../lib/account-deletion-store';
import { reviewEventsFingerprint } from './support/review-events-fingerprint';

/**
 * LB-B35 CP4 — migration 0023 against a real Postgres: additive, idempotent, history-preserving,
 * compatible with v1.2.1 writes, and removed with the account.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dir = join(__dirname, '../../../database/migrations');
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const target = files.find((f) => f.startsWith('0023_'))!;
const before = files.filter((f) => f < '0023');
const dbName = `cp4m_${Math.random().toString(36).slice(2, 10)}`;
const sql = (f: string) => readFileSync(join(dir, f), 'utf8');

let admin: Pool;
let pool: Pool;

const snapshotTables = async () =>
  (
    await pool.query<{ table_name: string; n: number }>(
      `SELECT c.relname AS table_name,
              (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', c.relname), false, true, '')))[1]::text::int AS n
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`,
    )
  ).rows;

suite('CP4 migration 0023 (real Postgres)', () => {
  const userId = randomUUID();
  const cardId = randomUUID();
  let preTables: Array<{ table_name: string; n: number }> = [];
  let preFingerprint: Awaited<ReturnType<typeof reviewEventsFingerprint>>;

  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 4 });
    for (const f of before) await pool.query(sql(f));
    // Legacy data written by v1.2.1 BEFORE the migration.
    await pool.query(`INSERT INTO users (id, phone_e164, first_name) VALUES ($1, $2, 'Old')`, [
      userId,
      `+4915${Math.floor(Math.random() * 1e8)}`,
    ]);
    await pool.query(
      `INSERT INTO cards (id, lemma, content_id) VALUES ($1, 'Haus', 'cp4-fixture-haus')`,
      [cardId],
    );
    for (const grade of ['forgot', 'hard', 'remembered', 'mastered']) {
      await pool.query(
        `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
         VALUES ($1, $2, $3, $4, '2026-09-29T20:29:59Z', $5)`,
        [randomUUID(), userId, cardId, grade, randomUUID()],
      );
    }
    preTables = await snapshotTables();
    preFingerprint = await reviewEventsFingerprint(pool, userId);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('is the next forward-only migration and contains no destructive statement', () => {
    expect(target).toBe('0023_learning_persistence.sql');
    const body = sql(target)
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(body).not.toMatch(/\b(DROP|TRUNCATE|RENAME)\b/i);
    expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
    expect(body).not.toMatch(/ALTER\s+COLUMN/i);
  });

  it('applies on top of a populated database without changing any existing row or history', async () => {
    await pool.query(sql(target));
    const post = await snapshotTables();
    for (const row of preTables) {
      expect(post.find((t) => t.table_name === row.table_name)?.n, row.table_name).toBe(row.n);
    }
    expect(await reviewEventsFingerprint(pool, userId)).toEqual(preFingerprint);
    const { rows } = await pool.query(
      `SELECT response, engine_version FROM review_events WHERE user_id = $1`,
      [userId],
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toEqual({ response: null, engine_version: null });
    const u = await pool.query(`SELECT timezone, first_name FROM users WHERE id = $1`, [userId]);
    expect(u.rows[0]).toEqual({ timezone: null, first_name: 'Old' });
  });

  it('is idempotent: a second application changes neither schema nor rows', async () => {
    const schema = async () =>
      (
        await pool.query(
          `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
            WHERE table_schema = 'public' ORDER BY 1, 2`,
        )
      ).rows;
    const constraints = async () =>
      (
        await pool.query(
          `SELECT conrelid::regclass::text AS t, conname FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
        )
      ).rows;
    const s1 = await schema();
    const c1 = await constraints();
    const t1 = await snapshotTables();
    await pool.query(sql(target));
    expect(await schema()).toEqual(s1);
    expect(await constraints()).toEqual(c1);
    expect(await snapshotTables()).toEqual(t1);
  });

  it('keeps the four-value grade CHECK: binary values are not valid legacy grades', async () => {
    for (const bad of ['known', 'unknown', 'good']) {
      await expect(
        pool.query(
          `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
           VALUES ($1, $2, $3, $4, now(), $5)`,
          [randomUUID(), userId, cardId, bad, randomUUID()],
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('a v1.2.1 write (legacy columns only) still succeeds and leaves the new columns NULL', async () => {
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
       VALUES ($1, $2, $3, 'remembered', now(), $4)`,
      [randomUUID(), userId, cardId, randomUUID()],
    );
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM review_events WHERE user_id = $1 AND response IS NULL`,
      [userId],
    );
    expect(rows[0].n).toBe(5);
  });

  it('accepts a binary response with a shadow grade and rejects anything else', async () => {
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, response, engine_version, occurred_at, client_event_id)
       VALUES ($1, $2, $3, 'remembered', 'known', 2, now(), $4)`,
      [randomUUID(), userId, cardId, randomUUID()],
    );
    for (const bad of ['Known', 'good', 'remembered', '']) {
      await expect(
        pool.query(
          `INSERT INTO review_events (id, user_id, card_id, grade, response, occurred_at, client_event_id)
           VALUES ($1, $2, $3, 'forgot', $4, now(), $5)`,
          [randomUUID(), userId, cardId, bad, randomUUID()],
        ),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      pool.query(`UPDATE review_events SET engine_version = 0 WHERE user_id = $1`, [userId]),
    ).rejects.toThrow(/check constraint/);
  });

  it('timezone: stores an IANA name, never changes an event timestamp when it changes', async () => {
    const stamps = async () =>
      (
        await pool.query(
          `SELECT id, occurred_at FROM review_events WHERE user_id = $1 ORDER BY id`,
          [userId],
        )
      ).rows;
    const t0 = await stamps();
    await pool.query(`UPDATE users SET timezone = 'Asia/Tehran' WHERE id = $1`, [userId]);
    await pool.query(`UPDATE users SET timezone = 'Europe/Berlin' WHERE id = $1`, [userId]);
    expect(await stamps()).toEqual(t0);
    await expect(
      pool.query(`UPDATE users SET timezone = $2 WHERE id = $1`, [userId, 'x'.repeat(65)]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      pool.query(`UPDATE users SET timezone = '' WHERE id = $1`, [userId]),
    ).rejects.toThrow(/check constraint/);
  });

  it('learner_daily_plans: one row per learner-local day; a second insert does not overwrite', async () => {
    const insert = (ids: string[]) =>
      pool.query(
        `INSERT INTO learner_daily_plans (user_id, local_day, time_zone, new_card_ids)
         VALUES ($1, '2026-10-02', 'Asia/Tehran', $2::uuid[])
         ON CONFLICT (user_id, local_day) DO NOTHING`,
        [userId, ids],
      );
    expect((await insert([cardId])).rowCount).toBe(1);
    expect((await insert([randomUUID()])).rowCount).toBe(0);
    const { rows } = await pool.query(
      `SELECT new_card_ids FROM learner_daily_plans WHERE user_id = $1`,
      [userId],
    );
    expect(rows[0].new_card_ids).toEqual([cardId]);
  });

  it('review_event_rejections accepts only bounded reason codes and holds no payload column', async () => {
    await pool.query(
      `INSERT INTO review_event_rejections (user_id, client_event_id, reason) VALUES ($1, $2, 'validation')`,
      [userId, randomUUID()],
    );
    await expect(
      pool.query(
        `INSERT INTO review_event_rejections (user_id, client_event_id, reason) VALUES ($1, $2, 'free text')`,
        [userId, randomUUID()],
      ),
    ).rejects.toThrow(/check constraint/);
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'review_event_rejections' ORDER BY 1`,
    );
    expect(cols.rows.map((r) => r.column_name)).toEqual([
      'client_event_id',
      'id',
      'reason',
      'received_at',
      'user_id',
    ]);
  });

  it('account deletion removes plan and rejection rows together with the learner', async () => {
    const outcome = await deleteAccount(pool, {
      userId,
      subjectHash: 'a'.repeat(64),
      actor: 'learner',
      requestedAt: new Date(),
      requestId: randomUUID(),
    });
    expect(outcome.status).toBe('deleted');
    for (const table of ['learner_daily_plans', 'review_event_rejections']) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      expect(rows[0].n, table).toBe(0);
    }
  });
});
