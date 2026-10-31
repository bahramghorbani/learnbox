import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read Sibapp's in-app packages and record sibapp SKU mappings for sellable packs whose label and
 * price match. Full Admin mutation gate; never enables checkout or exposes the Sibapp key.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.sibappCatalogSync(request);
}
