import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Card content edit (Phase 1 / M1.2). A draft version is updated in place; a version that has
 * already left draft gets a NEW draft version so reviewed/published content is never rewritten.
 */
export async function PATCH(request: Request, context: { params: Promise<{ cardId: string }> }) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.editCard(request, context);
}
