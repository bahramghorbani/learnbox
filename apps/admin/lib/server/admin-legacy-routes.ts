/**
 * LB-B30 hard-disable for the legacy Admin prototype routes (banners, packs create/generate/import/
 * publish, gateways, transactions, user progress reset).
 *
 * Those handlers hold raw SQL and duplicated business rules, call no mutation guard, and in the case
 * of `banners` no authentication at all. They are unreachable until the compatibility phase rebuilds
 * them on the shared services. The switch is fail-closed and can never be enabled in a production
 * build, whatever the environment says (same pattern as `reset-progress` / `store/activate`).
 */
export function legacyAdminRoutesEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return (
    environment.NODE_ENV !== 'production' &&
    environment.LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED === 'true'
  );
}

/** Returns a fixed 404 when the legacy routes are disabled, otherwise `undefined`. Call it FIRST. */
export function legacyAdminRouteGate(
  environment: Record<string, string | undefined> = process.env,
): Response | undefined {
  if (legacyAdminRoutesEnabled(environment)) return undefined;
  return new Response('Not found', {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}
