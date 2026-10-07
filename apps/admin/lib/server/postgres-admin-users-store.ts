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
 *
 * M3.2 adds manual pack entitlements to the same store, for the same reason: `user_packs` is the
 * canonical entitlement the learner runtime reads, so a support grant writes that row and nothing
 * else. Payment records are read for provenance and never written.
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

/**
 * How a learner came to hold an entitlement. The canonical `user_packs.acquisition_type`
 * vocabulary, widened by 0029 with 'support' so a manual grant is never mistaken for a payment or
 * for self-service activation.
 */
export type PackAcquisition = 'free' | 'purchased' | 'support';

export function isPackAcquisition(value: unknown): value is PackAcquisition {
  return value === 'free' || value === 'purchased' || value === 'support';
}

/**
 * One pack as support needs to see it for one learner: what the learner can actually read right
 * now, why, and which of the two manual actions is legitimate.
 *
 * `grant` and `revoke` are decisions, not suggestions — the server recomputes them from this same
 * reader when the mutation arrives, so a stale screen or a hand-written request cannot talk the
 * backend into an action the view said was unavailable.
 */
export type PackEntitlementRow = {
  packId: string;
  title: string;
  isFree: boolean;
  published: boolean;
  /** null = the learner holds no entitlement row for this pack. */
  acquisition: PackAcquisition | null;
  acquiredAt: string | null;
  /**
   * Payment provenance, present only for a 'purchased' entitlement. Read-only evidence: status and
   * verification instant, never a token, never a gateway secret.
   */
  purchase: { status: string; verifiedAt: string | null; amountTomans: number | null } | null;
  /** The canonical M2.2 answer: may this learner read this pack's content right now? */
  hasAccess: boolean;
  /** Why they have access, so the UI never implies an entitlement is what unlocks a free pack. */
  accessVia: 'free_pack' | 'entitlement' | null;
  grant: GrantVerdict;
  revoke: RevokeVerdict;
};

/**
 * `free_pack`: every authenticated learner already reads a published free pack (M2.2), so an
 * entitlement row would grant nothing and would misrepresent why access exists.
 * `disabled_account`: granting access to a suspended account produces an entitlement the learner
 * cannot use; reactivate first (M3.1).
 */
export type GrantVerdict = 'allowed' | 'already_owned' | 'free_pack' | 'disabled_account';

/**
 * Only a support-issued entitlement is revocable here, and the DELETE statement enforces exactly
 * that — the verdict and the write agree by construction, so a request that races past this read
 * still cannot remove anything else.
 *
 * `purchased`: a verified payment is financial evidence. Ordinary support revoke must not destroy
 * the access a learner paid for — that is a refund decision with a policy and a money movement
 * behind it, and refunds are deliberately not implemented here.
 * `free_acquisition`: the learner activated a free pack themselves (M2.3). That is their action,
 * not a support grant, and while the pack is free the canonical rule (M2.2) grants access with or
 * without the row — so deleting it would revoke nothing and would misreport what happened.
 */
export type RevokeVerdict = 'allowed' | 'not_entitled' | 'purchased' | 'free_acquisition';

export type SetPackEntitlementInput = {
  actorUserId: string;
  userId: string;
  packId: string;
  action: 'grant' | 'revoke';
  /** Operator's own words. Required for BOTH directions. */
  reason: string;
  idempotencyKey: string;
};

export type SetPackEntitlementResult =
  | { status: 'applied'; row: PackEntitlementRow }
  | { status: 'idempotent'; row: PackEntitlementRow }
  /** The action is not legitimate for this pack's current provenance; `verdict` says why. */
  | { status: 'refused'; verdict: GrantVerdict | RevokeVerdict; row: PackEntitlementRow }
  | { status: 'not_found' }
  | { status: 'forbidden' };

