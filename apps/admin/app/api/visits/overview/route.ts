import { getAdminVisitsServer } from '../../../../lib/server/admin-visits-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin «گزارش بازدیدها» overview. Read-only. Data comes entirely from StatsFA (the analytics
 * already live on both domains) for the two tracked sites — pageviews, unique visitors and top
 * pages over a bounded window, never from a fabricated internal pageview table.
 */
export async function GET(request: Request) {
  const server = getAdminVisitsServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.overview(request);
}
