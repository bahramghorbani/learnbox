import { getAdminContentPacksServer } from '../../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Explicit plan approval (Phase 1 / M1.4).
 * The gate between a reviewed plan and any card generation. Still writes no canonical content.
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.aiApprovePlan(request);
}
