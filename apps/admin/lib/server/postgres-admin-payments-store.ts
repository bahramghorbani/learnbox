type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

/**
 * Admin payment operations (Phase 2 / M2.4).
 *
 * Read capabilities plus ONE narrow write:
 *
 *   * transaction inspection — what support needs to answer "I paid and got nothing": search by
 *     Authority, RefID, order code, attempt id or learner id; review flags; order timeline;
 *   * gateway configuration status — whether the paid flow is switched on and whether it has
 *     actually worked;
 *   * a re-check REQUEST (commerce contract §4): an append-only event that the reconciliation job
 *     executes. Admin never calls the gateway, never edits a payment, never grants from here.
 *
 * There is NO merchant-credential write path and this module never reads the merchant id. See
 * `readPaymentConfigurationStatus` for why.
 */

/** Reading payment records is an operational/support capability, not an editorial one. */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;
/** Asking for a provider re-check is an operator action, kept to the top role. */
const recheckRoles = ['super_admin'] as const;
/** Same cap as `maxAutomaticChecks` in apps/website/lib/store-purchase.ts. */
const maxAutomaticChecks = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Free-text search accepts only identifier-shaped input: Authority, RefID, order code, uuid. */
const searchPattern = /^[A-Za-z0-9-]{4,64}$/;

export type AdminTransactionRow = {
  /** The internal LearnBox transaction id support quotes back to the learner. */
  transactionId: string;
  userId: string;
  /** Null only for legacy store-billing rows, which have a product instead of a pack. */
  packId: string | null;
  packDisplayName: string | null;
  amountTomans: number | null;
  provider: string;
  environment: string;
  status: string;
  /** Zarinpal Authority — the gateway session handle. */
  providerPurchaseId: string;
  /** Zarinpal RefID — only ever present on a verified payment. */
  providerReference: string | null;
  createdAt: string;
  updatedAt: string | null;
  verifiedAt: string | null;
  /** Commerce core (0039). Null for attempts created before orders existed. */
  orderCode: string | null;
  orderStatus: string | null;
  /** Exact amount sent to the gateway, and its unit (always IRR for Zarinpal). */
  providerAmount: string | null;
  providerCurrency: string | null;
  /** `already_entitled` (extra valid payment) or `provider_mismatch`; null when nothing to review. */
  reviewReason: string | null;
  lastProviderCode: number | null;
  checkCount: number;
  lastCheckedAt: string | null;
  /** A re-check was requested and has not run yet. */
  recheckPending: boolean;
  /** When the outstanding re-check was requested (null when none is outstanding). */
  recheckRequestedAt: string | null;
  /**
   * What automatic reconciliation does next: `scheduled`; `stopped_review` (flagged answer);
   * `stopped_limit` (check cap reached); `stopped_window` (too old); `settled`; `not_applicable`.
   */
  autoCheck: string;
};

export type OrderTimelineEvent = {
  kind: string;
  source: string;
  providerCode: number | null;
  attemptId: string | null;
  createdAt: string;
};

export type RequestRecheckResult =
  | { status: 'requested' | 'already_requested' }
  | { status: 'not_recheckable' | 'not_found' | 'forbidden' };

export type ListTransactionsResult =
  { status: 'ok'; rows: AdminTransactionRow[] } | { status: 'forbidden' };

export type PaymentConfigurationStatus = {
  /**
   * - `disabled`  — the paid flow is switched off.
   * - `unproven`  — switched on, but no real payment has ever been verified here, so the merchant
   *                 credential is NOT known to be correct.
   * - `ready`     — at least one payment has been verified in this environment, which is the only
   *                 genuine proof that the credential works.
   */
  state: 'disabled' | 'unproven' | 'ready';
  enabled: boolean;
  environment: 'sandbox' | 'production' | null;
  provider: 'zarinpal';
  verifiedCount: number;
  pendingCount: number;
  failedCount: number;
  lastVerifiedAt: string | null;
};

