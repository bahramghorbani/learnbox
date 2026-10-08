import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresSplashStore } from '../../admin/lib/server/postgres-splash-store';
import { createLaunchSplashRoute, readLaunchSplashConfig } from '../lib/launch-splash';

/**
 * Phase 4 / Milestone 4.1 — splash delivery and revert-to-default against a REAL Postgres with
 * every repo migration applied.
 *
 * This suite exists because of a defect that every unit test in the repo was happy to allow:
 * Production had a promoted splash whose bytes live in `splash_versions.image_data`, no
 * `BLOB_READ_WRITE_TOKEN`, and a config that refused to build the route without that token — so the
 * learner endpoint answered 404 and the owner's splash was invisible. The real learner route is
 * exercised here against real rows, so "the Admin promoted it" and "a learner receives it" are
 * proven to be the same fact.
 *
 * What it is built to catch:
 *   - a promoted splash that the learner route will not deliver without a blob token
 *   - an UNPROMOTED version becoming deliverable (the pointer, not the upload, is the authority)
 *   - a revert that fails to deactivate, or that is not audited
 *   - a revert that deletes version history or image bytes (evidence destruction)
 *   - a repeated revert that is not a no-op
 *   - a reverted splash that can no longer be re-promoted
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m41_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

let pool: PgPool;
let admin: PgPool;
let store: PostgresSplashStore;

const promotedId = randomUUID();
const unpromotedId = randomUUID();
const promotedBytes = Buffer.from('promoted-splash-bytes');
const unpromotedBytes = Buffer.from('never-promoted-bytes');

/** The learner route exactly as the website builds it when no blob token exists. */
function learnerRoute() {
  return createLaunchSplashRoute({ enabled: true, pool, readBlob: undefined });
}

async function promote(versionId: string) {
  await pool.query(
    `INSERT INTO current_splash (singleton_id, version_id, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (singleton_id) DO UPDATE SET version_id = $1, updated_at = now()`,
    [versionId],
  );
}

async function auditRows() {
  const result = await pool.query(
    `SELECT action, entity_type, entity_id, actor_user_id, metadata
       FROM audit_logs
      WHERE action = 'splash.reverted'
      ORDER BY created_at`,
  );
  return result.rows;
}

async function versionInventory() {
  const result = await pool.query<{
    id: string;
    byte_size: number;
    has_bytes: boolean;
    object_key: string;
  }>(
    `SELECT id, byte_size, image_data IS NOT NULL AS has_bytes, object_key
       FROM splash_versions ORDER BY created_at`,
  );
  return result.rows;
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);

  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  // Two uploaded versions, bytes in the canonical column, as the Admin replacement path writes
  // them. Only one is ever promoted.
  for (const [id, bytes, key] of [
    [promotedId, promotedBytes, 'admin/splash/m41-promoted.webp'],
    [unpromotedId, unpromotedBytes, 'admin/splash/m41-unpromoted.webp'],
  ] as const) {
    await pool.query(
      `INSERT INTO splash_versions
         (id, object_key, checksum, width, height, byte_size, media_type, image_data, created_at)
       VALUES ($1, $2, $3, 864, 1821, $4, 'image/webp', $5, now())`,
      [id, key, randomUUID().replace(/-/g, '').padEnd(64, '0'), bytes.byteLength, bytes],
    );
  }

  store = new PostgresSplashStore(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
});

suite('M4.1 splash delivery and revert to bundled default', () => {
  it('delivers the promoted version from the database with no blob token configured', async () => {
    await promote(promotedId);

    const config = readLaunchSplashConfig({
      LEARNBOX_DYNAMIC_SPLASH_ENABLED: 'true',
      DATABASE_URL: 'postgresql://learnbox@example.neon.tech/learnbox',
    });
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('blobToken');

    const response = await learnerRoute()();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer()).equals(promotedBytes)).toBe(true);
  });

  it('never delivers an uploaded version that was not promoted', async () => {
    const response = await learnerRoute()();
    const body = Buffer.from(await response.arrayBuffer());

    expect(body.equals(promotedBytes)).toBe(true);
    expect(body.includes(unpromotedBytes)).toBe(false);
  });

  it('reverts to the bundled default, audits it, and keeps every version and its bytes', async () => {
    const before = await versionInventory();
    const actionsBefore = await pool.query('SELECT count(*) AS c FROM splash_replacement_actions');

    await expect(store.revertToBundledDefault({ now: new Date() })).resolves.toEqual({
      status: 'reverted',
      versionId: promotedId,
    });

    // The learner falls back to the approved bundled image because the endpoint is now empty.
    const response = await learnerRoute()();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const pointer = await pool.query('SELECT count(*) AS c FROM current_splash');
    expect(Number(pointer.rows[0].c)).toBe(0);

    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'splash.reverted',
      entity_type: 'splash_version',
      entity_id: promotedId,
      actor_user_id: null,
    });
    expect(audit[0].metadata).toMatchObject({ reverted_to: 'bundled_default' });

    // Nothing was destroyed: same versions, same byte sizes, bytes still present.
    expect(await versionInventory()).toEqual(before);
    expect(before.every((row) => row.has_bytes)).toBe(true);
    const actionsAfter = await pool.query('SELECT count(*) AS c FROM splash_replacement_actions');
    expect(actionsAfter.rows[0].c).toEqual(actionsBefore.rows[0].c);
  });

  it('treats a repeated revert as a no-op without a second audit record', async () => {
    const before = await versionInventory();

    await expect(store.revertToBundledDefault({ now: new Date() })).resolves.toEqual({
      status: 'already_default',
    });
    await expect(store.revertToBundledDefault({ now: new Date() })).resolves.toEqual({
      status: 'already_default',
    });

    expect(await auditRows()).toHaveLength(1);
    expect(await versionInventory()).toEqual(before);
    expect((await learnerRoute()()).status).toBe(404);
  });

  it('allows a reverted version to be promoted again, proving the revert was not destructive', async () => {
    await promote(promotedId);

    const response = await learnerRoute()();

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(promotedBytes)).toBe(true);
  });

  it('ships the least-privilege DELETE grant the revert needs', () => {
    const migration = readFileSync(
      join(migrationsDir, '0030_splash_revert_to_default.sql'),
      'utf8',
    );
    expect(migration).toContain("rolname = 'learnbox_admin'");
    expect(migration).toContain('GRANT DELETE ON current_splash TO learnbox_admin');
    expect(migration).not.toMatch(/DELETE\s+FROM/i);

    const roles = readFileSync(join(repoRoot, 'infrastructure/database/db-roles-p0.sql'), 'utf8');
    expect(roles).toMatch(/GRANT DELETE ON[^;]*current_splash/);
    expect(roles).not.toMatch(/GRANT DELETE ON[^;]*splash_versions/);
  });
});
