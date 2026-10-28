import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  return server.enabled
    ? server.storePackCover(request)
    : new Response('Not found', { status: 404 });
}
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  return server.enabled
    ? server.storePackCoverMutation(request)
    : new Response('Not found', { status: 404 });
}
