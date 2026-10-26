import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresContentPacksStore } from '../lib/server/postgres-content-packs-store';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const ACTOR = '66666666-6666-4666-8666-666666666666';

let root: Pool;
let pool: Pool;
let database = '';

suite('content packs list excludes archived packs against real Postgres', () => {
  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    database = `content_packs_archived_${randomBytes(4).toString('hex')}`;
    await root.query(`CREATE DATABASE ${database}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${database}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    pool.on('error', () => undefined);

    const dir = join(__dirname, '../../../database/migrations');
    for (const f of readdirSync(dir)
      .filter((x) => /^\d{4}_.+\.sql$/.test(x))
      .sort()) {
      await pool.query(readFileSync(join(dir, f), 'utf8'));
    }

    await pool.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1,'+491****0099','reviewer')`,
      [ACTOR],
    );
    await pool.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_reviewer')`,
      [ACTOR],
    );
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, category, is_free, status)
       VALUES ('live-pack', 'Live Pack', 1, 'essentials', true, 'published'),
              ('retired-pack', 'Retired Pack', 1, 'essentials', true, 'archived')`,
    );
  });

  afterAll(async () => {
    await pool?.end();
    await root?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root?.end();
  }, 60_000);

  it('lists the live pack but not the archived one', async () => {
    const store = new PostgresContentPacksStore(pool);
    const result = await store.listPacks(ACTOR);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.packs.map((p) => p.id)).toEqual(['live-pack']);
  });
});
