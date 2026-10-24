import { getAdminContentPacksServer } from '../../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reconciles deferred pack-media job items that already have an accepted candidate for the
 * same card+kind at the current card version. No provider is called; no candidate is created.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.packMediaJobReconcile(request);
}
