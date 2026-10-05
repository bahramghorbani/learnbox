import { getAdminContentPacksServer } from '../../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Card creation inside a canonical pack (Phase 1 / M1.2). Creates the `cards` row, a `draft`
 * `card_versions` row and the `pack_cards` membership edge in one transaction.
 */
export async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.createCard(request, context);
}
