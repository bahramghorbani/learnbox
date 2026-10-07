import { getAdminSupportServer } from '../../../../../lib/server/admin-support-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manual pack entitlements — the support view and the two manual actions (Phase 3 / M3.2).
 *
 * GET returns, for one learner, every canonical pack with the truth support needs: whether the
 * learner can read it right now, and why — a free pack open to everyone, a manually granted
 * entitlement, or a verified purchase. Read-only.
 *
 * POST grants or revokes ONE entitlement. Both directions require the operator's reason, and both
 * run the same guard chain as a suspension (Origin, session, CSRF, recent re-auth, idempotency key)
 * behind the default-off LEARNBOX_ADMIN_SUPPORT_ENABLED gate.
 *
 * Neither verb can touch payment history. A grant writes no transaction, and a revoke refuses
 * outright to remove an entitlement that came from a verified payment — that is a refund decision,
 * which this milestone deliberately does not implement.
 */
export async function GET(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.userPacks(request);
}

export async function POST(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.setPackEntitlement(request);
}
