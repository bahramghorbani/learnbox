import { getAdminDashboardServer } from '../../../../lib/server/admin-dashboard-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aggregate overview for the Admin Dashboard («اتاق کنترل»), Stage 2.
 *
 * Read-only by construction: counts, one bucketed 30-day series per available source, and three
 * bounded newest-first lists. Every total is computed in PostgreSQL, so no figure on the dashboard
 * is derived from a page of rows the browser happens to hold.
 *
 * It returns no personal learner field — no phone, no name — and no payment credential. Metrics
 * without a granted source (live online count) or without an active source (sales and revenue
 * while the paid flow is off) come back explicitly unavailable instead of as a misleading zero.
 */
export async function GET(request: Request) {
  const server = getAdminDashboardServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.overview(request);
}
