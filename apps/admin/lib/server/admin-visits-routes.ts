import type { AdminAuthConfig } from './admin-auth-policy';
import { loadAdminSession } from './admin-route-security';
import type { AdminVisitsStore } from './admin-visits-store';

/**
 * Admin Visits route — «گزارش بازدیدها». Read-only, GET only, same boundary shape as the
 * Dashboard overview route: dedicated default-off flag, Passkey session required, role check
 * inside the store, 404 for both "flag off" and "role not allowed".
 *
 * Unlike every other Admin read route, its data does not come from PostgreSQL — it comes from
 * StatsFA. `unavailable()` therefore covers two distinct real failures the UI cannot tell apart
 * server-side and does not need to: the database role check failing, and StatsFA itself being
 * unreachable, rate-limited or returning something unparseable.
 */
type VisitsDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<AdminVisitsStore, 'readOverview'>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return new Response('Visits unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createAdminVisitsOverviewRoute(dependencies: VisitsDependencies) {
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

    const raw = new URL(request.url).searchParams.get('windowDays');
    const windowDays = raw && /^\d{1,2}$/.test(raw) ? Number(raw) : undefined;

    const result = await dependencies.store.readOverview({
      actorUserId: session.userId,
      now: currentTime,
      windowDays,
    });
    if (result.status === 'forbidden') return notFound();
    if (result.status === 'unavailable') return unavailable();
    return Response.json(
      { overview: result.overview },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  };
}
