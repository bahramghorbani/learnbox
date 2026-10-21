import { getAdminContentPacksServer } from '../../../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Detaches one draft card from this pack; content and all media evidence remain intact. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ packId: string; cardId: string }> },
) {
  const server = getAdminContentPacksServer();
  if (!server.enabled || !server.manageEnabled) return new Response('Not found', { status: 404 });
  return server.removeCardFromPack(request, context);
}
