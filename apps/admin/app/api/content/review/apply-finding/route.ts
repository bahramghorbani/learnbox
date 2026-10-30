import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Applies one AI-reviewer finding's suggestion to its card (Phase 1 / M1.2 write path, reused
 * from the review screen). Always lands the result in `draft`, same as any manual card edit.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.applyFindingSuggestion(request);
}
