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

  it('seeds a release as approved without overwriting, and searches one bounded page', async () => {
    const records = [
      { dictionaryKey: 'Baum', payload: { lemma: 'Baum', freq: 5, senses: [{ fa: 'درخت' }] } },
      { dictionaryKey: 'Bäume_%', payload: { lemma: 'Bäume_%', freq: 1, senses: [{ fa: 'x' }] } },
      { dictionaryKey: 'a\\b', payload: { lemma: 'a\\b', senses: [{ fa: 'y' }] } },
      // Already owned by the editorial record from the first test: must stay as it is.
      { dictionaryKey: 'Haus', payload: { lemma: 'Haus', senses: [{ fa: 'OVERWRITE' }] } },
    ];
    const seedKey = randomUUID();
    const seeded = await store.seed(superAdmin, {
      records,
      source: 'release/t',
      idempotencyKey: seedKey,
    });
    expect(seeded).toEqual({ status: 'applied', inserted: 3 });
    expect(
      await store.seed(superAdmin, { records, source: 'release/t', idempotencyKey: seedKey }),
    ).toEqual({ status: 'idempotent', inserted: 0 });
    expect(
      (await store.seed(outsider, { records, source: 'r', idempotencyKey: randomUUID() })).status,
    ).toBe('forbidden');

    const page = async (q: string, filter: 'all' | 'review' | 'ai' | 'deleted' = 'all') => {
      const result = await store.list(superAdmin, { q, filter, limit: 50 });
      if (result.status !== 'ok') throw new Error('forbidden');
      return result;
    };
    const haus = (await page('Haus')).items[0]!;
    expect(haus.manualPayload).toMatchObject({ senses: [{ fa: 'خانه، منزل' }] });
    expect((await page('baum')).items.map((x) => x.dictionaryKey)).toEqual(['Baum']);
    expect((await page('درخت')).items.map((x) => x.dictionaryKey)).toEqual(['Baum']);
    // LIKE wildcards in the query are literal: «B_um» must not match «Baum».
    expect((await page('B_um')).items).toEqual([]);
    expect((await page('Bäume_')).items.map((x) => x.dictionaryKey)).toEqual(['Bäume_%']);
    expect((await page('')).total).toBe(4);
    expect((await page('a\\b')).items.map((x) => x.dictionaryKey)).toEqual(['a\\b']);
    const one = await store.list(superAdmin, { q: '', filter: 'all', limit: 1 });
    expect(one.status === 'ok' && one.items.length).toBe(1);
    expect((await page('', 'ai')).items.map((x) => x.dictionaryKey)).toEqual(['Haus']);
    expect((await page('', 'review')).items).toEqual([]);

    const flagged = await store.create(superAdmin, {
      dictionaryKey: 'Weg',
      aiPayload: { lemma: 'Weg', senses: [{ fa: 'راه' }] },
      source: 'ai',
      model: 'm',
      costMetadata: { reviewVerdict: 'fixed' },
      status: 'approved',
      idempotencyKey: randomUUID(),
    });
    expect(flagged).toMatchObject({ status: 'applied', item: { status: 'approved' } });
    expect((await page('', 'review')).items.map((x) => x.dictionaryKey)).toEqual(['Weg']);
    const weg = (flagged as { item: { id: string } }).item.id;
    await store.update(superAdmin, weg, {
      revision: 1,
      status: 'deleted',
      idempotencyKey: randomUUID(),
    });
    expect((await page('', 'review')).items).toEqual([]);
    expect((await page('', 'deleted')).items.map((x) => x.dictionaryKey)).toEqual(['Weg']);
    expect((await page('Weg')).items).toEqual([]);
    expect((await store.list(outsider, { q: '', filter: 'all', limit: 5 })).status).toBe(
      'forbidden',
    );
  });
});
