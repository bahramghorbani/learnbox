import type { Pool, PoolClient } from 'pg';

/**
 * Canonical Admin support store for account status (Phase 3 / M3.1).
 *
 * Suspension is a support action on the SAME canonical `users` row the learner runtime
 * authenticates against — there is no Admin-side copy of a user, and no second place where an
 * account can be "disabled". The store writes exactly two things inside one transaction:
 *
 *   1. `users.status`           — the current fact, read by the learner auth boundary.
 *   2. `user_session_cutoffs`   — the canonical "log out everywhere" instant (0020), so an
 *                                 already-issued 30-day session stops working immediately.
 *
 * and records the action in the canonical `audit_logs` (0003), the same trail content, lifecycle,
 * splash and Store listing changes write to. No parallel audit table.
 *
 * It deliberately does NOT touch learning progress, review history, Pack entitlements or purchase
 * records: suspension withdraws the right to act, it does not erase the person. Permanent deletion
 * is a separate lifecycle (0019) this module never calls.
 */

export type AccountStatus = 'active' | 'disabled';

export function isAccountStatus(value: unknown): value is AccountStatus {
  return value === 'active' || value === 'disabled';
}

/** Account control is an owner-level capability, not a content one. */
const allowedRoles = ['super_admin'] as const;

export type AdminUserRow = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  status: AccountStatus;
  createdAt: string;
  cardsStarted: number;
  reviewCount: number;
  lastActivityAt: string | null;
};

export type ListUsersInput = {
  actorUserId: string;
  /** Phone fragment or name fragment. Absent = most recently registered first. */
  search?: string;
};

export type ListUsersResult =
  { status: 'ok'; rows: AdminUserRow[]; total: number } | { status: 'forbidden' };

export type SetUserStatusInput = {
  actorUserId: string;
  userId: string;
  status: AccountStatus;
  /** Operator's own words. Required: a status change with no stated cause is not auditable. */
  reason: string;
  idempotencyKey: string;
};

export type SetUserStatusResult =
  | { status: 'applied'; row: AdminUserRow }
  | { status: 'idempotent'; row: AdminUserRow }
  | { status: 'unchanged'; row: AdminUserRow }
  | { status: 'not_found' }
  | { status: 'forbidden' };

type Queryable = Pick<PoolClient, 'query'>;

/**
 * Activity columns the Admin list shows. Kept as one expression so the list and the single-row
 * read after a mutation can never disagree about what a user looks like.
 */
const userSelection = `
  u.id,
  u.phone_e164                                   AS phone,
  u.first_name                                   AS "firstName",
  u.last_name                                    AS "lastName",
  u.status,
  to_char(u.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "createdAt",
  (SELECT count(*) FROM card_schedules cs WHERE cs.user_id = u.id)::int AS "cardsStarted",
  (SELECT count(*) FROM review_events re WHERE re.user_id = u.id)::int  AS "reviewCount",
  (SELECT to_char(max(re.occurred_at), 'YYYY-MM-DD"T"HH24:MI:SSOF')
     FROM review_events re WHERE re.user_id = u.id)                     AS "lastActivityAt"
`;

export class PostgresAdminUsersStore {
  constructor(private readonly pool: Pool) {}

  /** Bounded so a support list can never become an unpaged export of the whole user base. */
  private static readonly listLimit = 100;

  private async hasRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const result = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM admin_role_assignments
          WHERE user_id = $1 AND role = ANY($2::admin_role[])
       ) AS ok`,
      [actorUserId, allowedRoles],
    );
    return result.rows[0]?.ok === true;
  }

  private async readUser(client: Queryable, userId: string): Promise<AdminUserRow | undefined> {
    const result = await client.query<AdminUserRow>(
      `SELECT ${userSelection} FROM users u WHERE u.id = $1`,
      [userId],
    );
    return result.rows[0];
  }

  /**
   * Was this exact support action already recorded? The canonical audit trail is the idempotency
   * record too — a retried request finds its own earlier entry instead of writing a second one.
   */
  private async alreadyApplied(
    client: Queryable,
    userId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const result = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM audit_logs
          WHERE entity_type = 'user_account_status'
            AND entity_id = $1::uuid
            AND metadata->>'idempotency_key' = $2
       ) AS ok`,
      [userId, idempotencyKey],
    );
    return result.rows[0]?.ok === true;
  }

  async listUsers(input: ListUsersInput): Promise<ListUsersResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      const search = input.search?.trim();
      const pattern = search ? `%${search}%` : null;
      const rows = await client.query<AdminUserRow>(
        `SELECT ${userSelection}
           FROM users u
          WHERE $1::text IS NULL
             OR u.phone_e164 ILIKE $1
             OR coalesce(u.first_name, '') ILIKE $1
             OR coalesce(u.last_name, '') ILIKE $1
          ORDER BY u.created_at DESC
          LIMIT ${PostgresAdminUsersStore.listLimit}`,
        [pattern],
      );
      const total = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total
           FROM users u
          WHERE $1::text IS NULL
             OR u.phone_e164 ILIKE $1
             OR coalesce(u.first_name, '') ILIKE $1
             OR coalesce(u.last_name, '') ILIKE $1`,
        [pattern],
      );
      return { status: 'ok', rows: rows.rows, total: total.rows[0]?.total ?? 0 };
    } finally {
      client.release();
    }
  }

  /**
   * Suspend or restore one account.
   *
   * Disabling writes the session cutoff in the same transaction as the status change, so there is
   * no instant at which an account is suspended but its existing sessions still work. Restoring
   * does NOT move the cutoff back: a cutoff already issued stays issued, so the sessions that were
   * killed stay dead and the learner authenticates again from scratch.
   */
  async setUserStatus(input: SetUserStatusInput): Promise<SetUserStatusResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const existing = await this.readUser(client, input.userId);
      if (!existing) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      if (await this.alreadyApplied(client, input.userId, input.idempotencyKey)) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', row: existing };
      }

      // Already in the requested state: report it and write no audit entry. A no-op is not a
      // support action, and recording it would make the trail lie about what changed.
      if (existing.status === input.status) {
        await client.query('ROLLBACK');
        return { status: 'unchanged', row: existing };
      }

      // The status predicate is the concurrency guard: two operators acting on the same account at
      // once leave exactly one transition, and the loser sees the state it did not expect.
      const updated = await client.query<{ id: string }>(
        `UPDATE users
            SET status = $2
          WHERE id = $1::uuid
            AND status = $3
        RETURNING id`,
        [input.userId, input.status, existing.status],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { status: 'unchanged', row: existing };
      }

      if (input.status === 'disabled') {
        // Canonical "log out everywhere" cutoff (0020) — the same row the learner's own
        // log-out-everywhere writes. Every session issued before now stops authenticating.
        await client.query(
          `INSERT INTO user_session_cutoffs (user_id, sessions_valid_from)
           VALUES ($1::uuid, now())
           ON CONFLICT (user_id) DO UPDATE SET sessions_valid_from = now()`,
          [input.userId],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'user_account_status', $3::uuid, $4)`,
        [
          input.actorUserId,
          input.status === 'disabled' ? 'user.disable' : 'user.reactivate',
          input.userId,
          {
            reason: input.reason,
            previous_status: existing.status,
            new_status: input.status,
            sessions_cut_off: input.status === 'disabled',
            idempotency_key: input.idempotencyKey,
          },
        ],
      );

      const row = await this.readUser(client, input.userId);
      await client.query('COMMIT');
      return { status: 'applied', row: row ?? { ...existing, status: input.status } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
