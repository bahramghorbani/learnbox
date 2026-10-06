import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical payment transactions for the Admin Store workspace (Phase 2 / M2.4).
 *
 * Read-only, newest first, optionally filtered by pack or canonical status. Reads `purchase_events`
 * — the same table the learner purchase flow writes — so Admin and the learner runtime can never
 * disagree about what happened.
 *
 * Deliberately NOT built on the legacy `/api/transactions` + `payment_logs` stack, which is gated
 * off behind `legacyAdminRouteGate` and models a different, abandoned billing design.
 *
 * No totals, no revenue aggregation, no sales dashboard: this exists so support can look up one
 * learner's payment.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.transactions(request);
}
