import type { Pool, PoolClient } from 'pg';

import {
  ACCOUNT_DELETION_POLICY_VERSION,
  LEARNER_DATA_TABLES,
  PROTECTED_TABLES,
  type DeletionActor,
  type DeletionCounts,
} from './account-deletion';

/**
 * Postgres execution of an account deletion (LB-B04).
 *
 * Everything runs inside ONE transaction, so a partial failure leaves the account fully intact
 * rather than half-deleted. Retry safety comes from the transaction plus the idempotent outcome:
 * a second call for an already-deleted account finds no user row and reports `already_deleted`
 * instead of failing or writing a duplicate audit row.
 */

/**
 * Accounts that cannot be deleted by this path.
 *
 * `content_review_decisions.reviewer_user_id` and `admin_owner.user_id` are NOT NULL / RESTRICT
 * references: deleting such an account would either fail mid-transaction or destroy the content
 * review audit chain. These are owner/reviewer identities, not ordinary learners, so the request is
 * refused explicitly instead of partially applied.
 */
export type DeletionRefusal = { readonly status: 'refused'; readonly reason: 'privileged_account' };

export type DeletionOutcome =
  | { readonly status: 'deleted'; readonly deletionId: string; readonly counts: DeletionCounts }
  /** A retry of a completed deletion: carries the ORIGINAL deletion id, never a new one. */
  | { readonly status: 'already_deleted'; readonly deletionId: string }
  | DeletionRefusal;

/** Statically guarantee no protected table can ever reach a DELETE statement. */
function assertDeletableTable(table: string): void {
  if (PROTECTED_TABLES.includes(table)) {
    throw new Error(`refusing to delete from protected table ${table}`);
  }
  if (!LEARNER_DATA_TABLES.includes(table)) {
    throw new Error(`table ${table} is not part of the learner deletion set`);
  }
  // Defence in depth: identifiers are never interpolated from user input, but this makes a future
  // careless edit fail loudly instead of opening an injection path.
  if (!/^[a-z_]+$/.test(table)) throw new Error(`unsafe table identifier ${table}`);
}

async function deleteRows(client: PoolClient, table: string, userId: string): Promise<number> {
  assertDeletableTable(table);
  const result = await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rowCount ?? 0;
}

export async function deleteAccount(
  pool: Pool,
  input: {
    readonly userId: string;
    readonly subjectHash: string;
    readonly actor: DeletionActor;
    readonly requestedAt: Date;
    /** Client-supplied idempotency key; a repeat returns the first outcome. */
    readonly requestId: string;
  },
): Promise<DeletionOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Idempotency first: if this exact request already completed, return the original result.
    //    This must precede the user lookup, because after a successful deletion the user row is
    //    gone and an unkeyed retry would otherwise be indistinguishable from a bogus request.
    const prior = await client.query<{ id: string }>(
      'SELECT id FROM account_deletion_events WHERE request_id = $1',
      [input.requestId],
    );
    if ((prior.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return { status: 'already_deleted', deletionId: prior.rows[0].id };
    }

    // Lock the account row so two concurrent deletion requests cannot interleave.
    const user = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [input.userId],
    );
    if (user.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 'already_deleted' };
    }

    // 1. Refuse privileged accounts before anything is touched.
    const privileged = await client.query<{ blocked: string }>(
      `SELECT '1' AS blocked
         WHERE EXISTS (SELECT 1 FROM admin_owner WHERE user_id = $1)
            OR EXISTS (SELECT 1 FROM content_review_decisions WHERE reviewer_user_id = $1)
            OR EXISTS (SELECT 1 FROM content_review_checks WHERE reviewer_user_id = $1)
            OR EXISTS (SELECT 1 FROM admin_role_assignments WHERE user_id = $1)`,
      [input.userId],
    );
    if ((privileged.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return { status: 'refused', reason: 'privileged_account' };
    }

    // 2. Preserve durable purchase evidence BEFORE anything is destroyed.
    //
    // purchase_events.user_id is NOT NULL REFERENCES users(id), so the rows cannot outlive the
    // account. Their ownership evidence is promoted into purchase_ownership_claims, which
    // deliberately has no users foreign key and therefore survives deletion. ON CONFLICT keeps the
    // promotion idempotent and prevents replay duplicates.
    const preserved = await client.query(
      `INSERT INTO purchase_ownership_claims
         (provider, provider_purchase_id, product_id, subject_hash, entitlement_keys,
          status, purchased_at)
       SELECT pe.provider, pe.provider_purchase_id, pe.product_id, $2, bp.entitlement_keys,
              pe.status, COALESCE(pe.verified_at, pe.created_at)
         FROM purchase_events pe
         JOIN billing_products bp ON bp.id = pe.product_id
        WHERE pe.user_id = $1
          AND pe.status IN ('verified', 'refunded', 'revoked')
       ON CONFLICT (provider, provider_purchase_id) DO NOTHING`,
      [input.userId, input.subjectHash],
    );

    // 3. Clear live learner data, children first.
    const counts: Record<string, number> = {};
    for (const table of LEARNER_DATA_TABLES) {
      counts[table] = await deleteRows(client, table, input.userId);
    }

    // The original purchase rows are learner-linked records; their durable evidence now lives in
    // purchase_ownership_claims, so the linked rows go with the account.
    await client.query('DELETE FROM purchase_events WHERE user_id = $1', [input.userId]);

    // 4. Anonymise rather than delete the operational audit trail: the record that an action
    //    happened is retained, the link to the person is not.
    await client.query('UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1', [
      input.userId,
    ]);

    // 5. Remove the account itself. The phone number is released immediately (owner decision),
    //    so the same person can re-register straight away.
    await client.query('DELETE FROM users WHERE id = $1', [input.userId]);

    // 6. Record the minimal audit trail, with accurate disposition counts.
    const deletionCounts: DeletionCounts = {
      reviewEventsRemoved: counts.review_events ?? 0,
      schedulesRemoved: counts.card_schedules ?? 0,
      sessionsRemoved: counts.mobile_learner_sessions ?? 0,
      purchasesPreserved: preserved.rowCount ?? 0,
    };

    const audit = await client.query<{ id: string }>(
      `INSERT INTO account_deletion_events
         (subject_hash, prior_user_id, requested_at, status, actor, request_id, policy_version,
          review_events_removed, schedules_removed, sessions_removed, purchases_preserved)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.subjectHash,
        input.userId,
        input.requestedAt.toISOString(),
        input.actor,
        input.requestId,
        ACCOUNT_DELETION_POLICY_VERSION,
        deletionCounts.reviewEventsRemoved,
        deletionCounts.schedulesRemoved,
        deletionCounts.sessionsRemoved,
        deletionCounts.purchasesPreserved,
      ],
    );

    await client.query('COMMIT');
    return { status: 'deleted', deletionId: audit.rows[0].id, counts: deletionCounts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
