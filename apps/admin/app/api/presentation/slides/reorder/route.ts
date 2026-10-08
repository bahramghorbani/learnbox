import { getAdminPresentationServer } from '../../../../../lib/server/admin-presentation-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const server = getAdminPresentationServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.reorderSlides(request);
}
