import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download a review-only Cafe Bazaar catalog CSV. This route cannot import products, contact the
 * Bazaar API, create SKU mappings, or enable learner checkout.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.bazaarCatalogExport(request);
}
