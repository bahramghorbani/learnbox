type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

/**
 * Admin payment operations (Phase 2 / M2.4).
 *
 * Two read-only capabilities, deliberately no writes:
 *
 *   * transaction inspection — what support needs to answer "I paid and got nothing";
 *   * gateway configuration status — whether the paid flow is switched on and whether it has
 *     actually worked.
 *
 * There is NO merchant-credential write path and this module never reads the merchant id. See
 * `readPaymentConfigurationStatus` for why.
 */

/** Reading payment records is an operational/support capability, not an editorial one. */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;

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
};

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
    limit?: number;
  }): Promise<ListTransactionsResult> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId, readerRoles))) {
        return { status: 'forbidden' };
      }
      const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
      const result = await client.query(
        `SELECT pe.id,
                pe.user_id,
                pe.pack_id,
                p.display_name,
                pe.amount_tomans,
                pe.provider::text        AS provider,
                pe.environment::text     AS environment,
                pe.status::text          AS status,
                pe.provider_purchase_id,
                pe.provider_reference,
                pe.created_at,
                pe.updated_at,
                pe.verified_at
           FROM purchase_events pe
           LEFT JOIN packs p ON p.id = pe.pack_id
          WHERE ($2::text IS NULL OR pe.pack_id = $2)
            AND ($3::text IS NULL OR pe.status::text = $3)
          ORDER BY pe.created_at DESC
          LIMIT $1`,
        [limit, input.packId ?? null, input.status ?? null],
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
        })),
      };
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
