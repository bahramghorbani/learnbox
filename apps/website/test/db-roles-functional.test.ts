import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresReviewEventStore } from '../../api/src/reviews/postgres-review-event.store';
import { PostgresContentReviewStore } from '../../admin/lib/server/postgres-content-review-store';
import { deleteAccount } from '../lib/account-deletion-store';
import { applyProfileUpdate, readProfileDetails } from '../lib/learner-profile-fields';
import { readLearnerSummary } from '../lib/learner-summary';
import {
  isSessionBlocked,
  pruneExpiredRevocations,
  revokeAllSessionsForUser,
  revokeSession,
} from '../lib/session-revocation';

/**
 * LB-B30 functional least-privilege proof: the REAL shipped learner and Admin store code runs
 * under the restricted `learnbox_app` / `learnbox_admin` roles against a disposable database that
 * has every repo migration and `infrastructure/database/db-roles-p0.sql` applied.
 *
 * Requires ROLE_TEST_OWNER_URL (seeds fixtures), ROLE_TEST_APP_URL and ROLE_TEST_ADMIN_URL.
 * Skipped locally without them. NEVER point these at Production: the test inserts and deletes
 * synthetic rows.
 */
const ownerUrl = process.env.ROLE_TEST_OWNER_URL;
const appUrl = process.env.ROLE_TEST_APP_URL;
const adminUrl = process.env.ROLE_TEST_ADMIN_URL;
const suite = ownerUrl && appUrl && adminUrl ? describe : describe.skip;

const isDenied = (error: unknown) => (error as { code?: string }).code === '42501';
async function expectDenied(promise: Promise<unknown>) {
  await expect(
    promise.then(
      () => 'allowed',
      (error) => (isDenied(error) ? 'denied' : `other:${String(error)}`),
    ),
  ).resolves.toBe('denied');
}

