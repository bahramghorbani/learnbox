import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Queue a provider re-check for one unsettled payment attempt (commerce core v1). The full guard
 * chain lives in lib/server/admin-payments-routes.ts; the job, not Admin, calls the gateway.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.transactionRecheck(request);
}
