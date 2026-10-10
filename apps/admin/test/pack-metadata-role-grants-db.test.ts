import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresContentPacksWriteStore } from '../lib/server/postgres-content-packs-write-store';

/**
 * P1 regression guard: the REAL pack-write store runs under the REAL restricted `learnbox_admin`
 * role, so a missing column grant fails here instead of turning into a 503 in Production.
 *
 * Production, 2026-10-10: editPack updated `packs.target_item_count`, migration 0033 had granted
 * UPDATE only on `status`/`published_at`, and the route's catch-all reported
 * `503 Content packs unavailable` with no log line. Migration 0034 adds the editorial columns and
 * keeps `is_free`/`price_tomans` denied.
 *
 * Uses TEST_DATABASE_URL (the CI `quality` job provides it), creates its own throwaway database,
 * applies every repo migration plus `infrastructure/database/db-roles-p0.sql`, then drops into the
 * restricted role with SET ROLE — a non-superuser `current_user` gets real privilege checks, so no
 * extra credential or DSN is needed.
 */
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const migrationsDir = join(process.cwd(), '..', '..', 'database', 'migrations');
const rolesFile = join(process.cwd(), '..', '..', 'infrastructure', 'database', 'db-roles-p0.sql');

/** Grant-only migrations: they are no-ops until the roles exist, so they are replayed after. */
const grantMigrations = [
  '0032_role_grant_repair.sql',
  '0033_admin_content_management_grants.sql',
  '0034_admin_pack_metadata_grants.sql',
];

const isDenied = (error: unknown) => (error as { code?: string } | null)?.code === '42501';

suite('pack metadata writes under the restricted learnbox_admin role', () => {
  const dbName = `lb_role_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const packId = 'zz-role-test-pack';
  const actorUserId = randomUUID();
  let root: Pool;
  let owner: Pool;
  let restricted: Pool;

  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    await root.query(`CREATE DATABASE ${dbName}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    owner = new Pool({ connectionString: scoped.toString(), max: 2 });
    owner.on('error', () => undefined);

    for (const file of readdirSync(migrationsDir)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort()) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }
    // Roles exist only after this file; replay the grant-only migrations so their guarded blocks
    // actually run — exactly the order Production followed. `\set` is a psql meta-command the
    // driver cannot parse, so the only such line is dropped.
    await owner.query(
      readFileSync(rolesFile, 'utf8')
        .split('\n')
        .filter((line) => !line.startsWith('\\'))
        .join('\n'),
    );
    for (const file of grantMigrations) {
      await owner.query(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    await owner.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+989****7001', 'بررسی‌کننده')`,
      [actorUserId],
    );
    await owner.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_reviewer')`,
      [actorUserId],
    );
    await owner.query(
      `INSERT INTO packs (id, display_name, target_cefr, target_item_count, is_free, status)
       VALUES ($1, 'نام اولیه', 'A1', 5, false, 'draft')`,
      [packId],
    );

    // `options=-c role=…` makes every connection in this pool start as the restricted role, so
    // there is no window in which a query could run as the owner.
    const asAdmin = new URL(scoped.toString());
    asAdmin.searchParams.set('options', '-c role=learnbox_admin');
    restricted = new Pool({ connectionString: asAdmin.toString(), max: 2 });
    restricted.on('error', () => undefined);
  });

  afterAll(async () => {
    await restricted?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await root?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await root?.end().catch(() => undefined);
  });

  it('runs as the restricted role, not as the owner', async () => {
    const who = await restricted.query<{ current_user: string }>('SELECT current_user');
    expect(who.rows[0].current_user).toBe('learnbox_admin');
  });

  it('edits editorial pack metadata through the real store', async () => {
    const store = new PostgresContentPacksWriteStore(restricted);

    const result = await store.editPack({
      packId,
      displayName: 'نام ویرایش‌شده',
      description: 'توضیح تازه',
      targetCefr: 'A2',
      category: 'واژگان پایه',
      targetItemCount: 7,
      isFree: false, // unchanged value, exactly what the edit form posts
      idempotencyKey: randomUUID(),
      actorUserId,
    });

    expect(result).toEqual({ status: 'applied', packId });
    const row = await owner.query<{
      display_name: string;
      description: string;
      target_cefr: string;
      category: string;
      target_item_count: number;
      is_free: boolean;
    }>(
      `SELECT display_name, description, target_cefr, category, target_item_count, is_free
         FROM packs WHERE id = $1`,
      [packId],
    );
    expect(row.rows[0]).toMatchObject({
      display_name: 'نام ویرایش‌شده',
      description: 'توضیح تازه',
      target_cefr: 'A2',
      category: 'واژگان پایه',
      target_item_count: 7,
      is_free: false,
    });
    // `audit_logs.entity_id` is uuid-typed, so the store records a surrogate uuid for slug pack
    // ids; this database is isolated, so counting the action is enough.
    const audit = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'content_pack.edit'`,
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it('refuses a free/paid change with a field issue instead of a permission error', async () => {
    const store = new PostgresContentPacksWriteStore(restricted);

    const result = await store.editPack({
      packId,
      isFree: true,
      idempotencyKey: randomUUID(),
      actorUserId,
    });

    expect(result).toMatchObject({
      status: 'invalid',
      issues: [{ field: 'isFree' }],
    });
    const row = await owner.query<{ is_free: boolean }>('SELECT is_free FROM packs WHERE id = $1', [
      packId,
    ]);
    expect(row.rows[0].is_free).toBe(false);
  });

  it('keeps commercial and identity columns denied at the database level', async () => {
    const denied = async (sql: string) => {
      const outcome = await restricted.query(sql, [packId]).then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
      expect(outcome).toBe('denied');
    };

    await denied('UPDATE packs SET is_free = true WHERE id = $1');
    await denied('UPDATE packs SET price_tomans = 1 WHERE id = $1');
    await denied('UPDATE packs SET locale = locale WHERE id = $1');
    await denied('DELETE FROM packs WHERE id = $1');
    await denied('UPDATE cards SET content_id = content_id WHERE id::text = $1');
    await denied('UPDATE review_events SET grade = grade WHERE user_id::text = $1');
    await denied('UPDATE card_schedules SET due_at = due_at WHERE user_id::text = $1');
  });

  it('still allows the lifecycle columns 0033 granted', async () => {
    const outcome = await restricted
      .query(`UPDATE packs SET status = 'needs_review' WHERE id = $1`, [packId])
      .then(
        () => 'allowed',
        (error) => `denied:${String(error)}`,
      );
    expect(outcome).toBe('allowed');
    await owner.query(`UPDATE packs SET status = 'draft' WHERE id = $1`, [packId]);
  });
});
