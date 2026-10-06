import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical commercial listings for the Admin Store workspace (Phase 2 / M2.1).
 *
 * GET returns every canonical pack with its listing, if any — the pack is the driving table, so the
 * Store has no catalogue of its own. PUT creates or updates exactly one listing.
 *
 * Neither method can write pack or card content: the handlers accept only `store_listings` fields
 * and the store module writes only that table.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth, idempotency key) lives in the shared
 * server module, behind a default-off `LEARNBOX_ADMIN_STORE_ENABLED` gate.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.storeListings(request);
}

export async function PUT(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.upsertStoreListing(request);
}
