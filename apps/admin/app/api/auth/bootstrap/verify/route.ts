import { getAdminAuthServer } from '../../../../../lib/server/admin-auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const server = getAdminAuthServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.bootstrapVerify(request);
}
