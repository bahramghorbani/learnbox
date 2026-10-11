type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

/**
 * Admin Dashboard overview (Stage 2 of docs/planning/ADMIN_UI_IMPLEMENTATION_PLAN.md) — read-only.
 *
 * The reference control room shows six KPI cards, three charts and three newest-first lists. This
 * module produces every figure behind them from the canonical central database, and nothing else:
 *
 *   * no number is derived from a paginated list — a count is always `count(*)` in PostgreSQL, so
 *     a dashboard total can never silently mean "among the rows the UI happened to load";
 *   * a metric with no granted data source is returned as explicitly unavailable, never as 0, so
 *     the UI can tell "nobody did this" apart from "we cannot see this";
 *   * no personal learner field is read. There is no phone number, no name and no e-mail in this
 *     payload: identity lookups belong to the support surface, behind its own flag and
 *     `super_admin`. The newest-learner list carries the opaque id, the account status and the
 *     join timestamp, which is what an overview needs and nothing more.
 *
 * Every statement is a SELECT on a table `learnbox_admin` already holds SELECT on
 * (infrastructure/database/db-roles-p0.sql plus migrations 0029/0032), so Stage 2 needs no grant
 * and no migration. `test/admin-dashboard-grants.test.ts` enforces that mechanically.
 */

/**
 * Reading aggregates is an operational capability, matching the payments reader set. A dashboard
 * is for the people who already operate content and the store; it is not a second support surface,
 * which is why it exposes no personal field regardless of role.
 */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Daily buckets are Tehran-local, because "how many learners joined today" is a question about the
 * operator's day, not about UTC. Mirrors the learner runtime's canonical timezone.
 */
const reportingTimeZone = 'Asia/Tehran';

/**
 * Start of the calendar day containing `instant`, in `timeZone`.
 *
 * This is a chart axis, not the learning-day: Admin holds no learning rule and must not hand-write
 * one (LB-B35 CP2), so nothing here is derived from review behaviour — it only answers "which
 * calendar day did this timestamp land on for the operator". Iran has had no DST since 2022, so
 * every bucket is a flat 24 hours.
 */
function zonedDayStart(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const intoDay =
    (part('hour') % 24) * 3_600_000 +
    part('minute') * 60_000 +
    part('second') * 1_000 +
    instant.getMilliseconds();
  return new Date(instant.getTime() - intoDay);
}

/** `YYYY-MM-DD` for an instant, in `timeZone`. */
function zonedDayLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** A metric the dashboard may show, or an explicit reason it cannot be shown. */
export type DashboardMetric =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: 'no_data_source' | 'payments_disabled' };

export type DashboardDayPoint = { day: string; count: number };
export type DashboardSalesPoint = { day: string; count: number; revenueTomans: number };

export type DashboardOverview = {
  generatedAt: string;
  windowDays: number;
  timeZone: string;
  learners: {
    total: number;
    joinedInWindow: number;
    /** Distinct learners with at least one review event inside the window. */
    activeInWindow: number;
    /** No granted session/heartbeat source exists, so this is never a number. */
    onlineNow: DashboardMetric;
  };
  packs: {
    total: number;
    published: number;
    publishedInWindow: number;
    needsReview: number;
    draft: number;
  };
  /** Card versions waiting for a human decision — the real content-review queue depth. */
  reviewQueueCards: number;
  /**
   * Card versions by `content_status` — the content pipeline Admin itself operates. Deliberately
   * not a scheduler-state distribution: that is a learning rule, and it does not live here.
   */
  contentPipeline: {
    total: number;
    byStatus: { status: string; count: number }[];
  };
  sales: {
    /** Null while the paid flow is off: there is no gateway environment to report. */
    gatewayEnvironment: 'sandbox' | 'production' | null;
    verifiedTotal: DashboardMetric;
    revenueTomansInWindow: DashboardMetric;
  };
  learnerGrowth: DashboardDayPoint[];
  /** Null means unavailable (paid flow off), an empty array means "no sales in the window". */
  salesSeries: DashboardSalesPoint[] | null;
  recentLearners: { id: string; status: string; joinedAt: string | null }[];
  recentPacks: {
    id: string;
    displayName: string;
    status: string;
    cardCount: number;
    createdAt: string | null;
  }[];
  recentActivity: { action: string; entityType: string; at: string | null }[];
};

