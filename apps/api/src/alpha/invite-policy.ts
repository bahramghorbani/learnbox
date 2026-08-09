import { createHmac, timingSafeEqual } from 'node:crypto';

export const invitePolicy = {
  codeFormat: /^[a-zA-Z0-9-]{4,64}$/,
  maxCodeLength: 64,
  requestWindowMs: 15 * 60 * 1000,
  maxRequestsPerIp: 5,
} as const;

export type InviteRequestRateLimitOutcome =
  | { status: 'allowed' }
  | { status: 'rate_limited'; retryAfterMs: number };

/**
 * Invite codes are entered as-is; only the strict ASCII allowlist format is accepted so the
 * keyed hash stays unambiguous. Persian or Arabic digits are rejected rather than normalized.
 */
export function normalizeInviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return invitePolicy.codeFormat.test(value) ? value : null;
}

/** Binds the raw allowlist code to a keyed HMAC; the raw code must never be persisted or logged. */
export function hashInviteCode(secret: string, code: string): string {
  if (secret.length < 32) throw new Error('Invite code secret must be at least 32 characters.');
  if (!invitePolicy.codeFormat.test(code)) throw new Error('Invite code format is invalid.');
  return createHmac('sha256', secret).update(`invite:${code}`).digest('base64url');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Applies the server-side sliding-window guard before the allowlist is consulted. Callers supply
 * only timestamps for an already-hashed IP subject; this core never needs the sensitive value.
 */
export function evaluateInviteRequestRateLimit(
  ipRequestTimes: readonly Date[],
  now = new Date(),
): InviteRequestRateLimitOutcome {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invite request timestamp is invalid.');

  const windowStart = nowMs - invitePolicy.requestWindowMs;
  const recent = ipRequestTimes
    .map((timestamp) => {
      if (!(timestamp instanceof Date)) {
        throw new Error('Invite request timestamp is invalid.');
      }
      return timestamp.getTime();
    })
    .map((timestamp) => {
      if (!Number.isFinite(timestamp)) throw new Error('Invite request timestamp is invalid.');
      return timestamp;
    })
    .filter((timestamp) => timestamp > windowStart && timestamp <= nowMs)
    .sort((left, right) => left - right);

  if (recent.length < invitePolicy.maxRequestsPerIp) return { status: 'allowed' };
  return {
    status: 'rate_limited',
    retryAfterMs: Math.max(1, recent[0] + invitePolicy.requestWindowMs - nowMs),
  };
}
