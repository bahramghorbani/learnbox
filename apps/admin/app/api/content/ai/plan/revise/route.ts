import { getAdminContentPacksServer } from '../../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Direct Admin edits to a pending AI plan (count, level, topics, essentials) before generation.
 * Calls no provider and writes no canonical content. Guard chain lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.aiRevisePlan(request);
}
