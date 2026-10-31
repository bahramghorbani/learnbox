import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET: download the Cafe Bazaar catalog CSV (read-only). POST: confirm it was imported in
 * Bazaar's panel (records cafe_bazaar SKU mappings). Neither contacts Bazaar or enables checkout.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.bazaarCatalogExport(request);
}

export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.bazaarCatalogConfirm(request);
}