export type DashboardOverviewResult =
  { status: 'ok'; overview: DashboardOverview } | { status: 'forbidden' };

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const countersSql = `
  WITH learner AS (
    SELECT count(*)                                      AS total,
           count(*) FILTER (WHERE created_at >= $1)      AS joined_in_window
      FROM users
  ), active AS (
    SELECT count(DISTINCT user_id) AS active_in_window
      FROM review_events
     WHERE occurred_at >= $1
  ), pack AS (
    SELECT count(*)                                                                AS total,
           count(*) FILTER (WHERE status = 'published')                            AS published,
           count(*) FILTER (WHERE status = 'published' AND published_at >= $1)      AS published_in_window,
           count(*) FILTER (WHERE status = 'needs_review')                          AS needs_review,
           count(*) FILTER (WHERE status = 'draft')                                 AS draft
      FROM packs
  ), queue AS (
    SELECT count(*) AS cards
      FROM card_versions
     WHERE status IN ('auto_validated', 'needs_review')
  )
  SELECT learner.total               AS learner_total,
         learner.joined_in_window    AS learner_joined_in_window,
         active.active_in_window     AS learner_active_in_window,
         pack.total                  AS pack_total,
         pack.published              AS pack_published,
         pack.published_in_window    AS pack_published_in_window,
         pack.needs_review           AS pack_needs_review,
         pack.draft                  AS pack_draft,
         queue.cards                 AS review_queue_cards
    FROM learner, active, pack, queue`;

export class PostgresAdminDashboardStore {
  constructor(private readonly pool: DatabasePool) {}

