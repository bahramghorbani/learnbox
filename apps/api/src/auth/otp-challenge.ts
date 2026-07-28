import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const otpPolicy = {
  codeLength: 5,
  expiresInMs: 5 * 60 * 1000,
  resendCooldownMs: 60 * 1000,
  maxAttempts: 5,
} as const;

export type OtpPurpose = 'sign_in';

export type OtpChallengeRecord = {
  id: string;
  phoneHash: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  attemptCount: number;
  maxAttempts: number;
  consumedAt: Date | null;
};

export type OtpVerificationOutcome =
  | { status: 'verified'; record: OtpChallengeRecord }
  | { status: 'invalid'; record: OtpChallengeRecord }
  | { status: 'expired' | 'locked' | 'used' };

type CreateOtpChallengeInput = {
  id: string;
  phoneHash: string;
  codeHash: string;
  purpose: OtpPurpose;
  now?: Date;
};

/** Generates only the short-lived delivery value; callers must never persist or log it. */
export function createOtpCode(): string {
  return String(randomInt(10 ** otpPolicy.codeLength)).padStart(otpPolicy.codeLength, '0');
}

/**
 * HMAC binds the short-lived code to one opaque challenge. The keyed value is what may be stored;
 * the raw phone and code must never be persisted in an OTP challenge record.
 */
export function hashOtpCode(secret: string, challengeId: string, code: string): string {
  if (secret.length < 32) throw new Error('OTP challenge secret must be at least 32 characters.');
  if (!isOpaqueId(challengeId)) throw new Error('OTP challenge ID must be opaque.');
  if (!/^\d{5}$/.test(code)) throw new Error('OTP code must match the configured code length.');
  return createHmac('sha256', secret).update(`code:${challengeId}:${code}`).digest('base64url');
}

/** Keeps the normalized phone opaque in the challenge store while allowing per-phone limits. */
export function hashOtpPhone(secret: string, phoneE164: string): string {
  if (secret.length < 32) throw new Error('OTP challenge secret must be at least 32 characters.');
  if (!/^\+989\d{9}$/.test(phoneE164)) throw new Error('OTP phone must be Iranian E.164.');
  return createHmac('sha256', secret).update(`phone:${phoneE164}`).digest('base64url');
}

export function createOtpChallenge({
  id,
  phoneHash,
  codeHash,
  purpose,
  now = new Date(),
}: CreateOtpChallengeInput): OtpChallengeRecord {
  if (!isOpaqueId(id) || !isHash(phoneHash) || !isHash(codeHash)) {
    throw new Error('OTP challenge input is invalid.');
  }

  return {
    id,
    phoneHash,
    codeHash,
    purpose,
    expiresAt: new Date(now.getTime() + otpPolicy.expiresInMs),
    resendAvailableAt: new Date(now.getTime() + otpPolicy.resendCooldownMs),
    attemptCount: 0,
    maxAttempts: otpPolicy.maxAttempts,
    consumedAt: null,
  };
}

/**
 * Calculates a single verification transition. Persistence must atomically store the returned
 * record, so concurrent requests cannot consume or increment the same challenge twice.
 */
export function evaluateOtpVerification(
  record: OtpChallengeRecord,
  suppliedCodeHash: string,
  now = new Date(),
): OtpVerificationOutcome {
  if (!isHash(suppliedCodeHash)) throw new Error('OTP verification input is invalid.');
  if (record.consumedAt) return { status: 'used' };
  if (record.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };
  if (record.attemptCount >= record.maxAttempts) return { status: 'locked' };

  if (safeEqual(record.codeHash, suppliedCodeHash)) {
    return { status: 'verified', record: { ...record, consumedAt: now } };
  }

  const nextRecord = { ...record, attemptCount: record.attemptCount + 1 };
  return nextRecord.attemptCount >= nextRecord.maxAttempts
    ? { status: 'locked' }
    : { status: 'invalid', record: nextRecord };
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isOpaqueId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{16,128}$/.test(value);
}

function isHash(value: string): boolean {
  return /^[a-zA-Z0-9_-]{32,128}$/.test(value);
}
