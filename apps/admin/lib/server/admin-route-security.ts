import { timingSafeEqual } from 'node:crypto';

import type { EnabledAdminAuthConfig } from './admin-auth-policy';
import { evaluateAdminSession, hashAdminSecret, type AdminSessionRecord } from './admin-session';

const sessionCookieName = '__Host-learnbox_admin_session';

type SessionStore = {
  findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<(AdminSessionRecord & { csrfHash: string }) | undefined>;
  touchSession(tokenHash: string, now: Date): Promise<boolean>;
};

function readCookie(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length);
}

function safelyEquals(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function loadAdminSession(
  request: Request,
  config: EnabledAdminAuthConfig,
  store: SessionStore,
  now = new Date(),
) {
  const token = readCookie(request, sessionCookieName);
  if (!token || !/^[A-Za-z0-9_-]{40,}$/.test(token)) return undefined;

  const tokenHash = hashAdminSecret(token, config.tokenHashKey);
  const session = await store.findActiveSession(tokenHash, now);
  if (!session) return undefined;
  const evaluation = evaluateAdminSession(session, now);
  if (!evaluation.active) return undefined;
  if (!(await store.touchSession(tokenHash, now))) return undefined;

  return {
    tokenHash,
    csrfHash: session.csrfHash,
    recent: evaluation.recent,
  };
}

export function verifyAdminCsrf(
  request: Request,
  csrfHash: string,
  config: EnabledAdminAuthConfig,
) {
  const csrfToken = request.headers.get('x-learnbox-csrf-token');
  if (!csrfToken || !safelyEquals(hashAdminSecret(csrfToken, config.tokenHashKey), csrfHash)) {
    throw new Error('CSRF verification failed.');
  }
}

export function clearAdminSessionCookie() {
  return `${sessionCookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
