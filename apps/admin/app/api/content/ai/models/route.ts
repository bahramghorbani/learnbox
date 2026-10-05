import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Text models this account may select, for the Admin's model picker (Phase 1 / M1.4).
 *
 * Read-only and authenticated. The response carries model ids and the configured default only —
 * the credential stays inside the provider and never reaches the browser.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.aiModels(request);
}
