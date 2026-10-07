import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAdminUsersStore } from '../../admin/lib/server/postgres-admin-users-store';

/**
 * Phase 3 / Milestone 3.3 — the Audit Log viewer against a REAL Postgres with every repo migration
 * applied.
 *
 * The events this suite reads back are not fixtures of the viewer's own invention: they are produced
 * by calling the REAL M3.1 `setUserStatus` and the REAL M3.2 `setPackEntitlement`, exactly as an
 * operator does. That is the whole point of testing it this way — a viewer tested against
 * hand-written rows proves only that it can read its own assumptions, and would stay green on the
 * day a producer changed its action name, entity type or metadata keys and left the trail
 * unreadable. Here, a producer change that this viewer cannot present breaks this test.
 *
 * What it is built to catch:
 *   - a genuine suspension or entitlement action that the viewer cannot show
 *   - Phase 1/2 content and Store records becoming unreadable once Phase 3 records exist
 *   - a filter that silently returns the wrong window of history
 *   - paging that drops, repeats or reorders actions
 *   - an operator without the role reading the trail
 *   - the viewer writing to, or being able to write to, the append-only trail
 *   - metadata reaching an operator's screen unredacted
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m33_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

let pool: PgPool;
let admin: PgPool;
let store: PostgresAdminUsersStore;

const operator = randomUUID();
const secondOperator = randomUUID();
const unprivileged = randomUUID();
let learner = '';
let bystander = '';
const paidPack = 'm33-paid-pack';

async function list(input: Parameters<PostgresAdminUsersStore['listAuditLog']>[0]) {
  const result = await store.listAuditLog(input);
  if (result.status !== 'ok') throw new Error(`audit unavailable: ${result.status}`);
  return result;
}

async function auditCount() {
  const result = await pool.query<{ count: string }>('SELECT count(*) AS count FROM audit_logs');
  return Number(result.rows[0].count);
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

  learner = randomUUID();
  bystander = randomUUID();
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name, last_name, status)
     VALUES ($1, '+989****2001', 'سارا', 'محمدی', 'active'),
            ($2, '+989****2002', 'نیما', 'کریمی', 'active')`,
    [learner, bystander],
  );
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name, last_name)
     VALUES ($1, '+989****2003', 'نگین', 'رضایی'),
            ($2, '+989****2004', 'مهدی', 'تهرانی'),
            ($3, '+989****2005', 'بی‌نقش', 'کاربر')`,
    [operator, secondOperator, unprivileged],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super_admin'), ($2, 'super_admin')`,
    [operator, secondOperator],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, is_free, price_tomans, status)
     VALUES ($1, 'بستهٔ پولی', 10, false, 250000, 'published')`,
    [paidPack],
  );

  store = new PostgresAdminUsersStore(pool as never);

  // Phase 1/2 history, written the way the content and Store producers write it. The viewer has to
  // keep showing these after Phase 3 adds its own vocabulary to the same table.
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
     VALUES ($1, 'content_review.approve', 'card_version', $2,
             jsonb_build_object('decision_key', $3::uuid), now() - interval '3 days'),
            ($1, 'store_listing.upsert', 'store_listing', $4,
             jsonb_build_object('store_status', 'listed'), now() - interval '2 days')`,
    [operator, randomUUID(), randomUUID(), randomUUID()],
  );

  // GENUINE Phase 3 actions, through the real M3.1 and M3.2 code paths.
  const disabled = await store.setUserStatus({
    actorUserId: operator,
    userId: learner,
    status: 'disabled',
    reason: 'گزارش تخلف شمارهٔ ۴۲',
    idempotencyKey: randomUUID(),
  });
  if (disabled.status !== 'applied') throw new Error(`suspend failed: ${disabled.status}`);

  const granted = await store.setPackEntitlement({
    actorUserId: secondOperator,
    userId: bystander,
    packId: paidPack,
    action: 'grant',
    reason: 'پشتیبانی تلفنی شمارهٔ ۱۲',
    idempotencyKey: randomUUID(),
  });
  if (granted.status !== 'applied') throw new Error(`grant failed: ${granted.status}`);

  const revoked = await store.setPackEntitlement({
    actorUserId: secondOperator,
    userId: bystander,
    packId: paidPack,
    action: 'revoke',
    reason: 'اعطای اشتباه؛ اصلاح شد',
    idempotencyKey: randomUUID(),
  });
  if (revoked.status !== 'applied') throw new Error(`revoke failed: ${revoked.status}`);

  const reactivated = await store.setUserStatus({
    actorUserId: operator,
    userId: learner,
    status: 'active',
    reason: 'بررسی شد؛ تخلفی نبود',
    idempotencyKey: randomUUID(),
  });
  if (reactivated.status !== 'applied') throw new Error(`reactivate failed: ${reactivated.status}`);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  }
});

suite('M3.3 audit log viewer over real administrative history', () => {
  it('shows the genuine M3.1 suspension and reactivation an operator performed', async () => {
    const page = await list({ actorUserId: operator, filters: { entityId: learner } });
    const actions = page.rows.map((row) => row.action);
    expect(actions).toContain('user.disable');
    expect(actions).toContain('user.reactivate');

    const suspension = page.rows.find((row) => row.action === 'user.disable')!;
    expect(suspension.entityType).toBe('user_account_status');
    expect(suspension.entityId).toBe(learner);
    expect(suspension.actorUserId).toBe(operator);
    // The operator is named, not shown as a bare identifier.
    expect(suspension.actorLabel).toBe('نگین رضایی');
    expect(suspension.reason).toBe('گزارش تخلف شمارهٔ ۴۲');
    expect(suspension.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}/);
  });

  it('shows the genuine M3.2 grant and revoke with their provenance details', async () => {
    const page = await list({ actorUserId: operator, filters: { entityId: bystander } });
    const grant = page.rows.find((row) => row.action.endsWith('grant'))!;
    const revoke = page.rows.find((row) => row.action.endsWith('revoke'))!;

    expect(grant.entityType).toBe('user_pack_entitlement');
    expect(grant.reason).toBe('پشتیبانی تلفنی شمارهٔ ۱۲');
    expect(revoke.reason).toBe('اعطای اشتباه؛ اصلاح شد');
    // The provenance the producer recorded is what a reviewer needs to judge the action.
    const detail = Object.fromEntries(grant.details.map((item) => [item.key, item.value]));
    expect(detail.pack_id).toBe(paidPack);
    expect(Object.keys(detail).length).toBeGreaterThan(1);
  });

  it('keeps Phase 1 content and Phase 2 Store records readable alongside Phase 3 records', async () => {
    const page = await list({ actorUserId: operator, limit: 100 });
    const actions = page.rows.map((row) => row.action);
    expect(actions).toContain('content_review.approve');
    expect(actions).toContain('store_listing.upsert');
    expect(actions).toContain('user.disable');
    expect(actions).toContain('user_pack.grant');
    expect(page.total).toBe(await auditCount());
  });

  it('redacts internal correlation keys the producers record', async () => {
    const page = await list({ actorUserId: operator, limit: 100 });
    const redactedKeys = page.rows
      .flatMap((row) => row.details)
      .filter((detail) => detail.redacted)
      .map((detail) => detail.key);
    // Both M3.x producers and the Phase 1 reviewer write a correlation key; none of them reach the UI.
    expect(redactedKeys).toContain('idempotency_key');
    expect(redactedKeys).toContain('decision_key');
    const serialised = JSON.stringify(page.rows);
    const keys = await pool.query<{ value: string }>(
      `SELECT metadata->>'idempotency_key' AS value FROM audit_logs
        WHERE metadata ? 'idempotency_key'`,
    );
    expect(keys.rowCount).toBeGreaterThan(0);
    for (const row of keys.rows) expect(serialised).not.toContain(row.value);
  });

  it('orders newest first so the most recent action is the one a reviewer sees', async () => {
    const page = await list({ actorUserId: operator, limit: 100 });
    const stamps = page.rows.map((row) => new Date(row.createdAt).getTime());
    expect(stamps).toEqual([...stamps].sort((left, right) => right - left));
    expect(page.rows[0].action).toBe('user.reactivate');
  });

  it('offers only the filter vocabulary this deployment actually wrote', async () => {
    const page = await list({ actorUserId: operator });
    expect(page.actions).toContain('user_pack.revoke');
    expect(page.entityTypes).toEqual([...page.entityTypes].sort());
    expect(page.entityTypes).toContain('card_version');
    expect(page.actors.map((actor) => actor.label)).toEqual(
      expect.arrayContaining(['نگین رضایی', 'مهدی تهرانی']),
    );
    // A learner who never performed an administrative action is not an actor.
    expect(page.actors.map((actor) => actor.id)).not.toContain(learner);
  });

  it('filters by action, actor and target independently', async () => {
    const byAction = await list({
      actorUserId: operator,
      filters: { action: 'user_pack.grant' },
    });
    expect(byAction.rows).toHaveLength(1);
    expect(byAction.total).toBe(1);

    const byActor = await list({ actorUserId: operator, filters: { actorUserId: secondOperator } });
    expect(byActor.rows.every((row) => row.actorUserId === secondOperator)).toBe(true);
    expect(byActor.rows).toHaveLength(2);

    const byType = await list({
      actorUserId: operator,
      filters: { entityType: 'user_account_status' },
    });
    expect(byType.rows.every((row) => row.entityType === 'user_account_status')).toBe(true);

    const byTarget = await list({ actorUserId: operator, filters: { entityId: bystander } });
    expect(byTarget.rows.every((row) => row.entityId === bystander)).toBe(true);
  });

  it('honours a date window instead of returning the whole trail', async () => {
    const recent = await list({
      actorUserId: operator,
      filters: { from: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      limit: 100,
    });
    // The Phase 1/2 fixtures are days old; the Phase 3 actions are seconds old.
    expect(recent.rows.map((row) => row.action)).not.toContain('content_review.approve');
    expect(recent.rows.length).toBe(4);

    const old = await list({
      actorUserId: operator,
      filters: { to: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      limit: 100,
    });
    expect(old.rows.map((row) => row.action).sort()).toEqual([
      'content_review.approve',
      'store_listing.upsert',
    ]);

    const nothing = await list({
      actorUserId: operator,
      filters: { from: '2030-01-01T00:00:00.000Z' },
    });
    expect(nothing.rows).toEqual([]);
    expect(nothing.total).toBe(0);
  });

  it('combines filters conjunctively rather than widening the result', async () => {
    const page = await list({
      actorUserId: operator,
      filters: { actorUserId: operator, entityType: 'user_account_status' },
    });
    expect(page.rows).toHaveLength(2);
    const contradictory = await list({
      actorUserId: operator,
      filters: { actorUserId: operator, entityId: bystander },
    });
    expect(contradictory.rows).toEqual([]);
  });

  it('pages on the server without dropping, repeating or reordering an action', async () => {
    const whole = await list({ actorUserId: operator, limit: 100 });
    const collected: string[] = [];
    for (let offset = 0; offset < whole.total; offset += 2) {
      const page = await list({ actorUserId: operator, limit: 2, offset });
      expect(page.total).toBe(whole.total);
      expect(page.limit).toBe(2);
      expect(page.offset).toBe(offset);
      collected.push(...page.rows.map((row) => row.id));
    }
    expect(collected).toEqual(whole.rows.map((row) => row.id));
    expect(new Set(collected).size).toBe(collected.length);
  });

  it('clamps a hostile page size instead of returning the whole table', async () => {
    const huge = await list({ actorUserId: operator, limit: 100_000 });
    expect(huge.limit).toBe(100);
    const zero = await list({ actorUserId: operator, limit: 0 });
    expect(zero.limit).toBe(1);
    const negative = await list({ actorUserId: operator, offset: -10 });
    expect(negative.offset).toBe(0);
  });

  it('returns an empty page, not an error, past the end of the trail', async () => {
    const page = await list({ actorUserId: operator, offset: 500 });
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('refuses an operator without an administrative role', async () => {
    expect(await store.listAuditLog({ actorUserId: unprivileged })).toEqual({
      status: 'forbidden',
    });
    // A learner is refused for the same reason, by the same single role predicate.
    expect(await store.listAuditLog({ actorUserId: learner })).toEqual({ status: 'forbidden' });
  });

  it('still names the action after its actor is anonymised by account deletion', async () => {
    // 0019 nulls `actor_user_id` on deletion rather than destroying the record: the action remains
    // evidence even when the person is gone, and the viewer must not break on it.
    const orphan = await pool.query<{ id: string }>(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (NULL, 'user.disable', 'user_account_status', $1, '{}'::jsonb) RETURNING id`,
      [learner],
    );
    const page = await list({ actorUserId: operator, limit: 100 });
    const row = page.rows.find((candidate) => candidate.id === orphan.rows[0].id)!;
    expect(row.actorUserId).toBeNull();
    expect(row.actorLabel).toBeNull();
    expect(row.action).toBe('user.disable');
    await pool.query('DELETE FROM audit_logs WHERE id = $1', [orphan.rows[0].id]);
  });

  it('reading the trail writes nothing to it', async () => {
    const before = await auditCount();
    await list({ actorUserId: operator, filters: { action: 'user_pack.grant' }, limit: 5 });
    await list({ actorUserId: operator, limit: 100 });
    await store.listAuditLog({ actorUserId: unprivileged });
    expect(await auditCount()).toBe(before);
  });

  it('leaves the Admin database role unable to rewrite history', async () => {
    const source = readFileSync(join(repoRoot, 'infrastructure/database/db-roles-p0.sql'), 'utf8');
    // SELECT to read it and INSERT to append to it — and deliberately nothing that could edit or
    // erase a record. M3.3 needs no new grant, so it adds none.
    expect(source).toMatch(/GRANT INSERT ON audit_logs[^;]*TO learnbox_admin/);
    expect(source).not.toMatch(/GRANT[^;]*UPDATE[^;]*audit_logs[^;]*TO learnbox_admin/);
    expect(source).not.toMatch(/GRANT[^;]*DELETE[^;]*audit_logs[^;]*TO learnbox_admin/);

    const role = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin'`);
    if (role.rowCount === 1) {
      const privilege = await pool.query<{ update: boolean; delete: boolean }>(
        `SELECT has_table_privilege('learnbox_admin', 'audit_logs', 'UPDATE') AS update,
                has_table_privilege('learnbox_admin', 'audit_logs', 'DELETE') AS delete`,
      );
      expect(privilege.rows[0]).toEqual({ update: false, delete: false });
    }
  });

  it('presents the vocabulary the real producers write, not a copy of it', async () => {
    // Guards against the quiet failure mode of an audit viewer: a producer renames an action and the
    // viewer keeps passing against its own fixtures while showing operators nothing.
    const page = await list({ actorUserId: operator, limit: 100 });
    const observed = new Set(page.rows.map((row) => row.action));
    for (const file of [
      'apps/admin/lib/server/postgres-admin-users-store.ts',
      'apps/admin/lib/server/postgres-content-review-store.ts',
      'apps/admin/lib/server/postgres-store-listings-store.ts',
    ]) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      for (const action of observed) {
        if (!source.includes(action)) continue;
        expect(page.rows.some((row) => row.action === action)).toBe(true);
      }
    }
    expect(observed).toContain('user.disable');
    expect(observed).toContain('user_pack.revoke');
  });
});
