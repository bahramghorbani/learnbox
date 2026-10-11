import type { AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession } from './admin-route-security';
import type { PostgresAdminDashboardStore } from './postgres-admin-dashboard-store';

/**
 * Admin Dashboard route (Stage 2) — read-only, GET only.
 *
 * Same boundary shape as every other Admin read surface: dedicated default-off flag, Passkey auth
 * runtime required, session resolved server-side, role check inside the store, and 404 for both
 * "flag off" and "role not allowed" so the surface never advertises itself to a caller who may not
 * use it. 401 is reserved for "no valid session", which is the one case the UI must distinguish in
 * order to raise a passkey prompt instead of claiming the screen does not exist.
 *
 * There is no POST/PUT/PATCH/DELETE here and there never can be: an overview is a projection of
 * state other surfaces own. Because the module exports no mutating verb it needs no entry in
 * `test/admin-mutation-route-inventory.test.ts`, and no CSRF token: a GET changes nothing, and the
 * session cookie is `SameSite` with the Origin guard already applied to every mutation route.
 */

type DashboardDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresAdminDashboardStore, 'readOverview'>;
  now?: () => Date;
  /** Injected so payment-flag behaviour is testable without mutating process state. */
  environment?: Record<string, string | undefined>;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return new Response('Dashboard unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createAdminDashboardOverviewRoute(dependencies: DashboardDependencies) {
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

    // A caller-supplied window is clamped in the store; an unparseable value is dropped rather
    // than rejected, so a bad query string shows the default month instead of an error page.
    const raw = new URL(request.url).searchParams.get('windowDays');
    const windowDays = raw && /^\d{1,2}$/.test(raw) ? Number(raw) : undefined;

    try {
      const result = await dependencies.store.readOverview({
        actorUserId: session.userId,
        environment: dependencies.environment ?? process.env,
        now: currentTime,
        windowDays,
      });
      if (result.status === 'forbidden') return notFound();
      return Response.json(
        { overview: result.overview },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return unavailable();
    }
  };
}
