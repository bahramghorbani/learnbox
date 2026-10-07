import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';
import {
  absoluteSessionLifetimeSeconds,
  inactivityWindowSeconds,
  learnerSessionCookie,
  readLearnerSession,
  renewLearnerSession,
  type LearnerSession,
} from './server-session';
import { isSessionBlocked } from './session-revocation';

/**
 * The single place a learner request is authenticated (LB-B26).
 *
 * `readLearnerSession` alone only proves a token is authentic and unexpired. It
 * cannot know the session was revoked by logout, so a route that stops there keeps
 * honouring a signed-out token for up to 30 days. Every authenticated endpoint
 * therefore goes through `authenticateLearner`, which also checks server-side
 * whether this session may still act: revoked by logout, cut off for the whole
 * account, or belonging to an account an operator has suspended (M3.1). A
 * suspended learner is denied here, once, for every route.
 *
 * Failure policy: in production a revocation lookup that errors DENIES the
 * request. Serving a possibly-revoked session because the database blipped would
 * turn a transient fault into an authentication bypass. Outside production, with
 * no database configured there is no revocation store to consult, so local
 * development is not blocked.
 */

type PoolHolder = { pool?: Pool };
const holder = globalThis as unknown as { __learnboxAuthPool?: PoolHolder };

function authPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.__learnboxAuthPool ??= {};
  holder.__learnboxAuthPool.pool ??= new Pool({
    connectionString: requireVerifiedDatabaseTls(url),
    max: 2,
  });
  return holder.__learnboxAuthPool.pool;
}

export async function authenticateLearner(request: Request): Promise<LearnerSession | null> {
  const session = readLearnerSession(request);
  if (!session) return null;

  const production = process.env.NODE_ENV === 'production';
  let pool: Pool | null;
  try {
    pool = authPool();
  } catch {
    return production ? null : session;
  }
  if (!pool) return production ? null : session;

  try {
    return (await isSessionBlocked(pool, session)) ? null : session;
  } catch {
    return production ? null : session;
  }
}

/** Renew at most about once a day, not on every request. */
const renewalThrottleSeconds = 24 * 60 * 60;

/**
 * Attach a refreshed session cookie to `response` when the inactivity window has
 * meaningfully shrunk. Preserves `issuedAt` and `sessionId`, so the 30-day
 * absolute bound and per-session revocation are unaffected by renewal.
 */
export function withSessionRenewal(
  session: LearnerSession,
  response: Response,
  now = Date.now(),
): Response {
  const nowSeconds = Math.floor(now / 1000);
  if (session.expiresAt - nowSeconds > inactivityWindowSeconds - renewalThrottleSeconds) {
    return response;
  }
  let renewed: string | null;
  try {
    renewed = renewLearnerSession(session, now);
  } catch {
    return response;
  }
  if (!renewed) return response;

  // Same clamp renewLearnerSession applied, so the cookie lifetime matches the token's expiry.
  const expiresAt = Math.min(
    session.issuedAt + absoluteSessionLifetimeSeconds,
    nowSeconds + inactivityWindowSeconds,
  );
  const cookie = learnerSessionCookie(renewed, { ...session, expiresAt }, now);
  const headers = new Headers(response.headers);
  headers.append(
    'set-cookie',
    `${cookie.name}=${cookie.value}; Path=${cookie.path}; Max-Age=${cookie.maxAge}; HttpOnly${
      cookie.secure ? '; Secure' : ''
    }; SameSite=Lax`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
