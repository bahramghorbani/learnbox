import type { Pool } from 'pg';

import { absoluteSessionLifetimeSeconds, type LearnerSession } from './server-session';

/**
 * Server-side session revocation (LB-B26).
 *
 * The session cookie is a signed stateless token: valid until it expires, whether
 * or not the browser still holds it. Clearing the cookie is a client-side request,
 * not a guarantee. With 30-day sessions, a token captured before logout would stay
 * usable for weeks, so logout must also record server-side that the session is
 * dead.
 *
 * Two checks, both cheap and both keyed by indexed columns:
 *   1. is THIS session id revoked?                      (revoked_sessions)
 *   2. was it issued before this user's validity cutoff? (user_session_cutoffs)
 *
 * The second exists so "log out everywhere" and any forced invalidation do not
 * require enumerating sessions the server never stored.
 */

export async function isSessionRevoked(pool: Pool, session: LearnerSession): Promise<boolean> {
  const result = await pool.query<{ revoked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM revoked_sessions WHERE session_id = $1
     ) OR EXISTS (
       SELECT 1 FROM user_session_cutoffs
        WHERE user_id = $2
          AND sessions_valid_from > to_timestamp($3)
     ) AS revoked`,
    [session.sessionId, session.subject, session.issuedAt],
  );
  return result.rows[0]?.revoked === true;
}

/** Revoke exactly one session — the logout-this-device path. */
export async function revokeSession(pool: Pool, session: LearnerSession): Promise<void> {
  await pool.query(
    `INSERT INTO revoked_sessions (session_id, user_id, expires_at)
     VALUES ($1, $2, to_timestamp($3))
     ON CONFLICT (session_id) DO NOTHING`,
    [session.sessionId, session.subject, session.issuedAt + absoluteSessionLifetimeSeconds],
  );
}

/** Revoke every session issued before now for one user — log out everywhere. */
export async function revokeAllSessionsForUser(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_session_cutoffs (user_id, sessions_valid_from)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET sessions_valid_from = now()`,
    [userId],
  );
}

/**
 * Drop revocation rows whose tokens can no longer be valid under any bound.
 * Retaining them would grow the table forever without adding any security.
 */
export async function pruneExpiredRevocations(pool: Pool): Promise<number> {
  const result = await pool.query('DELETE FROM revoked_sessions WHERE expires_at <= now()');
  return result.rowCount ?? 0;
}
