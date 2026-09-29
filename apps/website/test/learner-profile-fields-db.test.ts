import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount } from '../lib/account-deletion-store';
import {
  applyProfileUpdate,
  parseProfileUpdate,
  readProfileDetails,
} from '../lib/learner-profile-fields';

/**
 * LB-B28a / CP-7 acceptance against a REAL Postgres with every repo migration applied.
 * Proves: 0021 is forward-only and preserves existing rows; the columns are optional;
 * the DB itself rejects bad values; partial updates touch only their columns; phone is
 * never changed; and account deletion removes the new personal data with the user row.
 *
 * Requires TEST_DATABASE_URL (empty database). Hard failure, not a skip, in CI.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const dbName = `cp7_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const OLD = '11111111-1111-4111-8111-111111111111';
const NEW = '22222222-2222-4222-8222-222222222222';
const DEL = '33333333-3333-4333-8333-333333333333';
const today = new Date('2026-09-29T12:00:00Z');

let admin: Pool;
let pool: Pool;

const update = (body: unknown) => {
  const parsed = parseProfileUpdate(body, today);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.update;
};

suite('learner profile fields (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });

    // Apply everything BEFORE 0021, create a pre-existing account, then apply 0021.
    for (const file of files.filter((f) => f < '0021')) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+491****0001', 'قدیمی')`,
      [OLD],
    );
    for (const file of files.filter((f) => f >= '0021')) {
      await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    await pool.query(`INSERT INTO users (id, phone_e164) VALUES ($1, '+491****0002')`, [NEW]);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin?.end();
  });

  it('0021 exists and re-applying it is a no-op (idempotent, forward-only)', async () => {
    expect(files).toContain('0021_learner_profile_fields.sql');
    const sql = readFileSync(join(migrationsDir, '0021_learner_profile_fields.sql'), 'utf8');
    await pool.query(sql);
    await pool.query(sql);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b\s+(TABLE|COLUMN|FROM)/i);
  });

  it('preserves a pre-existing account exactly: same phone and name, new fields NULL', async () => {
    const row = (await pool.query('SELECT * FROM users WHERE id = $1', [OLD])).rows[0];
    expect(row.phone_e164).toBe('+491****0001');
    expect(row.first_name).toBe('قدیمی');
    expect(row.last_name).toBeNull();
    expect(row.date_of_birth).toBeNull();
    expect(row.gender).toBeNull();
    expect(row.avatar_id).toBeNull();
  });

  it('every field is optional: a new account needs none of them', async () => {
    expect(await readProfileDetails(pool, NEW)).toEqual({
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      gender: null,
      avatarId: null,
    });
  });

  it('round-trips all fields; date of birth comes back as a date string, not an age', async () => {
    const saved = await applyProfileUpdate(
      pool,
      NEW,
      update({
        firstName: 'سارا',
        lastName: 'احمدی',
        dateOfBirth: '1998-03-21',
        gender: 'prefer_not_to_say',
        avatarId: 'bobo-focus',
      }),
    );
    expect(saved).toEqual({
      firstName: 'سارا',
      lastName: 'احمدی',
      dateOfBirth: '1998-03-21',
      gender: 'prefer_not_to_say',
      avatarId: 'bobo-focus',
    });
    expect(await readProfileDetails(pool, NEW)).toEqual(saved);
    const columns = (
      await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
      )
    ).rows.map((r) => r.column_name);
    expect(columns).not.toContain('age');
  });

  it('a partial update touches only its own column; clearing sets NULL', async () => {
    await applyProfileUpdate(pool, NEW, update({ gender: 'female' }));
    let details = await readProfileDetails(pool, NEW);
    expect(details).toMatchObject({ gender: 'female', firstName: 'سارا', avatarId: 'bobo-focus' });
    await applyProfileUpdate(pool, NEW, update({ avatarId: null, lastName: '' }));
    details = await readProfileDetails(pool, NEW);
    expect(details).toMatchObject({ avatarId: null, lastName: null, gender: 'female' });
  });

  it('phone is never changed by any profile update', async () => {
    await applyProfileUpdate(pool, NEW, update({ firstName: 'تغییر' }));
    const phone = (await pool.query('SELECT phone_e164 FROM users WHERE id = $1', [NEW])).rows[0]
      .phone_e164;
    expect(phone).toBe('+491****0002');
    expect(parseProfileUpdate({ phone: '+491****9999' }, today)).toEqual({
      ok: false,
      error: 'unsupported_field',
    });
  });

  it("an update for one account never touches another account's row", async () => {
    const before = (await pool.query('SELECT * FROM users WHERE id = $1', [OLD])).rows[0];
    await applyProfileUpdate(pool, NEW, update({ lastName: 'دیگری', gender: 'male' }));
    expect((await pool.query('SELECT * FROM users WHERE id = $1', [OLD])).rows[0]).toEqual(before);
  });

  it('the database itself rejects values the API layer would never send', async () => {
    const bad = async (sql: string) =>
      expect(pool.query(sql, [NEW])).rejects.toThrow(/violates check constraint/);
    await bad(`UPDATE users SET gender = 'attack-helicopter' WHERE id = $1`);
    await bad(`UPDATE users SET avatar_id = '../../etc/passwd' WHERE id = $1`);
    await bad(`UPDATE users SET date_of_birth = '1850-01-01' WHERE id = $1`);
    await bad(`UPDATE users SET last_name = '' WHERE id = $1`);
    await bad(`UPDATE users SET last_name = repeat('x', 51) WHERE id = $1`);
  });

  it('account deletion removes the new personal data together with the user row', async () => {
    await pool.query(`INSERT INTO users (id, phone_e164) VALUES ($1, '+491****0003')`, [DEL]);
    await applyProfileUpdate(
      pool,
      DEL,
      update({
        firstName: 'حذف',
        lastName: 'شونده',
        dateOfBirth: '1990-01-01',
        gender: 'other',
        avatarId: 'bobo-welcome',
      }),
    );
    expect((await readProfileDetails(pool, DEL))?.dateOfBirth).toBe('1990-01-01');

    const outcome = await deleteAccount(pool, {
      userId: DEL,
      subjectHash: 'a'.repeat(64),
      actor: 'learner',
      requestedAt: new Date('2026-09-29T12:00:00Z'),
      requestId: 'cp7-del-1',
    });
    expect(outcome.status).toBe('deleted');
    expect(await readProfileDetails(pool, DEL)).toBeNull();

    // No copy of the personal data survives anywhere in the deletion audit record.
    const audit = JSON.stringify(
      (
        await pool.query('SELECT * FROM account_deletion_events WHERE request_id = $1', [
          'cp7-del-1',
        ])
      ).rows,
    );
    for (const secret of ['حذف', 'شونده', '1990-01-01', 'bobo-welcome']) {
      expect(audit).not.toContain(secret);
    }
    // The other accounts are untouched.
    expect(await readProfileDetails(pool, NEW)).not.toBeNull();
  });
});