  private async hasRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM admin_role_assignments
        WHERE user_id = $1::uuid AND role::text = ANY($2::text[]) LIMIT 1`,
      [actorUserId, readerRoles],
    );
    return result.rows.length > 0;
  }

  /**
   * One pooled client, nine aggregate statements, no table scan that is not either an aggregate or
   * bounded by LIMIT. The shared Admin pool is deliberately small, so these run sequentially rather
   * than racing each other for connections.
   */
  async readOverview(input: {
    actorUserId: string;
    environment: Record<string, string | undefined>;
    now?: Date;
    windowDays?: number;
  }): Promise<DashboardOverviewResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    const now = input.now ?? new Date();
    const windowDays = Math.min(Math.max(input.windowDays ?? 30, 1), 90);
    // `windowDays` buckets need `windowDays + 1` edges: the first is midnight on the oldest day in
    // the window, the last is midnight after today, so `width_bucket` returns 1..windowDays for
    // everything inside it. The filter uses the first edge, so the SQL window and the chart axis
    // cannot disagree.
    const today = zonedDayStart(now, reportingTimeZone);
    const dayEdges = Array.from(
      { length: windowDays + 1 },
      (_unused, index) =>
        new Date(today.getTime() + (index - (windowDays - 1)) * 24 * 60 * 60 * 1000),
    );
    const dayLabels = dayEdges
      .slice(0, windowDays)
      .map((edge) => zonedDayLabel(edge, reportingTimeZone));
    const windowStart = dayEdges[0];

    // Same derivation as the Store's gateway status card: Admin never reads the merchant
    // credential, only whether the learner runtime's paid flow is switched on and which gateway
    // environment it targets. With it off, no sales figure exists to report — not even zero.
    const paymentsEnabled = input.environment.LEARNBOX_ZARINPAL_ENABLED === 'true';
    const gatewayEnvironment: 'sandbox' | 'production' | null = paymentsEnabled
      ? input.environment.ZARINPAL_SANDBOX !== 'false'
        ? 'sandbox'
        : 'production'
      : null;

    const client = await this.pool.connect();
    try {
      if (!(await this.hasRole(client, input.actorUserId))) return { status: 'forbidden' };

      const counters = (await client.query(countersSql, [windowStart])).rows[0] ?? {};

      // Deliberately NOT a card_schedules.state distribution. Admin holds no learning rule and
      // may not name a scheduler state (LB-B35 CP2); the content pipeline is Admin's own domain,
      // and `content_status` is the enum the review workspace already acts on.
      const pipeline = await client.query(
        `SELECT status::text AS status, count(*) AS total
           FROM card_versions
          GROUP BY 1
          ORDER BY 1`,
      );

      // The chart axis is a calendar histogram of sign-ups, not the learning-day: Admin must not
      // hand-write a day rule (LB-B35 CP2), so the bucket edges are computed once above, in the
      // reporting zone, and PostgreSQL only has to say which bucket a timestamp falls in.
      const growth = await client.query(
        `SELECT width_bucket(created_at, $2::timestamptz[]) AS bucket, count(*) AS total
           FROM users
          WHERE created_at >= $1
          GROUP BY 1
          ORDER BY 1`,
        [windowStart, dayEdges],
      );

      let verifiedTotal: DashboardMetric = { state: 'unavailable', reason: 'payments_disabled' };
      let revenueInWindow: DashboardMetric = { state: 'unavailable', reason: 'payments_disabled' };
      let salesSeries: DashboardSalesPoint[] | null = null;

      if (gatewayEnvironment) {
        const totals =
          (
            await client.query(
              `SELECT count(*) FILTER (WHERE status = 'verified') AS verified_total,
                    coalesce(sum(amount_tomans)
                      FILTER (WHERE status = 'verified' AND verified_at >= $2), 0) AS revenue_in_window
               FROM purchase_events
              WHERE provider = 'zarinpal' AND environment::text = $1`,
              [gatewayEnvironment, windowStart],
            )
          ).rows[0] ?? {};
        verifiedTotal = { state: 'available', value: count(totals.verified_total) };
        revenueInWindow = { state: 'available', value: count(totals.revenue_in_window) };

        const series = await client.query(
          `SELECT width_bucket(verified_at, $3::timestamptz[]) AS bucket,
                  count(*) AS total,
                  coalesce(sum(amount_tomans), 0) AS revenue
             FROM purchase_events
            WHERE provider = 'zarinpal'
              AND environment::text = $1
              AND status = 'verified'
              AND verified_at >= $2
            GROUP BY 1
            ORDER BY 1`,
          [gatewayEnvironment, windowStart, dayEdges],
        );
        const salesByDay = new Map(
          series.rows.map((row) => [
            Number(row.bucket),
            { count: count(row.total), revenueTomans: count(row.revenue) },
          ]),
        );
        salesSeries = dayLabels.map((day, index) => ({
          day,
          count: salesByDay.get(index + 1)?.count ?? 0,
          revenueTomans: salesByDay.get(index + 1)?.revenueTomans ?? 0,
        }));
      }

      // No name, no phone, no e-mail: an overview has no business holding identity.
      const recentLearners = await client.query(
        `SELECT id, status::text AS status, created_at
           FROM users
          ORDER BY created_at DESC
          LIMIT 5`,
      );

      const recentPacks = await client.query(
        `SELECT p.id,
                p.display_name,
                p.status,
                p.created_at,
                (SELECT count(*) FROM pack_cards pc WHERE pc.pack_id = p.id) AS card_count
           FROM packs p
          ORDER BY p.created_at DESC
          LIMIT 4`,
      );

      // Action, entity type and time only. The actor and the metadata payload stay in the audit
      // workspace, which is role-gated for exactly that reason.
      const recentActivity = await client.query(
        `SELECT action, entity_type, created_at
           FROM audit_logs
          ORDER BY created_at DESC
          LIMIT 5`,
      );

      const growthByDay = new Map(growth.rows.map((row) => [Number(row.bucket), count(row.total)]));
      const pipelineRows = pipeline.rows.map((row) => ({
        status: String(row.status),
        count: count(row.total),
      }));

      return {
        status: 'ok',
        overview: {
          generatedAt: now.toISOString(),
          windowDays,
          timeZone: reportingTimeZone,
          learners: {
            total: count(counters.learner_total),
            joinedInWindow: count(counters.learner_joined_in_window),
            activeInWindow: count(counters.learner_active_in_window),
            // The reference shows a live "online now" counter. There is no session heartbeat the
            // Admin role may read (`mobile_learner_sessions` is not granted to it), and inventing
            // one from review events would be a guess presented as telemetry.
            onlineNow: { state: 'unavailable', reason: 'no_data_source' },
          },
          packs: {
            total: count(counters.pack_total),
            published: count(counters.pack_published),
            publishedInWindow: count(counters.pack_published_in_window),
            needsReview: count(counters.pack_needs_review),
            draft: count(counters.pack_draft),
          },
          reviewQueueCards: count(counters.review_queue_cards),
          contentPipeline: {
            total: pipelineRows.reduce((sum, row) => sum + row.count, 0),
            byStatus: pipelineRows,
          },
          sales: { gatewayEnvironment, verifiedTotal, revenueTomansInWindow: revenueInWindow },
          learnerGrowth: dayLabels.map((day, index) => ({
            day,
            count: growthByDay.get(index + 1) ?? 0,
          })),
          salesSeries,
          recentLearners: recentLearners.rows.map((row) => ({
            id: String(row.id),
            status: String(row.status ?? 'active'),
            joinedAt: timestamp(row.created_at),
          })),
          recentPacks: recentPacks.rows.map((row) => ({
            id: String(row.id),
            displayName: String(row.display_name ?? row.id),
            status: String(row.status ?? 'draft'),
            cardCount: count(row.card_count),
            createdAt: timestamp(row.created_at),
          })),
          recentActivity: recentActivity.rows.map((row) => ({
            action: String(row.action),
            entityType: String(row.entity_type),
            at: timestamp(row.created_at),
          })),
        },
      };
    } finally {
      client.release();
    }
  }
}
