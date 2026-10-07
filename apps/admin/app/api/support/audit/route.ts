import { getAdminSupportServer } from '../../../../lib/server/admin-support-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The administrative Audit Log (Phase 3 / M3.3).
 *
 * Reads the canonical `audit_logs` trail that every Admin write path already produces — content
 * review, pack lifecycle, splash, Store listings, M3.1 suspensions, M3.2 manual entitlements. It
 * creates no audit records of its own and adds no second trail.
 *
 * GET is the ONLY verb this file exports, and the only one it ever will: an audit record is
 * append-only evidence. There is deliberately no write companion, so the viewer has no route
 * through which a record could be edited, redacted or deleted.
 */
export async function GET(request: Request) {
  const server = getAdminSupportServer();
  if (!server.enabled) return new Response('Not found', { status: 404 });
  return server.auditLog(request);
}
