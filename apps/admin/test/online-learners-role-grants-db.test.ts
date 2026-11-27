import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresAdminDashboardStore } from '../lib/server/postgres-admin-dashboard-store';
import { PostgresAdminSupportTicketsStore } from '../lib/server/postgres-admin-support-tickets-store';
import { createLearnerSupportTicket } from '../../website/lib/support-tickets-store';

/**
 * P1 regression guard, same shape as `pack-metadata-role-grants-db.test.ts`: the REAL dashboard
 * store runs under the REAL restricted `learnbox_admin` role, so a missing/too-wide column grant
 * on `mobile_learner_sessions` fails here instead of a silent wrong number (or a 503) in
 * Production. Migration 0040 grants exactly `user_id`, `last_used_at`, `revoked_at` — this proves
 * the counter reads with that grant and that `refresh_token_hash` stays denied.
 *
 * Uses TEST_DATABASE_URL (the CI `quality` job provides it).
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
  '0066_admin_online_learners_grant.sql',
  '0069_admin_unified_sales_grant.sql',
  '0070_support_tickets.sql',
];

const isDenied = (error: unknown) => (error as { code?: string } | null)?.code === '42501';

suite('online-learner counter under the restricted learnbox_admin role', () => {
  const dbName = `lb_role_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const actorUserId = randomUUID();
  const onlineLearnerId = randomUUID();
  const staleLearnerId = randomUUID();
  let root: Pool;
  let owner: Pool;
  let restricted: Pool;
  let app: Pool;

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
      `INSERT INTO users (id, phone_e164, first_name) VALUES
         ($1, '+989****7002', 'بررسی‌کننده'),
         ($2, '+989****7003', 'آنلاین'),
         ($3, '+989****7004', 'قدیمی')`,
      [actorUserId, onlineLearnerId, staleLearnerId],
    );
    await owner.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_reviewer'), ($1, 'super_admin')`,
      [actorUserId],
    );
    // One session used 5 minutes ago (inside the 15-minute window), one used 2 hours ago
    // (outside it), one revoked even though recently used — only the first should count.
    await owner.query(
      `INSERT INTO mobile_learner_sessions
         (user_id, installation_id, refresh_token_hash, last_used_at, absolute_expires_at, idle_expires_at, revoked_at, revoked_reason)
       VALUES
         ($1, 'dev-a', 'hash-a', now() - interval '5 minutes', now() + interval '30 days', now() + interval '14 days', NULL, NULL),
         ($2, 'dev-b', 'hash-b', now() - interval '2 hours',   now() + interval '30 days', now() + interval '14 days', NULL, NULL),
         ($1, 'dev-c', 'hash-c', now() - interval '1 minute',  now() + interval '30 days', now() + interval '14 days', now() - interval '1 minute', 'logout')`,
      [onlineLearnerId, staleLearnerId],
    );

    const asAdmin = new URL(scoped.toString());
    asAdmin.searchParams.set('options', '-c role=learnbox_admin');
    restricted = new Pool({ connectionString: asAdmin.toString(), max: 2 });
    restricted.on('error', () => undefined);
    const asApp = new URL(scoped.toString());
    asApp.searchParams.set('options', '-c role=learnbox_app');
    app = new Pool({ connectionString: asApp.toString(), max: 2 });
    app.on('error', () => undefined);
  });

  afterAll(async () => {
    await app?.end().catch(() => undefined);
    await restricted?.end().catch(() => undefined);
    await owner?.end().catch(() => undefined);
    await root?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await root?.end().catch(() => undefined);
  });

  it('runs as the restricted role, not as the owner', async () => {
    const who = await restricted.query<{ current_user: string }>('SELECT current_user');
    expect(who.rows[0].current_user).toBe('learnbox_admin');
  });

  it('counts only the one unrevoked session used in the last 15 minutes', async () => {
    const store = new PostgresAdminDashboardStore(restricted);
    const result = await store.readOverview({ actorUserId, environment: {} });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.overview.learners.onlineNow).toEqual({ state: 'available', value: 1 });
  });

  it('keeps the refresh-token hash denied at the database level', async () => {
    const outcome = await restricted
      .query('SELECT refresh_token_hash FROM mobile_learner_sessions LIMIT 1')
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(outcome).toBe('denied');
  });

  it('keeps writes on the session table denied', async () => {
    const outcome = await restricted
      .query(`UPDATE mobile_learner_sessions SET last_used_at = now() WHERE user_id = $1`, [
        onlineLearnerId,
      ])
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(outcome).toBe('denied');
  });

  it('permits the production verified-sales aggregate without expanding the post-reset grant', async () => {
    await expect(
      restricted.query(
        `SELECT count(*)
           FROM purchase_events
          WHERE environment::text = 'production'
            AND status = 'verified'
            AND created_at >= now() - interval '30 days'`,
      ),
    ).resolves.toBeDefined();
    const unrelatedColumn = await restricted
      .query('SELECT provider_purchase_id FROM purchase_events LIMIT 1')
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(unrelatedColumn).toBe('denied');
    const outcome = await restricted
      .query(`UPDATE purchase_events SET updated_at = now() WHERE false`)
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(outcome).toBe('denied');
  });

  it('gives the learner runtime only ticket insert/select and the admin only ticket transition columns', async () => {
    await expect(
      app.query(
        `INSERT INTO support_tickets (user_id, request_id, subject, message)
         VALUES ($1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ورود', 'لطفاً حساب من را بررسی کنید.')`,
        [onlineLearnerId],
      ),
    ).resolves.toBeDefined();
    await expect(
      restricted.query('SELECT ticket_number, status FROM support_tickets'),
    ).resolves.toBeDefined();

    const appUpdate = await app
      .query(`UPDATE support_tickets SET status = 'closed' WHERE false`)
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(appUpdate).toBe('denied');
    const adminInsert = await restricted
      .query(
        `INSERT INTO support_tickets (user_id, request_id, subject, message) VALUES ($1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ورود', 'بررسی کنید')`,
        [onlineLearnerId],
      )
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(adminInsert).toBe('denied');
    const adminUserRewrite = await restricted
      .query(`UPDATE support_tickets SET user_id = $1 WHERE false`, [staleLearnerId])
      .then(
        () => 'allowed',
        (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
      );
    expect(adminUserRewrite).toBe('denied');
  });

  it('uses the real stores for idempotent creation and one-way ticket transitions', async () => {
    const learner = {
      userId: onlineLearnerId,
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      subject: 'مشکل ورود',
      message: 'لطفاً حساب من را بررسی کنید.',
    };
    const created = await createLearnerSupportTicket(app, learner);
    const replayed = await createLearnerSupportTicket(app, learner);
    expect(replayed.id).toBe(created.id);

    const tickets = new PostgresAdminSupportTicketsStore(restricted);
    await expect(
      restricted.query('SELECT id, phone_e164, first_name, last_name FROM users WHERE id = $1', [
        onlineLearnerId,
      ]),
    ).resolves.toBeDefined();
    await expect(
      tickets.mutate({
        actorUserId,
        idempotencyKey: 'answer-1',
        mutation: { action: 'answer', ticketId: created.id, reply: 'بررسی شد.' },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
    await expect(
      tickets.mutate({
        actorUserId,
        idempotencyKey: 'answer-1',
        mutation: { action: 'answer', ticketId: created.id, reply: 'بررسی شد.' },
      }),
    ).resolves.toMatchObject({ status: 'idempotent' });
    await expect(
      tickets.mutate({
        actorUserId,
        idempotencyKey: 'close-1',
        mutation: { action: 'close', ticketId: created.id },
      }),
    ).resolves.toMatchObject({ status: 'applied' });
    const openTicket = await createLearnerSupportTicket(app, {
      ...learner,
      requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    await expect(
      tickets.mutate({
        actorUserId,
        idempotencyKey: 'close-open',
        mutation: { action: 'close', ticketId: openTicket.id },
      }),
    ).resolves.toMatchObject({ status: 'conflict' });
  });
});
