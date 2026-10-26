import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Explicitly synchronize one eligible canonical pack to Myket's product catalog.
 * The shared handler has the entire Admin mutation guard chain and forces Myket isActive=false;
 * this route cannot activate checkout or expose the provider credential.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.myketCatalogSync(request);
}
