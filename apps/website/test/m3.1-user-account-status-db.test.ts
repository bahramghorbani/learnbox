import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashOtpPhone } from '../../api/dist/auth/otp-challenge.js';
import { PostgresAdminUsersStore } from '../../admin/lib/server/postgres-admin-users-store';
import { deleteAccount } from '../lib/account-deletion-store';
import { isSessionBlocked, revokeSession } from '../lib/session-revocation';
import { PostgresWebLearnerIdentityStore } from '../lib/web-identity-runtime';

/**
 * Phase 3 / Milestone 3.1 — temporary account suspension against a REAL Postgres with every repo
 * migration applied.
 *
 * The milestone's whole claim is a cross-app one: an operator acts in Admin, and the learner
 * runtime stops honouring that account on the very next request. So this suite runs the REAL Admin
 * support store and the REAL learner authentication predicate against the SAME canonical database,
 * because a mocked version of either side could agree with itself while production disagreed.
 *
 * What it is built to catch:
 *   - a suspension the learner boundary never reads (UI-only suspension)
 *   - a suspension that leaks into learner data: progress, history, entitlements, payments
 *   - a reactivation that silently resurrects sessions killed during the suspension
 *   - a status change written with no auditable reason or actor
 *   - a retried request applying the same change twice
 *   - one learner's suspension affecting another
 *   - suspension colliding with the separate permanent deletion lifecycle
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m31_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

let pool: PgPool;
let admin: PgPool;
let store: PostgresAdminUsersStore;

const operator = randomUUID();
const unprivileged = randomUUID();
let learner = '';
let bystander = '';
let cardId = '';

type Session = { subject: string; issuedAt: number; expiresAt: number; sessionId: string };

function sessionFor(subject: string, issuedSecondsAgo = 5): Session {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    subject,
    issuedAt: nowSeconds - issuedSecondsAgo,
    expiresAt: nowSeconds + 3600,
    sessionId: randomUUID(),
  };
}

/** Everything that must survive a suspension, counted as one snapshot. */
async function learnerFootprint(userId: string) {
  const counts = await pool.query<{
    schedules: number;
    reviews: number;
    packs: number;
    purchases: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM card_schedules WHERE user_id = $1)  AS schedules,
       (SELECT count(*)::int FROM review_events  WHERE user_id = $1)  AS reviews,
       (SELECT count(*)::int FROM user_packs     WHERE user_id = $1)  AS packs,
       (SELECT count(*)::int FROM purchase_events WHERE user_id = $1) AS purchases`,
    [userId],
  );
  const identity = await pool.query<{ phone_e164: string; first_name: string }>(
    'SELECT phone_e164, first_name FROM users WHERE id = $1',
    [userId],
  );
  return { ...counts.rows[0], identity: identity.rows[0] };
}

async function auditRows(userId: string) {
  const result = await pool.query<{
    actor_user_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT actor_user_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
      WHERE entity_type = 'user_account_status' AND entity_id = $1::uuid
      ORDER BY created_at, action`,
    [userId],
  );
  return result.rows;
}

