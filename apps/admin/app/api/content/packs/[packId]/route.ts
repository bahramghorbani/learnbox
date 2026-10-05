import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  const { packId } = await params;
  return server.cards(request, packId);
}

/** Pack metadata edit (Phase 1 / M1.2). The guard chain lives in the shared server module. */
export async function PATCH(request: Request, context: { params: Promise<{ packId: string }> }) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.editPack(request, context);
}
