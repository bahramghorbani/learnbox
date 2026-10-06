import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Release an approved pack to learners (Phase 1 / M1.6).

 * Requires the `content_publisher` role, a recent re-authentication and an idempotency key.
 * Readiness is re-evaluated server-side inside the transaction, so a stale browser view can
 * never authorise a release.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.publishPack(request);
}