export type PaymentConfigurationResult =
  { status: 'ok'; configuration: PaymentConfigurationStatus } | { status: 'forbidden' };

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function timestamp(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

export class PostgresAdminPaymentsStore {
  constructor(private readonly pool: DatabasePool) {}

  private async hasRole(
    client: Queryable,
    actorUserId: string,
    roles: readonly string[],
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM admin_role_assignments
        WHERE user_id = $1::uuid AND role::text = ANY($2::text[]) LIMIT 1`,
      [actorUserId, roles],
    );
    return result.rows.length > 0;
  }

  /**
   * Newest transactions first, optionally narrowed to one pack or one canonical status.
   *
   * Bounded by `limit` because an operations list is for looking at a problem, not for exporting
   * the ledger. No aggregation, no revenue totals: a sales dashboard is explicitly out of scope.
   */
  async listTransactions(input: {
    actorUserId: string;
    packId?: string;
    status?: string;
    /** Authority, RefID, order code, attempt id or learner id. */
    query?: string;
    /** Only attempts that need operator attention. */
    needsReview?: boolean;
    limit?: number;
  }): Promise<ListTransactionsResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, readerRoles))) {
        return { status: 'forbidden' };
      }
      const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
      const query = input.query && searchPattern.test(input.query) ? input.query : null;
      const result = await client.query(
        `SELECT pe.id,
                pe.user_id,
                pe.pack_id,
                COALESCE(po.pack_display_name, p.display_name) AS display_name,
                pe.amount_tomans,
                pe.provider::text        AS provider,
                pe.environment::text     AS environment,
                pe.status::text          AS status,
                pe.provider_purchase_id,
                pe.provider_reference,
                pe.created_at,
                pe.updated_at,
                pe.verified_at,
                po.public_code,
                po.status                AS order_status,
                pe.provider_amount::text AS provider_amount,
                pe.provider_currency,
                pe.review_reason,
                pe.last_provider_code,
                pe.check_count,
                pe.last_checked_at,
                (SELECT max(e.created_at) FROM purchase_order_events e
                  WHERE e.attempt_id = pe.id AND e.kind = 'recheck_requested'
                    AND e.created_at > COALESCE(pe.last_checked_at, '-infinity')) AS recheck_requested_at,
                -- Mirrors reconcilePurchases candidates (apps/website/lib/store-purchase.ts).
                CASE
                  WHEN pe.status::text NOT IN ('pending', 'cancelled') THEN 'settled'
                  WHEN pe.order_id IS NULL OR pe.provider::text <> 'zarinpal' THEN 'not_applicable'
                  WHEN pe.review_reason IS NOT NULL THEN 'stopped_review'
                  WHEN pe.check_count >= ${maxAutomaticChecks} THEN 'stopped_limit'
                  WHEN pe.status = 'pending' AND pe.created_at < now() - interval '7 days' THEN 'stopped_window'
                  WHEN pe.status = 'cancelled' AND (pe.last_checked_at IS NOT NULL
                       OR pe.created_at < now() - interval '24 hours') THEN 'stopped_window'
                  ELSE 'scheduled'
                END AS auto_check
           FROM purchase_events pe
           LEFT JOIN packs p ON p.id = pe.pack_id
           LEFT JOIN purchase_orders po ON po.id = pe.order_id
          WHERE ($2::text IS NULL OR pe.pack_id = $2)
            AND ($3::text IS NULL OR pe.status::text = $3)
            AND ($4::text IS NULL
                 OR pe.provider_purchase_id = $4
                 OR pe.provider_reference = $4
                 OR po.public_code = upper($4)
                 OR ($5::boolean AND (pe.id = $4::uuid OR pe.user_id = $4::uuid)))
            AND (NOT $6::boolean OR pe.review_reason IS NOT NULL OR po.status = 'needs_review'
                 OR (pe.status = 'pending' AND pe.created_at < now() - interval '30 minutes'))
          ORDER BY pe.created_at DESC
          LIMIT $1`,
        [
          limit,
          input.packId ?? null,
          input.status ?? null,
          query,
          query !== null && uuidPattern.test(query),
          input.needsReview === true,
        ],
      );
      return {
        status: 'ok',
        rows: result.rows.map((row) => ({
          transactionId: String(row.id),
          userId: String(row.user_id),
          packId: text(row.pack_id),
          packDisplayName: text(row.display_name),
          amountTomans: typeof row.amount_tomans === 'number' ? row.amount_tomans : null,
          provider: String(row.provider),
          environment: String(row.environment),
          status: String(row.status),
          providerPurchaseId: String(row.provider_purchase_id),
          providerReference: text(row.provider_reference),
          createdAt: timestamp(row.created_at) ?? '',
          updatedAt: timestamp(row.updated_at),
          verifiedAt: timestamp(row.verified_at),
          orderCode: text(row.public_code),
          orderStatus: text(row.order_status),
          providerAmount: text(row.provider_amount),
          providerCurrency: text(row.provider_currency),
          reviewReason: text(row.review_reason),
          lastProviderCode:
            typeof row.last_provider_code === 'number' ? row.last_provider_code : null,
          checkCount: typeof row.check_count === 'number' ? row.check_count : 0,
          lastCheckedAt: timestamp(row.last_checked_at),
          recheckPending: row.recheck_requested_at !== null,
          recheckRequestedAt: timestamp(row.recheck_requested_at),
          autoCheck: String(row.auto_check),
        })),
      };
    } finally {
      client.release();
    }
  }

  /** The order timeline behind one attempt: every attempt of the same order, oldest first. */
  async readOrderTimeline(input: {
    actorUserId: string;
    transactionId: string;
  }): Promise<
    { status: 'ok'; events: OrderTimelineEvent[] } | { status: 'forbidden' | 'not_found' }
  > {
    if (!uuidPattern.test(input.transactionId)) return { status: 'not_found' };
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, readerRoles))) {
        return { status: 'forbidden' };
      }
      const result = await client.query(
        `SELECT e.kind, e.source, e.provider_code, e.attempt_id, e.created_at
           FROM purchase_order_events e
          WHERE e.order_id = (SELECT order_id FROM purchase_events WHERE id = $1::uuid)
          ORDER BY e.id
          LIMIT 200`,
        [input.transactionId],
      );
      return {
        status: 'ok',
        events: result.rows.map((row) => ({
          kind: String(row.kind),
          source: String(row.source),
          providerCode: typeof row.provider_code === 'number' ? row.provider_code : null,
          attemptId: text(row.attempt_id),
          createdAt: timestamp(row.created_at) ?? '',
        })),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Queues a provider re-check for one unsettled attempt. Append-only: the reconciliation job
   * picks it up and settles through the learner runtime's single verification path. Idempotent
   * while a request is outstanding, so double clicks and retries add nothing.
   */
  async requestRecheck(input: {
    actorUserId: string;
    transactionId: string;
  }): Promise<RequestRecheckResult> {
    if (!uuidPattern.test(input.transactionId)) return { status: 'not_found' };
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, recheckRoles))) {
        return { status: 'forbidden' };
      }
      const attempt = (
        await client.query(
          `SELECT pe.order_id, pe.status::text AS status, pe.provider::text AS provider,
                  EXISTS (SELECT 1 FROM purchase_order_events e
                           WHERE e.attempt_id = pe.id AND e.kind = 'recheck_requested'
                             AND e.created_at > COALESCE(pe.last_checked_at, '-infinity')) AS pending
             FROM purchase_events pe WHERE pe.id = $1::uuid`,
          [input.transactionId],
        )
      ).rows[0];
      if (!attempt) return { status: 'not_found' };
      if (
        attempt.order_id === null ||
        attempt.provider !== 'zarinpal' ||
        !['pending', 'cancelled', 'failed'].includes(String(attempt.status))
      ) {
        return { status: 'not_recheckable' };
      }
      if (attempt.pending === true) return { status: 'already_requested' };
      await client.query(
        `INSERT INTO purchase_order_events (order_id, attempt_id, kind, source, actor_user_id)
         VALUES ($1::uuid, $2::uuid, 'recheck_requested', 'admin_recheck', $3::uuid)`,
        [attempt.order_id, input.transactionId, input.actorUserId],
      );
      return { status: 'requested' };
    } finally {
      client.release();
    }
  }

  /**
   * Gateway configuration status, derived from a non-secret feature flag plus OBSERVED evidence in
   * the shared database.
   *
   * Admin deliberately never reads `ZARINPAL_MERCHANT_ID`. Two reasons:
   *
   *   1. Admin runs as its own deployment with its own environment. Reading the variable here would
   *      report on Admin's environment, not on the learner runtime that actually calls Zarinpal —
   *      a status label that is wrong exactly when it matters.
   *   2. Provisioning a live payment credential to a second service that has no use for it widens
   *      the secret's blast radius to buy a green tick.
   *
   * So the credential's validity is reported from the only thing that genuinely proves it: whether
   * a payment has ever been verified in this environment. Before that, the honest answer is
   * "configured but unproven", which is also the true state until the owner's real Merchant ID has
   * completed one live transaction.
   */
  async readConfigurationStatus(input: {
    actorUserId: string;
    environment: Record<string, string | undefined>;
  }): Promise<PaymentConfigurationResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, readerRoles))) {
        return { status: 'forbidden' };
      }
      const enabled = input.environment.LEARNBOX_ZARINPAL_ENABLED === 'true';
      // Mirrors the learner runtime: anything other than an explicit 'false' means sandbox.
      const gatewayEnvironment =
        input.environment.ZARINPAL_SANDBOX !== 'false' ? 'sandbox' : 'production';

      const result = await client.query(
        `SELECT
           count(*) FILTER (WHERE status = 'verified')  AS verified,
           count(*) FILTER (WHERE status = 'pending')   AS pending,
           count(*) FILTER (WHERE status = 'failed')    AS failed,
           max(verified_at) FILTER (WHERE status = 'verified') AS last_verified_at
         FROM purchase_events
        WHERE provider = 'zarinpal' AND environment::text = $1`,
        [gatewayEnvironment],
      );
      const row = result.rows[0] ?? {};
      const verifiedCount = Number(row.verified ?? 0);

      return {
        status: 'ok',
        configuration: {
          state: !enabled ? 'disabled' : verifiedCount > 0 ? 'ready' : 'unproven',
          enabled,
          environment: enabled ? gatewayEnvironment : null,
          provider: 'zarinpal',
          verifiedCount,
          pendingCount: Number(row.pending ?? 0),
          failedCount: Number(row.failed ?? 0),
          lastVerifiedAt: timestamp(row.last_verified_at),
        },
      };
    } finally {
      client.release();
    }
  }
}
