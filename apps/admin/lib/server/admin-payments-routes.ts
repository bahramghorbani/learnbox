import type { AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession } from './admin-route-security';
import type { PostgresAdminPaymentsStore } from './postgres-admin-payments-store';

/**
 * Admin payment routes (Phase 2 / M2.4) — read-only.
 *
 * Mirrors the M2.1 store-listing route shape: feature flag, admin session, role check inside the
 * store, 404 for both "disabled" and "not allowed" so the surface does not advertise itself.
 *
 * There is no POST/PATCH here. Payment configuration is server-provisioned and transactions are a
 * record of what happened — neither is editable from a browser.
 */

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
    const limitRaw = url.searchParams.get('limit');
    // Unparseable filters are dropped rather than rejected: a bad query string should show the
    // unfiltered list, not an error page, and both values are parameterised regardless.
    const limit = limitRaw && /^\d{1,3}$/.test(limitRaw) ? Number(limitRaw) : undefined;

    try {
      const result = await dependencies.store.listTransactions({
        actorUserId: session.userId,
        packId: packId && packIdPattern.test(packId) ? packId : undefined,
        status: status && statusValues.has(status) ? status : undefined,
        limit,
      });
      if (result.status === 'forbidden') return notFound();
      return json({ transactions: result.rows });
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
