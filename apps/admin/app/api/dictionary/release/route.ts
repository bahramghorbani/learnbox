import { getAdminDictionaryEditorialServer } from '../../../../lib/server/admin-dictionary-editorial-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const server = getAdminDictionaryEditorialServer();
  return server.enabled
    ? server.releaseStatus(request)
    : new Response('Not found', { status: 404 });
}
export async function POST(request: Request) {
  const server = getAdminDictionaryEditorialServer();
  return server.enabled
    ? server.releaseAction(request)
    : new Response('Not found', { status: 404 });
}