async function statusOf(userId: string): Promise<string | undefined> {
  const result = await pool.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
    userId,
  ]);
  return result.rows[0]?.status;
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

  // Two real learners, one with a full footprint (progress, history, entitlement, payment) and one
  // bystander used to prove suspension is scoped to a single account.
  learner = randomUUID();
  bystander = randomUUID();
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name, last_name)
     VALUES ($1, '+989120000001', 'سارا', 'محمدی'), ($2, '+989120000002', 'نیما', 'کاظمی')`,
    [learner, bystander],
  );

  // The operator and a deliberately role-less Admin user.
  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name)
     VALUES ($1, '+989129990001', 'اپراتور'), ($2, '+989129990002', 'بی‌نقش')`,
    [operator, unprivileged],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super_admin')`,
    [operator],
  );

  cardId = randomUUID();
  await pool.query('INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $3)', [
    cardId,
    'Haus',
    'm31-haus',
  ]);
  await pool.query(
    `INSERT INTO packs (id, display_name, description, target_item_count, is_free, status)
     VALUES ('m31-pack', 'بستهٔ آزمون', 'برای آزمون M3.1', 1, true, 'published')`,
  );
  await pool.query(
    'INSERT INTO card_schedules (user_id, card_id, state, due_at) VALUES ($1, $2, $3, now())',
    [learner, cardId, 'learning'],
  );
  await pool.query(
    `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
     VALUES ($1, $2, $3, 'remembered', now(), $4)`,
    [randomUUID(), learner, cardId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO user_packs (user_id, pack_id, acquisition_type) VALUES ($1, 'm31-pack', 'free')`,
    [learner],
  );
  await pool.query(
    `INSERT INTO billing_products (id, kind, entitlement_keys)
     VALUES ('m31-product', 'one_time_pack', ARRAY['pack:m31-pack'])
     ON CONFLICT (id) DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO purchase_events
       (user_id, provider, environment, provider_purchase_id, product_id, status, verified_at)
     VALUES ($1, 'direct_web', 'sandbox', $2, 'm31-product', 'verified', now())`,
    [learner, `m31-${randomUUID()}`],
  );

  store = new PostgresAdminUsersStore(pool as never);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  }
});

suite('M3.1 account suspension against real Postgres', () => {
  it('every pre-existing user is active: the migration changes nobody', async () => {
    const rows = await pool.query<{ status: string; count: number }>(
      'SELECT status, count(*)::int AS count FROM users GROUP BY status',
    );
    expect(rows.rows).toEqual([{ status: 'active', count: 4 }]);
    expect(await statusOf(learner)).toBe('active');
  });

  it('an active learner session is honoured, a revoked one is not', async () => {
    const session = sessionFor(learner);
    expect(await isSessionBlocked(pool as never, session)).toBe(false);
    const revoked = sessionFor(learner);
    await revokeSession(pool as never, revoked);
    expect(await isSessionBlocked(pool as never, revoked)).toBe(true);
    // The still-valid session is unaffected by its sibling's revocation.
    expect(await isSessionBlocked(pool as never, session)).toBe(false);
  });

  it('the support list exposes status and refuses an operator without the role', async () => {
    const listed = await store.listUsers({ actorUserId: operator });
    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    const row = listed.rows.find((candidate) => candidate.id === learner);
    expect(row).toMatchObject({ status: 'active', reviewCount: 1, cardsStarted: 1 });
    expect(row?.phone).toBe('+989120000001');

    const searched = await store.listUsers({ actorUserId: operator, search: '9120000002' });
    expect(searched.status === 'ok' && searched.rows.map((item) => item.id)).toEqual([bystander]);

    expect(await store.listUsers({ actorUserId: unprivileged })).toEqual({ status: 'forbidden' });
  });

  it('an unprivileged Admin cannot suspend anybody', async () => {
    const result = await store.setUserStatus({
      actorUserId: unprivileged,
      userId: learner,
      status: 'disabled',
      reason: 'بدون نقش',
      idempotencyKey: randomUUID(),
    });
    expect(result).toEqual({ status: 'forbidden' });
    expect(await statusOf(learner)).toBe('active');
    expect(await auditRows(learner)).toHaveLength(0);
  });

  it('suspension cuts off existing sessions immediately and preserves every learner record', async () => {
    const before = await learnerFootprint(learner);
    const liveSession = sessionFor(learner, 30);
    expect(await isSessionBlocked(pool as never, liveSession)).toBe(false);

    const result = await store.setUserStatus({
      actorUserId: operator,
      userId: learner,
      status: 'disabled',
      reason: 'گزارش تخلف شمارهٔ ۴۲ — بررسی پشتیبانی',
      idempotencyKey: 'm31-disable-1',
    });
    expect(result.status).toBe('applied');
    expect(result.status === 'applied' && result.row.status).toBe('disabled');

    // The session that was valid a line ago no longer authenticates — the cutoff, not the UI.
    expect(await isSessionBlocked(pool as never, liveSession)).toBe(true);

    // And a session issued strictly AFTER the cutoff instant is refused too. This is the one
    // assertion the session cutoff cannot satisfy — it is dated before this token — so only the
    // account-status check in the learner auth boundary can produce it. Without that check a
    // suspended learner could simply sign in again and carry on.
    const cutoff = await pool.query<{ seconds: number }>(
      `SELECT ceil(extract(epoch FROM sessions_valid_from))::int AS seconds
         FROM user_session_cutoffs WHERE user_id = $1`,
      [learner],
    );
    const afterCutoff = { ...sessionFor(learner), issuedAt: cutoff.rows[0].seconds + 60 };
    expect(await isSessionBlocked(pool as never, afterCutoff)).toBe(true);

    // Nothing of the learner was touched: identity, progress, history, entitlement, payment.
    expect(await learnerFootprint(learner)).toEqual(before);
  });

  it('suspension is scoped to one account', async () => {
    expect(await statusOf(bystander)).toBe('active');
    expect(await isSessionBlocked(pool as never, sessionFor(bystander))).toBe(false);
  });

  it('a retried suspension is idempotent and writes no second audit entry', async () => {
    const repeat = await store.setUserStatus({
      actorUserId: operator,
      userId: learner,
      status: 'disabled',
      reason: 'گزارش تخلف شمارهٔ ۴۲ — بررسی پشتیبانی',
      idempotencyKey: 'm31-disable-1',
    });
    expect(repeat.status).toBe('idempotent');

    // A different key on an account already in the requested state is reported, not re-recorded.
    const again = await store.setUserStatus({
      actorUserId: operator,
      userId: learner,
      status: 'disabled',
      reason: 'تلاش دوباره با کلید تازه',
      idempotencyKey: randomUUID(),
    });
    expect(again.status).toBe('unchanged');
    expect(await auditRows(learner)).toHaveLength(1);
  });

  it('the suspension is recorded in the canonical audit trail with actor and reason', async () => {
    const rows = await auditRows(learner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: operator,
      action: 'user.disable',
      entity_type: 'user_account_status',
      entity_id: learner,
    });
    expect(rows[0].metadata).toMatchObject({
      reason: 'گزارش تخلف شمارهٔ ۴۲ — بررسی پشتیبانی',
      previous_status: 'active',
      new_status: 'disabled',
      sessions_cut_off: true,
    });
    expect(rows[0].created_at).toBeInstanceOf(Date);
    // The trail is the canonical one, not a private table: the same row set the content and Store
    // actions write to.
    const canonical = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_logs WHERE actor_user_id = $1`,
      [operator],
    );
    expect(canonical.rows[0].count).toBe(1);
    // Exactly these keys, nothing else: the trail records what changed and why, and no session
    // identifier, token or other credential material can ride along unnoticed.
    expect(Object.keys(rows[0].metadata).sort()).toEqual([
      'idempotency_key',
      'new_status',
      'previous_status',
      'reason',
      'sessions_cut_off',
    ]);
    expect(JSON.stringify(rows[0].metadata)).not.toMatch(/token|secret|cookie|password|\bsid\b/i);
  });

  it('reactivation restores access without resurrecting the killed sessions', async () => {
    const killedBefore = sessionFor(learner, 600);
    expect(await isSessionBlocked(pool as never, killedBefore)).toBe(true);
    const cutoffBefore = await pool.query<{ at: Date }>(
      'SELECT sessions_valid_from AS at FROM user_session_cutoffs WHERE user_id = $1',
      [learner],
    );

    const result = await store.setUserStatus({
      actorUserId: operator,
      userId: learner,
      status: 'active',
      reason: 'بررسی انجام شد؛ تخلفی نبود',
      idempotencyKey: 'm31-reactivate-1',
    });
    expect(result.status).toBe('applied');
    expect(await statusOf(learner)).toBe('active');

    // The old session stays dead: the cutoff that killed it is not rolled back.
    expect(await isSessionBlocked(pool as never, killedBefore)).toBe(true);

    // A session the learner obtains by authenticating again works normally. Its issue time is
    // taken from the stored cutoff rather than the wall clock, because the cutoff comparison is
    // second-granular on the token side (canonical 0020 behaviour: a token minted inside the same
    // second as the cutoff counts as pre-cutoff, which fails closed). A real re-login is seconds
    // to minutes later; this models the first second at which it can differ.
    const cutoffAfter = await pool.query<{ at: Date }>(
      'SELECT sessions_valid_from AS at FROM user_session_cutoffs WHERE user_id = $1',
      [learner],
    );
    // Reactivation must not move the cutoff in EITHER direction: not backwards (which would
    // revive the sessions the suspension killed) and not forwards (which would silently invalidate
    // the session the learner is about to obtain).
    expect(cutoffAfter.rows[0].at.getTime()).toBe(cutoffBefore.rows[0].at.getTime());

    const freshLogin = {
      ...sessionFor(learner),
      issuedAt: Math.ceil(cutoffAfter.rows[0].at.getTime() / 1000) + 1,
    };
    expect(await isSessionBlocked(pool as never, freshLogin)).toBe(false);

    const rows = await auditRows(learner);
    expect(rows).toHaveLength(2);
    const reactivation = rows.find((row) => row.action === 'user.reactivate');
    expect(reactivation?.metadata).toMatchObject({
      reason: 'بررسی انجام شد؛ تخلفی نبود',
      previous_status: 'disabled',
      new_status: 'active',
      sessions_cut_off: false,
    });
  });

  it('the learner keeps everything after a full suspend/reactivate cycle', async () => {
    expect(await learnerFootprint(learner)).toMatchObject({
      schedules: 1,
      reviews: 1,
      packs: 1,
      purchases: 1,
      identity: { phone_e164: '+989120000001', first_name: 'سارا' },
    });
  });

  it('a suspended account is refused at the sign-in door, and allowed again after reactivation', async () => {
    // The other half of enforcement: the real identity store, real SQL, real database. Blocking
    // only authenticated requests would leave a suspended learner able to sign in and sit in a
    // shell that fails every call; blocking only sign-in would leave their current session alive.
    const secret = 'otp-secret-that-is-at-least-thirty-two-bytes';
    const identity = new PostgresWebLearnerIdentityStore(pool as never, secret);
    const phoneE164 = '+989120000003';
    const signIn = () =>
      identity.resolveUserId({ phoneE164, phoneHash: hashOtpPhone(secret, phoneE164) });

    // A brand-new phone signs in and is created active: suspension does not touch registration.
    const created = await signIn();
    expect(created.status).toBe('ok');
    const newcomer = created.status === 'ok' ? created.userId : '';

    const suspended = await store.setUserStatus({
      actorUserId: operator,
      userId: newcomer,
      status: 'disabled',
      reason: 'بررسی گزارش پشتیبانی',
      idempotencyKey: randomUUID(),
    });
    expect(suspended.status).toBe('applied');
    expect(await signIn()).toEqual({ status: 'suspended' });

    const restored = await store.setUserStatus({
      actorUserId: operator,
      userId: newcomer,
      status: 'active',
      reason: 'بررسی بسته شد',
      idempotencyKey: randomUUID(),
    });
    expect(restored.status).toBe('applied');
    expect(await signIn()).toEqual({ status: 'ok', userId: newcomer });
  });

  it('an unknown user is reported, never created', async () => {
    const ghost = randomUUID();
    expect(
      await store.setUserStatus({
        actorUserId: operator,
        userId: ghost,
        status: 'disabled',
        reason: 'کاربر ناموجود',
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ status: 'not_found' });
    const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [ghost]);
    expect(exists.rowCount).toBe(0);
  });

  it('only active and disabled are storable states', async () => {
    await expect(
      pool.query(`UPDATE users SET status = 'deleted' WHERE id = $1`, [learner]),
    ).rejects.toThrow(/users_status_allowed/);
  });

  it('permanent deletion remains a separate, working lifecycle after suspension', async () => {
    // Suspend the bystander, then delete that same account through the learner-initiated deletion
    // path. Suspension must not block, duplicate or corrupt deletion, and deletion must remove the
    // account outright rather than leaving a suspended shell.
    const suspended = await store.setUserStatus({
      actorUserId: operator,
      userId: bystander,
      status: 'disabled',
      reason: 'درخواست خود کاربر پیش از حذف',
      idempotencyKey: randomUUID(),
    });
    expect(suspended.status).toBe('applied');

    const outcome = await deleteAccount(pool as never, {
      userId: bystander,
      subjectHash: `m31-${bystander}`,
      actor: 'learner',
      requestedAt: new Date(),
      requestId: randomUUID(),
    });
    expect(outcome.status).toBe('deleted');
    expect(await statusOf(bystander)).toBeUndefined();

    const events = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM account_deletion_events WHERE prior_user_id = $1',
      [bystander],
    );
    expect(events.rows[0].count).toBe(1);

    // Deleting the user cascaded the cutoff row away with it; no orphan suspension state remains.
    const cutoffs = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM user_session_cutoffs WHERE user_id = $1',
      [bystander],
    );
    expect(cutoffs.rows[0].count).toBe(0);
  });
});
