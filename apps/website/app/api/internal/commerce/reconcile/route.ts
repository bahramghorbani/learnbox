import { createHash, timingSafeEqual } from 'node:crypto';

import { Pool } from 'pg';

import { reconcilePurchases } from '../../../../../lib/store-purchase';
import { zarinpalProviderFromEnvironment } from '../../../../../lib/zarinpal-config';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

/** Constant-time comparison of equal-length digests, so neither length nor prefix leaks. */
function tokenMatches(presented: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * POST /api/internal/commerce/reconcile — limited reconciliation (commerce contract §4).
 *
 * Machine-to-machine only: off unless LEARNBOX_COMMERCE_RECONCILE_ENABLED=true, and then only for
 * `Authorization: Bearer <LEARNBOX_COMMERCE_RECONCILE_TOKEN>` (≥ 32 chars). It re-checks unsettled
 * Zarinpal attempts with the provider and settles them through the same `verifyPurchase` path the
 * callback uses; it never creates a charge. A browser cookie grants nothing here, so no CSRF
 * surface. Returns counts only.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.LEARNBOX_COMMERCE_RECONCILE_TOKEN ?? '';
  if (process.env.LEARNBOX_COMMERCE_RECONCILE_ENABLED !== 'true' || expected.length < 32) {
    return Response.json({ error: 'notFound' }, { status: 404, headers });
  }
  const presented = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!tokenMatches(presented, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  const zarinpal = zarinpalProviderFromEnvironment(process.env);
  if (!zarinpal || !process.env.DATABASE_URL) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  }
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    return Response.json(await reconcilePurchases({ pool, provider: zarinpal.provider }), {
      headers,
    });
  } finally {
    await pool.end();
  }
}
