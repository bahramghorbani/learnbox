import { getAdminSplashServer } from '../../../../lib/server/admin-splash-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const server = getAdminSplashServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.replace(request);
}
