import { getAdminSupportServer } from '../../../../lib/server/admin-support-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.tickets.GET(request);
}

export async function POST(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.tickets.POST(request);
}
