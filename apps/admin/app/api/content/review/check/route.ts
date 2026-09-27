import { getAdminContentReviewServer } from '../../../../../lib/server/admin-content-review-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const server = getAdminContentReviewServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.check(request);
}
