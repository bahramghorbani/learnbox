import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Move a pack's draft / AI-applied cards into the human review queue (Phase 1 / M1.6).

 * This is the only way authored or AI-generated content enters review, so generation can never
 * reach learners without a human decision.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth) lives in the shared server module.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.submitPackForReview(request);
}
