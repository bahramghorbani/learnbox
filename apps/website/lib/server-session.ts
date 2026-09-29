import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const sessionCookieName = 'learnbox_alpha_session';

/**
 * Session lifetime policy (owner decision, 2026-09-29, LB-B26).
 *
 * Two bounds apply simultaneously and a session ends at whichever arrives first:
 *
 *   - ABSOLUTE:   30 days from the moment the session was issued. Activity never
 *                 extends this. A session is re-issued only by signing in again.
 *   - INACTIVITY: 14 days without a request. Refreshed by valid activity.
 *
 * Sliding renewal happens within those bounds, so an active learner stays signed
 * in for up to 30 days and is never asked to re-authenticate for no reason, while
 * an abandoned session on a shared device still dies on its own. An effectively
 * eternal session was explicitly rejected.
 *
 * `v1` tokens carried only `expiresAt` and no issue time, so the absolute bound
 * cannot be reconstructed for them. They are rejected rather than grandfathered:
 * the population is tiny and a forced re-login is cheaper than a session whose
 * true age is unknown.
 */
export const absoluteSessionLifetimeSeconds = 60 * 60 * 24 * 30;
export const inactivityWindowSeconds = 60 * 60 * 24 * 14;

const tokenVersion = 'v2';

export type LearnerSession = {
  subject: string;
  /** Unix seconds when the session was first issued — anchors the absolute bound. */
  issuedAt: number;
  /** Unix seconds when the current sliding window closes. */
  expiresAt: number;
  /** Stable per-session id, so a single session can be identified and revoked. */
  sessionId: string;
};

type SessionPayload = LearnerSession & {
  scope: 'learner';
};

function sessionSecret() {
  const secret = process.env.LEARNBOX_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function validSubject(subject: unknown): subject is string {
  return typeof subject === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(subject);
}

function validSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(sessionId);
}

/** Sliding expiry, clamped so it can never cross the absolute bound. */
function slidingExpiry(issuedAtSeconds: number, nowSeconds: number): number {
  return Math.min(
    issuedAtSeconds + absoluteSessionLifetimeSeconds,
    nowSeconds + inactivityWindowSeconds,
  );
}

function encode(payload: SessionPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signedPayload = `${tokenVersion}.${encodedPayload}`;
  return `${signedPayload}.${sign(signedPayload, secret)}`;
}

export function createLearnerSession(subject: string, now = Date.now()) {
  if (!validSubject(subject)) throw new Error('Invalid learner session subject.');

  const secret = sessionSecret();
  if (!secret) throw new Error('LEARNBOX_SESSION_SECRET is not configured.');

  const nowSeconds = Math.floor(now / 1000);
  return encode(
    {
      subject,
      scope: 'learner',
      issuedAt: nowSeconds,
      expiresAt: slidingExpiry(nowSeconds, nowSeconds),
      sessionId: randomUUID(),
    },
    secret,
  );
}

/**
 * Re-issue a still-valid session with a refreshed inactivity window.
 *
 * Returns `null` when the absolute bound leaves nothing to extend, so a caller
 * cannot accidentally manufacture an eternal session by renewing in a loop.
 * `issuedAt` and `sessionId` are preserved: renewal extends a session, it does
 * not create one, and the session stays individually revocable across renewals.
 */
export function renewLearnerSession(session: LearnerSession, now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret) throw new Error('LEARNBOX_SESSION_SECRET is not configured.');

  const nowSeconds = Math.floor(now / 1000);
  const absoluteDeadline = session.issuedAt + absoluteSessionLifetimeSeconds;
  if (absoluteDeadline <= nowSeconds) return null;

  const expiresAt = slidingExpiry(session.issuedAt, nowSeconds);
  if (expiresAt <= session.expiresAt) return null; // nothing meaningful to extend yet

  return encode(
    {
      subject: session.subject,
      scope: 'learner',
      issuedAt: session.issuedAt,
      expiresAt,
      sessionId: session.sessionId,
    },
    secret,
  );
}

/**
 * Verify the cookie's signature and both lifetime bounds.
 *
 * This is deliberately synchronous and does no I/O. It proves the token is
 * authentic and unexpired; it does NOT prove the session has not been revoked.
 * Server-side revocation is a separate, stateful check — see
 * `lib/session-revocation.ts` and `authenticateLearner`.
 */
export function readLearnerSession(request: Request, now = Date.now()): LearnerSession | null {
  const secret = sessionSecret();
  const token = readCookie(request, sessionCookieName);
  if (!secret || !token) return null;

  const [version, encodedPayload, signature] = token.split('.');
  if (!version || !encodedPayload || !signature || version !== tokenVersion) return null;

  const signedPayload = `${version}.${encodedPayload}`;
  const expectedSignature = sign(signedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as SessionPayload;

    const nowSeconds = Math.floor(now / 1000);
    if (
      payload.scope !== 'learner' ||
      !validSubject(payload.subject) ||
      !validSessionId(payload.sessionId) ||
      typeof payload.issuedAt !== 'number' ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= nowSeconds ||
      // Absolute bound is enforced from the token's own issue time, so a forged
      // or stale far-future `expiresAt` cannot outlive it.
      payload.issuedAt + absoluteSessionLifetimeSeconds <= nowSeconds ||
      payload.issuedAt > nowSeconds + 60 // clock skew tolerance; not a future-dated session
    ) {
      return null;
    }
    return {
      subject: payload.subject,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}

export function learnerSessionCookie(value: string, session?: LearnerSession, now = Date.now()) {
  // Cookie lifetime tracks the token's own sliding expiry so the browser drops a
  // cookie that the server would reject anyway.
  const maxAge = session
    ? Math.max(0, session.expiresAt - Math.floor(now / 1000))
    : inactivityWindowSeconds;
  return {
    name: sessionCookieName,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function clearedLearnerSessionCookie() {
  return {
    name: sessionCookieName,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}

export { sessionCookieName };