suite('LB-B30 real store code under least-privilege roles', () => {
  let owner: Pool;
  let app: Pool;
  let admin: Pool;
  const learner = randomUUID();
  const reviewer = randomUUID();
  const phone = () =>
    `+9890${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, '0')}`;
  const upsertedPhone = phone();
  let cardId = '';
  let contentId = '';
  let versionId = '';

  beforeAll(async () => {
    owner = new Pool({ connectionString: ownerUrl });
    app = new Pool({ connectionString: appUrl });
    admin = new Pool({ connectionString: adminUrl });
    await owner.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2), ($3, $4)', [
      learner,
      phone(),
      reviewer,
      phone(),
    ]);
    await owner.query(
      `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_reviewer')`,
      [reviewer],
    );
    // Owner-side fixture only: promote one imported candidate so the learner can schedule it.
    const row = await owner.query(
      `SELECT c.id, c.content_id, cv.id AS version_id FROM cards c JOIN card_versions cv ON cv.card_id = c.id
        ORDER BY c.content_id LIMIT 1`,
    );
    ({ id: cardId, content_id: contentId, version_id: versionId } = row.rows[0]);
    await owner.query(`UPDATE card_versions SET status = 'approved' WHERE card_id = $1`, [cardId]);
  });

  afterAll(async () => {
    // Best-effort cleanup of synthetic fixtures (disposable database only).
    const cleanup = [
      ['DELETE FROM revoked_sessions WHERE user_id = $1', [learner]],
      ['DELETE FROM user_session_cutoffs WHERE user_id = $1', [learner]],
      ['DELETE FROM audit_logs WHERE actor_user_id = $1', [reviewer]],
      ['DELETE FROM content_review_checks WHERE reviewer_user_id = $1', [reviewer]],
      ['DELETE FROM admin_role_assignments WHERE user_id = $1', [reviewer]],
      ['DELETE FROM users WHERE id = ANY($1::uuid[])', [[learner, reviewer]]],
      ['DELETE FROM users WHERE phone_e164 = $1', [upsertedPhone]],
    ] as const;
    for (const [sql, params] of cleanup)
      await owner?.query(sql, [...params]).catch(() => undefined);
    await Promise.all([app?.end(), admin?.end(), owner?.end()]);
  });

  it('learnbox_app: identity upsert, profile update/read, summary', async () => {
    await app.query(
      `INSERT INTO users (id, phone_e164) VALUES (gen_random_uuid(), $1)
       ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164 RETURNING id`,
      [upsertedPhone],
    );
    const updated = await applyProfileUpdate(app, learner, { firstName: 'Test' } as never);
    expect(updated?.firstName).toBe('Test');
    expect((await readProfileDetails(app, learner))?.firstName).toBe('Test');
    const summary = await readLearnerSummary(app, learner, 'UTC');
    expect(summary).toBeTruthy();
  });

  it('learnbox_app: schedule + review write path (cards read-only)', async () => {
    const store = new PostgresReviewEventStore(app);
    const schedule = await store.ensureApprovedSchedule(learner, contentId);
    expect(schedule?.cardId).toBe(cardId);
    const write = await store.writeAtomically(
      {
        userId: learner,
        cardId,
        grade: 'remembered',
        occurredAt: new Date(),
        clientEventId: randomUUID(),
      } as never,
      {
        state: 'learning',
        stabilityDays: 1,
        difficulty: 5,
        lapses: 0,
        dueAt: new Date(Date.now() + 86_400_000),
      } as never,
    );
    expect(write.event.userId).toBe(learner);
    expect(
      (await owner.query('SELECT count(*)::int n FROM review_events WHERE user_id = $1', [learner]))
        .rows[0].n,
    ).toBe(1);
  });

  it('learnbox_app: session revocation, logout-everywhere, prune', async () => {
    const session = {
      subject: learner,
      issuedAt: Math.floor(Date.now() / 1000) - 5,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      sessionId: randomUUID(),
    };
    expect(await isSessionBlocked(app, session)).toBe(false);
    await revokeSession(app, session);
    expect(await isSessionBlocked(app, session)).toBe(true);
    const other = { ...session, sessionId: randomUUID() };
    expect(await isSessionBlocked(app, other)).toBe(false);
    await revokeAllSessionsForUser(app, learner);
    expect(await isSessionBlocked(app, other)).toBe(true);
    await expect(pruneExpiredRevocations(app)).resolves.toBeTypeOf('number');
  });

  it('learnbox_admin: real content-review store (queue, check, forbidden actor)', async () => {
    const store = new PostgresContentReviewStore(admin as never);
    const queue = await store.listReviewQueue(reviewer);
    expect(queue.status).toBe('ok');
    const forbidden = await store.listReviewQueue(learner);
    expect(forbidden.status).toBe('forbidden');
    await owner.query(`UPDATE card_versions SET status = 'needs_review' WHERE id = $1`, [
      versionId,
    ]);
    const check = await store.recordCheck(reviewer, {
      cardVersionId: versionId,
      dimension: 'provenance',
      outcome: 'passed',
      notes: 'role proof',
      idempotencyKey: randomUUID(),
    });
    expect(check.status).not.toBe('forbidden');
    expect(JSON.stringify(check)).not.toMatch(/permission denied/);
  });

  it('learnbox_app: account deletion end to end as the app role', async () => {
    const result = await deleteAccount(app, {
      userId: learner,
      subjectHash: `h-${learner}`,
      actor: 'learner',
      requestedAt: new Date(),
      requestId: randomUUID(),
    });
    expect(result.status).toBe('deleted');
    expect(
      (await owner.query('SELECT count(*)::int n FROM users WHERE id = $1', [learner])).rows[0].n,
    ).toBe(0);
    expect(
      (await owner.query('SELECT count(*)::int n FROM review_events WHERE user_id = $1', [learner]))
        .rows[0].n,
    ).toBe(0);
    expect(
      (await owner.query('SELECT count(*)::int n FROM cards')).rows[0].n,
    ).toBeGreaterThanOrEqual(35);
  });

  it('negative: learnbox_app cannot touch content, admin or owner tables, or DDL', async () => {
    await expectDenied(app.query(`UPDATE cards SET lemma = lemma WHERE false`));
    await expectDenied(app.query(`INSERT INTO cards (id) SELECT NULL WHERE false`));
    await expectDenied(app.query(`UPDATE card_versions SET status = 'published' WHERE false`));
    await expectDenied(app.query(`SELECT 1 FROM admin_sessions LIMIT 1`));
    await expectDenied(app.query(`SELECT 1 FROM admin_passkey_credentials LIMIT 1`));
    await expectDenied(app.query(`DELETE FROM admin_role_assignments WHERE false`));
    await expectDenied(app.query(`DELETE FROM audit_logs WHERE false`));
    await expectDenied(app.query(`TRUNCATE users`));
    await expectDenied(app.query(`DROP TABLE users`));
    await expectDenied(app.query(`CREATE TABLE lb_forbidden (x int)`));
    await expectDenied(app.query(`ALTER TABLE users ADD COLUMN lb_forbidden int`));
  });

  it('negative: learnbox_admin cannot write learner data, drop, truncate or read secrets it does not need', async () => {
    await expectDenied(admin.query(`INSERT INTO review_events (id) SELECT NULL WHERE false`));
    await expectDenied(admin.query(`UPDATE card_schedules SET lapses = lapses WHERE false`));
    await expectDenied(admin.query(`DELETE FROM users WHERE false`));
    await expectDenied(admin.query(`UPDATE users SET first_name = first_name WHERE false`));
    await expectDenied(
      admin.query(`INSERT INTO mobile_learner_sessions (id) SELECT NULL WHERE false`),
    );
    await expectDenied(admin.query(`SELECT 1 FROM otp_challenges LIMIT 1`));
    await expectDenied(admin.query(`SELECT 1 FROM revoked_sessions LIMIT 1`));
    await expectDenied(admin.query(`DELETE FROM audit_logs WHERE false`));
    await expectDenied(admin.query(`UPDATE audit_logs SET action = action WHERE false`));
    await expectDenied(admin.query(`DELETE FROM cards WHERE false`));
    await expectDenied(admin.query(`TRUNCATE cards`));
    await expectDenied(admin.query(`DROP TABLE cards`));
    await expectDenied(admin.query(`CREATE TABLE lb_forbidden (x int)`));
    await expectDenied(admin.query(`CREATE ROLE lb_forbidden`));
  });
});
