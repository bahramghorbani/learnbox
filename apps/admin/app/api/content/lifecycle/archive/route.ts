import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deactivate a pack without destroying anything (Phase 1 / M1.6).

 * Published card versions move to `deprecated` and the pack to `archived`. Nothing is hard
 * deleted, so learning schedules, review events and audit history stay intact.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.archivePack(request);
}
