import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresDictionaryEditorialStore } from '../lib/server/postgres-dictionary-editorial-store.js';

/**
 * The dictionary editorial store against a REAL Postgres with every migration applied. The route
 * tests use a fake store, so they could not see that Postgres rejects an untyped parameter inside
 * `jsonb_build_object` (42P18) — which broke every create and edit until this suite existed.
 * Requires TEST_DATABASE_URL (creates and drops its own database).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `dict_${Math.random().toString(36).slice(2, 10)}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const superAdmin = randomUUID();
const outsider = randomUUID();

let owner: PgPool;
let pool: PgPool;
let store: PostgresDictionaryEditorialStore;

beforeAll(async () => {
  if (!url) return;
  const { Pool } = await import('pg');
  owner = new Pool({ connectionString: url, max: 1 });
  owner.on('error', () => undefined);
  await owner.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);
  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort())
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  await pool.query(`INSERT INTO users (id, phone_e164) VALUES ($1, $2), ($3, $4)`, [
    superAdmin,
    '+989****6101',
    outsider,
    '+989****6102',
  ]);
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super_admin')`,
    [superAdmin],
  );
  store = new PostgresDictionaryEditorialStore(pool as never);
});

afterAll(async () => {
  await pool?.end();
  await owner?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await owner?.end();
});

suite('dictionary editorial store (real Postgres)', () => {
  it('creates, replays, rejects duplicates, edits, approves and audits', async () => {
    const input = {
      dictionaryKey: 'Haus',
      aiPayload: { lemma: 'Haus', senses: [{ fa: 'خانه' }] },
      source: 'test',
      model: 'm',
      costMetadata: { reviewVerdict: 'ok' },
      idempotencyKey: randomUUID(),
    };
    const created = await store.create(superAdmin, input);
    expect(created.status).toBe('applied');
    const id = (created as { item: { id: string } }).item.id;

    expect((await store.create(superAdmin, input)).status).toBe('idempotent');
    expect(
      (await store.create(superAdmin, { ...input, idempotencyKey: randomUUID() })).status,
    ).toBe('duplicate');
    expect((await store.create(outsider, { ...input, idempotencyKey: randomUUID() })).status).toBe(
      'forbidden',
    );

    const edited = await store.update(superAdmin, id, {
      revision: 1,
      manualPayload: { lemma: 'Haus', senses: [{ fa: 'خانه، منزل' }] },
      status: 'approved',
      idempotencyKey: randomUUID(),
    });
    expect(edited).toMatchObject({ status: 'applied', item: { status: 'approved', revision: 2 } });
    expect(
      (
        await store.update(superAdmin, id, {
          revision: 1,
          status: 'deleted',
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe('conflict');

    const audits = await pool.query(
      `SELECT action, metadata FROM audit_logs WHERE entity_id = $1 ORDER BY created_at`,
      [id],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      'dictionary_editorial.create',
      'dictionary_editorial.update',
    ]);
    expect(audits.rows[0].metadata.dictionary_key).toBe('Haus');
    expect(audits.rows[1].metadata.revision).toBe(2);
  });
});