export type ReadPackEntitlementsResult =
  { status: 'ok'; rows: PackEntitlementRow[] } | { status: 'not_found' } | { status: 'forbidden' };

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
    entityType: 'user_account_status' | 'user_pack_entitlement',
    userId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    const result = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM audit_logs
          WHERE entity_type = $1
            AND entity_id = $2::uuid
            AND metadata->>'idempotency_key' = $3
       ) AS ok`,
      [entityType, userId, idempotencyKey],
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

      if (
        await this.alreadyApplied(client, 'user_account_status', input.userId, input.idempotencyKey)
      ) {
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

  /**
   * Every pack, as it stands for one learner. One reader serves both the support screen and the
   * mutation's own re-validation, which is what stops the UI and the server from ever disagreeing
   * about whether an action is legal.
   */
  private async readEntitlements(
    client: Queryable,
    userId: string,
    accountStatus: AccountStatus,
    packId?: string,
  ): Promise<PackEntitlementRow[]> {
    const result = await client.query<{
      packId: string;
      title: string;
      isFree: boolean;
      published: boolean;
      acquisition: PackAcquisition | null;
      acquiredAt: string | null;
      purchaseStatus: string | null;
      purchaseVerifiedAt: string | null;
      purchaseAmount: number | null;
    }>(
      `SELECT p.id                                               AS "packId",
              p.display_name                                     AS title,
              p.is_free                                          AS "isFree",
              (p.status = 'published')                           AS published,
              up.acquisition_type                                AS acquisition,
              to_char(up.acquired_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "acquiredAt",
              pe.status::text                                    AS "purchaseStatus",
              to_char(pe.verified_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS "purchaseVerifiedAt",
              pe.amount_tomans                                   AS "purchaseAmount"
         FROM packs p
         LEFT JOIN user_packs up ON up.pack_id = p.id AND up.user_id = $1::uuid
         LEFT JOIN purchase_events pe ON pe.id = up.purchase_event_id
        WHERE $2::text IS NULL OR p.id = $2
        ORDER BY p.created_at, p.id`,
      [userId, packId ?? null],
    );

    return result.rows.map((row) => {
      const entitled = row.acquisition !== null;
      // The canonical M2.2 rule, re-expressed over the columns this query already read:
      // published AND (is_free OR an entitlement row exists). `apps/website/lib/pack-access.ts`
      // remains the one enforcing definition — a real-Postgres test asserts this view and that
      // predicate agree on the same database, so a divergence fails the build rather than
      // misinforming support.
      const freeAccess = row.published && row.isFree;
      const hasAccess = freeAccess || (row.published && entitled);
      return {
        packId: row.packId,
        title: row.title,
        isFree: row.isFree,
        published: row.published,
        acquisition: row.acquisition,
        acquiredAt: row.acquiredAt,
        purchase:
          row.acquisition === 'purchased' && row.purchaseStatus
            ? {
                status: row.purchaseStatus,
                verifiedAt: row.purchaseVerifiedAt,
                amountTomans: row.purchaseAmount,
              }
            : null,
        hasAccess,
        accessVia: freeAccess ? 'free_pack' : hasAccess ? 'entitlement' : null,
        grant: entitled
          ? 'already_owned'
          : row.isFree
            ? 'free_pack'
            : accountStatus === 'disabled'
              ? 'disabled_account'
              : 'allowed',
        revoke: !entitled
          ? 'not_entitled'
          : row.acquisition === 'purchased'
            ? 'purchased'
            : row.acquisition === 'free'
              ? 'free_acquisition'
              : 'allowed',
      };
    });
  }

  async readPackEntitlements(input: {
    actorUserId: string;
    userId: string;
  }): Promise<ReadPackEntitlementsResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };
      const user = await this.readUser(client, input.userId);
      if (!user) return { status: 'not_found' };
      return { status: 'ok', rows: await this.readEntitlements(client, input.userId, user.status) };
    } finally {
      client.release();
    }
  }

  /**
   * Grant or revoke ONE pack entitlement manually.
   *
   * Grant writes a single `user_packs` row with `acquisition_type = 'support'` and NO
   * `purchase_event_id`. No payment is invented: no `purchase_events` row is created, none is
   * updated, and the 0029 provenance constraint makes a support grant that points at a transaction
   * impossible to write at all.
   *
   * Revoke deletes a support-issued row and nothing else. The `acquisition_type = 'support'`
   * predicate in the DELETE is the real guard, not the verdict above it: even a request that races
   * past the pre-read cannot remove a purchased entitlement, because the statement that would do it
   * matches no row. Purchase records are never read for mutation here, only for display.
   */
  async setPackEntitlement(input: SetPackEntitlementInput): Promise<SetPackEntitlementResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const user = await this.readUser(client, input.userId);
      if (!user) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      const [before] = await this.readEntitlements(client, input.userId, user.status, input.packId);
      if (!before) {
        // No such canonical pack. Same 404 as an unknown learner: an operator probing ids learns
        // nothing about what exists.
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      // Scoped to this entity type: a key reused across a suspension and a grant is two different
      // actions, and neither may be mistaken for a replay of the other.
      if (
        await this.alreadyApplied(
          client,
          'user_pack_entitlement',
          input.userId,
          input.idempotencyKey,
        )
      ) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', row: before };
      }

      const verdict = input.action === 'grant' ? before.grant : before.revoke;
      if (verdict !== 'allowed') {
        await client.query('ROLLBACK');
        return { status: 'refused', verdict, row: before };
      }

      if (input.action === 'grant') {
        // UNIQUE (user_id, pack_id) is the concurrency guard: two operators granting at once leave
        // exactly one row, and the loser is reported as a replay rather than failing.
        const inserted = await client.query(
          `INSERT INTO user_packs (user_id, pack_id, acquisition_type)
           VALUES ($1::uuid, $2, 'support')
           ON CONFLICT (user_id, pack_id) DO NOTHING`,
          [input.userId, input.packId],
        );
        if (inserted.rowCount !== 1) {
          await client.query('ROLLBACK');
          const [current] = await this.readEntitlements(
            client,
            input.userId,
            user.status,
            input.packId,
          );
          return { status: 'refused', verdict: 'already_owned', row: current ?? before };
        }
      } else {
        const deleted = await client.query(
          `DELETE FROM user_packs
            WHERE user_id = $1::uuid AND pack_id = $2 AND acquisition_type = 'support'`,
          [input.userId, input.packId],
        );
        if (deleted.rowCount !== 1) {
          await client.query('ROLLBACK');
          const [current] = await this.readEntitlements(
            client,
            input.userId,
            user.status,
            input.packId,
          );
          return { status: 'refused', verdict: 'not_entitled', row: current ?? before };
        }
      }

      const [after] = await this.readEntitlements(client, input.userId, user.status, input.packId);

      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'user_pack_entitlement', $3::uuid, $4)`,
        [
          input.actorUserId,
          input.action === 'grant' ? 'user_pack.grant' : 'user_pack.revoke',
          input.userId,
          {
            reason: input.reason,
            pack_id: input.packId,
            previous_acquisition: before.acquisition,
            previous_access: before.hasAccess,
            new_acquisition: after?.acquisition ?? null,
            new_access: after?.hasAccess ?? false,
            pack_is_free: before.isFree,
            pack_published: before.published,
            idempotency_key: input.idempotencyKey,
          },
        ],
      );

      await client.query('COMMIT');
      return { status: 'applied', row: after ?? before };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
