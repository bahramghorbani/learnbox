import { assertTrustedAdminMutation, type AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { PostgresAdminPaymentsStore } from './postgres-admin-payments-store';

/**
 * Admin payment routes (Phase 2 / M2.4; commerce core v1).
 *
 * Mirrors the M2.1 store-listing route shape: feature flag, admin session, role check inside the
 * store, 404 for both "disabled" and "not allowed" so the surface does not advertise itself.
 *
 * Payment configuration is server-provisioned and transactions are a record of what happened —
 * neither is editable from a browser. The single POST only QUEUES a provider re-check (an
 * append-only event); the reconciliation job runs it through the learner runtime's verification.
 */
/**
 * Whether the reconciliation job — the only consumer of re-check requests — is switched on here.
 * Same flag the learner runtime's /api/internal/commerce/reconcile route requires.
 */
function reconciliationEnabled(environment: Record<string, string | undefined>): boolean {
  return environment.LEARNBOX_COMMERCE_RECONCILE_ENABLED === 'true';
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const searchPattern = /^[A-Za-z0-9-]{4,64}$/;

/** `packs.id` is a canonical text slug, not a uuid. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;
/** Canonical payment statuses an operator may filter by. */
const statusValues = new Set([
  'pending',
  'verified',
  'failed',
  'cancelled',
  'rejected',
  'refunded',
  'revoked',
]);

type PaymentsDependencies<TMethod extends keyof PostgresAdminPaymentsStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresAdminPaymentsStore, TMethod>;
  now?: () => Date;
  /** Injected so the configuration view is testable without mutating process state. */
  environment?: Record<string, string | undefined>;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return new Response('Payments unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

export function createAdminTransactionsRoute(
  dependencies: PaymentsDependencies<'listTransactions'>,
) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      currentTime,
    );
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const packId = url.searchParams.get('packId') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const query = url.searchParams.get('q')?.trim() || undefined;
    const limitRaw = url.searchParams.get('limit');
    // Unparseable filters are dropped rather than rejected: a bad query string should show the
    // unfiltered list, not an error page, and both values are parameterised regardless.
    const limit = limitRaw && /^\d{1,3}$/.test(limitRaw) ? Number(limitRaw) : undefined;

    try {
      const result = await dependencies.store.listTransactions({
        actorUserId: session.userId,
        packId: packId && packIdPattern.test(packId) ? packId : undefined,
        status: status && statusValues.has(status) ? status : undefined,
        query: query && searchPattern.test(query) ? query : undefined,
        needsReview: url.searchParams.get('review') === '1',
        limit,
      });
      if (result.status === 'forbidden') return notFound();
      return json({
        transactions: result.rows,
        reconciliationEnabled: reconciliationEnabled(dependencies.environment ?? process.env),
      });
    } catch {
      return unavailable();
    }
  };
}

export function createAdminPaymentConfigRoute(
  dependencies: PaymentsDependencies<'readConfigurationStatus'>,
) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      currentTime,
    );
    if (!session) return unauthorized();

    try {
      const result = await dependencies.store.readConfigurationStatus({
        actorUserId: session.userId,
        environment: dependencies.environment ?? process.env,
      });
      if (result.status === 'forbidden') return notFound();
      // The payload carries flags, counts and timestamps only — never the merchant credential,
      // not even masked. The store never reads it.
      return json({ configuration: result.configuration });
    } catch {
      return unavailable();
    }
  };
}

/** GET ?transactionId= — the order timeline behind one attempt. */
export function createAdminTransactionTimelineRoute(
  dependencies: PaymentsDependencies<'readOrderTimeline'>,
) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    const transactionId = new URL(request.url).searchParams.get('transactionId') ?? '';
    if (!uuidPattern.test(transactionId)) return notFound();
    try {
      const result = await dependencies.store.readOrderTimeline({
        actorUserId: session.userId,
        transactionId,
      });
      if (result.status !== 'ok') return notFound();
      return json({ events: result.events });
    } catch {
      return unavailable();
    }
  };
}

/**
 * POST { transactionId } — queue a provider re-check for one unsettled attempt.
 *
 * Full mutation guard chain: Origin + Content-Type, session, per-session CSRF, recent re-auth.
 * No idempotency key is needed: the store refuses a second request while one is outstanding.
 */
export function createAdminRecheckRoute(dependencies: PaymentsDependencies<'requestRecheck'>) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const config = dependencies.config;
    const invalid = () =>
      new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return invalid();
    }
    const session = await loadAdminSession(
      request,
      config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return invalid();
    }
    if (!session.recent) return json({ code: 'reauthentication_required' }, { status: 428 });
    // Nothing would ever execute the request: refuse instead of queuing a dead one.
    if (!reconciliationEnabled(dependencies.environment ?? process.env)) {
      return json({ code: 'reconciliation_disabled' }, { status: 409 });
    }

    const body = (await request.json().catch(() => null)) as { transactionId?: unknown } | null;
    const transactionId = typeof body?.transactionId === 'string' ? body.transactionId : '';
    if (!uuidPattern.test(transactionId)) return invalid();
    try {
      const result = await dependencies.store.requestRecheck({
        actorUserId: session.userId,
        transactionId,
      });
      if (result.status === 'forbidden' || result.status === 'not_found') return notFound();
      if (result.status === 'not_recheckable')
        return json({ code: result.status }, { status: 409 });
      return json({ status: result.status });
    } catch {
      return unavailable();
    }
  };
}
