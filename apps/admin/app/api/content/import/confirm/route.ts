import { getAdminContentPacksServer } from '../../../../../lib/server/admin-content-packs-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Confirmed import (Phase 1 / M1.3). Writes canonical DRAFT cards through the M1.2 write store,
 * only for rows the previewed fingerprint covers.
 */
export async function POST(request: Request) {
  const server = getAdminContentPacksServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.importConfirm(request);
}
