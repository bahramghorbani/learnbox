import { getAdminSupportServer } from '../../../../../lib/server/admin-support-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Account status change — temporary suspension and restoration (Phase 3 / M3.1).
 *
 * One endpoint for both directions, because "is this account allowed to act?" is a single
 * canonical fact and a disable that travelled a different code path from a reactivate would be two
 * definitions of it. The body states the target status and the operator's reason, both required.
 *
 * This route can neither delete an account nor erase learner data: it writes `users.status`, the
 * canonical session cutoff and one audit entry. Permanent deletion stays a separate lifecycle.
 *
 * The full guard chain (Origin, session, CSRF, recent re-auth, idempotency key, required reason)
 * lives in the shared server module, behind the default-off LEARNBOX_ADMIN_SUPPORT_ENABLED gate.
 */
export async function POST(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.setUserStatus(request);
}
