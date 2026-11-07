import { createHmac, randomBytes } from 'node:crypto';

// Owner requested a 24h login: no more re-authenticating mid-day. The 5-minute step-up
// window for sensitive writes (price/catalog changes) is untouched by design.
export const adminSessionIdleLifetimeMs = 24 * 60 * 60_000;
export const adminSessionIdleLifetimeSeconds = adminSessionIdleLifetimeMs / 1_000;
export const absoluteSessionLifetimeMs = 24 * 60 * 60_000;
const absoluteLifetimeSeconds = absoluteSessionLifetimeMs / 1_000;
const operationalAuthenticationMs = 24 * 60 * 60_000;
const recentAuthenticationMs = 5 * 60_000;

type RandomBytes = (size: number) => Uint8Array;

export type AdminSessionRecord = {
  lastSeenAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  recentAuthenticatedAt: Date;
};

export type AdminSessionEvaluation =
  | { active: true; operational: boolean; recent: boolean }
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
  if (now.getTime() - session.lastSeenAt.getTime() > adminSessionIdleLifetimeMs) {
    return { active: false, reason: 'idle_expired' };
  }
  const authenticationAgeMs = now.getTime() - session.recentAuthenticatedAt.getTime();
  return {
    active: true,
    // A poll can refresh lastSeenAt, never this Passkey-authentication window.
    operational: authenticationAgeMs <= operationalAuthenticationMs,
    recent: authenticationAgeMs <= recentAuthenticationMs,
  };
}

export function adminSessionCookie(token: string) {
  return `__Host-learnbox_admin_session=${encodeURIComponent(token)}; Max-Age=${absoluteLifetimeSeconds}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}
