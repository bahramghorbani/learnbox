import { randomBytes } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StorePackCoverService } from '../lib/server/store-pack-cover-service';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const ACTOR = '55555555-5555-4555-8555-555555555555';
const PACK = 'pack-fixture';
const CANDIDATE = '44444444-4444-4444-8444-444444444444';

let root: Pool;
let pool: Pool;
let database = '';

suite('store pack cover accept against real Postgres', () => {
  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    database = `cover_accept_${randomBytes(4).toString('hex')}`;
    await root.query(`CREATE DATABASE ${database}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${database}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    pool.on('error', () => undefined);
    await pool.query(`
      CREATE TABLE admin_role_assignments (user_id uuid NOT NULL, role text NOT NULL);
      CREATE TABLE packs (id text PRIMARY KEY, display_name text NOT NULL, category text);
      CREATE TABLE store_listings (
        pack_id text PRIMARY KEY, store_status text NOT NULL DEFAULT 'unlisted',
        featured boolean NOT NULL DEFAULT false, display_order integer NOT NULL DEFAULT 0,
        cover_object_key text, commercial_summary text, listed_at timestamptz
      );
      CREATE TABLE store_pack_cover_objects (
        object_key text PRIMARY KEY, media_type text NOT NULL, byte_size integer NOT NULL,
        checksum text NOT NULL, bytes bytea NOT NULL
      );
      CREATE TABLE store_pack_cover_candidates (
        id uuid PRIMARY KEY, pack_id text NOT NULL, object_key text NOT NULL,
        status text NOT NULL DEFAULT 'ready', source text NOT NULL, provider text, model text,
        accepted_by_user_id uuid, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`INSERT INTO admin_role_assignments VALUES ($1, 'super_admin')`, [ACTOR]);
    await pool.query(`INSERT INTO packs (id, display_name) VALUES ($1, 'Fixture Pack')`, [PACK]);
    await pool.query(
      `INSERT INTO store_pack_cover_objects (object_key, media_type, byte_size, checksum, bytes)
       VALUES ('k1', 'image/png', 1, 'c1', '\\x00')`,
    );
    await pool.query(
      `INSERT INTO store_pack_cover_candidates (id, pack_id, object_key, source) VALUES ($1, $2, 'k1', 'upload')`,
      [CANDIDATE, PACK],
    );
  });

  afterAll(async () => {
    await pool?.end();
    await root?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root?.end();
  });

  it('creates the store_listings row when accepting a cover before the pack is ever listed', async () => {
    // Regression: accept() used to UPDATE store_listings and silently no-op when the pack
    // had no listing row yet, reporting success while the cover never reached the Store/app.
    const service = new StorePackCoverService(pool as never);
    await expect(service.accept(PACK, CANDIDATE, ACTOR)).resolves.toBe('accepted');
    await expect(
      pool.query(`SELECT cover_object_key, store_status FROM store_listings WHERE pack_id=$1`, [
        PACK,
      ]),
    ).resolves.toMatchObject({ rows: [{ cover_object_key: 'k1', store_status: 'unlisted' }] });
  });
});
