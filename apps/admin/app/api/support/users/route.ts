import { getAdminSupportServer } from '../../../../lib/server/admin-support-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical user list for the Admin support workspace (Phase 3 / M3.1).
 *
 * GET returns canonical `users` rows with their current account status and activity counters —
 * the same rows the learner runtime authenticates against, never an Admin-side copy. Requires a
 * valid Admin session plus an operational role, and sits behind the default-off
 * LEARNBOX_ADMIN_SUPPORT_ENABLED gate. It returns no learning content and no card-level history.
 */
export async function GET(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.users(request);
}
