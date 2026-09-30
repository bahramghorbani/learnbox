import { Pool } from 'pg';

import { guardMutation } from '../../../../lib/mutation-guard';
import { readLearnerSession } from '../../../../lib/server-session';
import { revokeSession } from '../../../../lib/session-revocation';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — end the session.
 *
 * Clearing the cookie alone is a request to the browser, not a guarantee: the
 * session token stays cryptographically valid until it expires, and under the
 * v1.2 policy that can be up to 30 days. So logout also records the session id
 * server-side as revoked (LB-B26).
 *
 * The cookie is cleared unconditionally, including when revocation cannot be
 * recorded. Failing the whole request would leave the learner apparently signed
 * in, which is a worse outcome than a cleared cookie with a pending revocation;
 * the failure is surfaced in the response rather than silently swallowed.
 */
export async function POST(request: Request): Promise<Response> {
  const isSecure = process.env.NODE_ENV === 'production';
  const cookie = `learnbox_alpha_session=; Path=/; Max-Age=0; HttpOnly${isSecure ? '; Secure' : ''}; SameSite=Lax`;
  const headers = { 'set-cookie': cookie, 'cache-control': 'no-store' };

  // LB-B29: a foreign site must not be able to sign a learner out. The rejection deliberately does
  // not clear the cookie or revoke anything; only a same-origin request may do either.
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = readLearnerSession(request);
  if (!session) {
    // Already signed out, or the token was never valid. Clearing again is safe,
    // so logout stays idempotent.
    return new Response(null, { status: 204, headers });
  }

  const url = process.env.DATABASE_URL;
  if (!url) return new Response(null, { status: 204, headers });

  const pool = new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
  try {
    await revokeSession(pool, session);
    return new Response(null, { status: 204, headers });
  } catch {
    return Response.json({ ok: false, error: 'revocation_failed' }, { status: 503, headers });
  } finally {
    await pool.end();
  }
}
