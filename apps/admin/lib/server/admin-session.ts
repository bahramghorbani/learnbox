import { createHmac, randomBytes } from 'node:crypto';

const idleLifetimeMs = 15 * 60_000;
const absoluteLifetimeSeconds = 8 * 60 * 60;
const recentAuthenticationMs = 5 * 60_000;

type RandomBytes = (size: number) => Uint8Array;

export type AdminSessionRecord = {
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  recentAuthenticatedAt: Date;
};

export type AdminSessionEvaluation =
  | { active: true; recent: boolean }
  | { active: false; reason: 'revoked' | 'idle_expired' | 'absolute_expired' };

export function hashAdminSecret(secret: string, hashKey: string) {
  if (Buffer.byteLength(hashKey, 'utf8') < 32) {
    throw new Error('Admin token hash key must contain at least 32 bytes.');
  }
  return createHmac('sha256', hashKey).update(secret).digest('base64url');
}

export function createAdminSessionSecrets(hashKey: string, random: RandomBytes = randomBytes) {
  const token = Buffer.from(random(32)).toString('base64url');
  const csrfToken = Buffer.from(random(32)).toString('base64url');
  return {
    token,
    csrfToken,
    tokenHash: hashAdminSecret(token, hashKey),
    csrfHash: hashAdminSecret(csrfToken, hashKey),
  };
}

export function evaluateAdminSession(
  session: AdminSessionRecord,
  now = new Date(),
): AdminSessionEvaluation {
  if (session.revokedAt) return { active: false, reason: 'revoked' };
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) {
    return { active: false, reason: 'absolute_expired' };
  }
  if (now.getTime() - session.lastSeenAt.getTime() > idleLifetimeMs) {
    return { active: false, reason: 'idle_expired' };
  }
  return {
    active: true,
    recent: now.getTime() - session.recentAuthenticatedAt.getTime() <= recentAuthenticationMs,
  };
}

export function adminSessionCookie(token: string) {
  return `__Host-learnbox_admin_session=${encodeURIComponent(token)}; Max-Age=${absoluteLifetimeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
