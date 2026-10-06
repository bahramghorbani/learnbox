import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lifecycle state and concrete publish blockers for one pack (Phase 1 / M1.6).

 * Read-only. Returns the pack's lifecycle status together with the canonical readiness
 * evaluation, so an operator sees why a pack cannot be released without reading database rows.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.packLifecycle(request);
}
