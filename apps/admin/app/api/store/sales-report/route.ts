import { getAdminContentPacksServer } from '../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Real sales/revenue aggregate for the Admin Store workspace, over `purchase_events`
 * (M2.4 follow-up — built after the first live Zarinpal sale was verified, 2026-10-22).
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD, both optional. Revenue counts `verified` rows only.
 */
export async function GET(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.salesReport(request);
}
