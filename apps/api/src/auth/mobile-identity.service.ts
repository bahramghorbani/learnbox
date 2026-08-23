import { hashOtpPhone } from './otp-challenge.js';
import { MobileSessionContract } from './mobile-session.js';

export type MobileIdentityStore = Readonly<{
  verifyAndCreate(
    input: Readonly<{
      challengeId: string;
      code: string;
      installationId: string;
      phoneE164: string;
      phoneHash: string;
      now: Date;
      refreshTokenHash: string;
    }>,
  ): Promise<MobileIdentityStoreResult>;
  rotateRefresh(
    input: Readonly<{
      sessionId: string;
      refreshTokenHash: string;
      nextRefreshTokenHash: string;
      now: Date;
    }>,
  ): Promise<MobileIdentityStoreResult>;
}>;
export type MobileIdentityStoreResult =
  | Readonly<{ status: 'verified' | 'rotated'; learnerId: string; sessionId: string }>
  | Readonly<{ status: 'rejected' | 'reused' }>;
export type MobileIdentityResult =
  | Readonly<{ status: 'verified'; accessToken: string; refreshToken: string }>
  | Readonly<{ status: 'verification_failed' }>;
export type MobileRefreshResult =
  | Readonly<{ status: 'rotated'; accessToken: string; refreshToken: string }>
  | Readonly<{ status: 'authentication_failed' }>;

type Dependencies = Readonly<{
  clock: Readonly<{ now(): Date }>;
  otpSecret: string;
  session: MobileSessionContract;
  store: MobileIdentityStore;
}>;

/** Pure orchestration boundary. Store owns atomic challenge/session transactions. */
export class MobileIdentityService {
  constructor(private readonly dependencies: Dependencies) {}

  async verify(
    input: Readonly<{ challengeId: string; code: string; installationId: string; phone: string }>,
  ): Promise<MobileIdentityResult> {
    try {
      if (
        !/^[A-Za-z0-9_-]{16,128}$/.test(input.challengeId) ||
        !/^\d{5}$/.test(input.code) ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(input.installationId)
      )
        throw new Error('Mobile verification input is invalid.');
      const now = this.dependencies.clock.now();
      const phoneE164 = normalizeIranianPhone(input.phone);
      const refreshToken = this.dependencies.session.createRefreshToken();
      const result = await this.dependencies.store.verifyAndCreate(
        Object.freeze({
          challengeId: input.challengeId,
          code: input.code,
          installationId: input.installationId,
          phoneE164,
          phoneHash: hashOtpPhone(this.dependencies.otpSecret, phoneE164),
          now,
          refreshTokenHash: this.dependencies.session.hashRefreshToken(refreshToken),
        }),
      );
      return result.status === 'verified'
        ? Object.freeze({
            status: 'verified',
            accessToken: this.dependencies.session.createAccessToken({
              learnerId: result.learnerId,
              sessionId: result.sessionId,
            }),
            refreshToken,
          })
        : Object.freeze({ status: 'verification_failed' });
    } catch {
      return Object.freeze({ status: 'verification_failed' });
    }
  }

  async refresh(
    input: Readonly<{ sessionId: string; refreshToken: string }>,
  ): Promise<MobileRefreshResult> {
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.sessionId))
        throw new Error('Mobile session ID is invalid.');
      const refreshToken = this.dependencies.session.createRefreshToken();
      if (refreshToken === input.refreshToken)
        throw new Error('Refresh token rotation produced a duplicate token.');
      const result = await this.dependencies.store.rotateRefresh(
        Object.freeze({
          sessionId: input.sessionId,
          refreshTokenHash: this.dependencies.session.hashRefreshToken(input.refreshToken),
          nextRefreshTokenHash: this.dependencies.session.hashRefreshToken(refreshToken),
          now: this.dependencies.clock.now(),
        }),
      );
      return result.status === 'rotated'
        ? Object.freeze({
            status: 'rotated',
            accessToken: this.dependencies.session.createAccessToken({
              learnerId: result.learnerId,
              sessionId: result.sessionId,
            }),
            refreshToken,
          })
        : Object.freeze({ status: 'authentication_failed' });
    } catch {
      return Object.freeze({ status: 'authentication_failed' });
    }
  }
}

function normalizeIranianPhone(value: string): string {
  const digits = value
    .replace(/[۰-۹٠-٩]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(digit) % 10))
    .replace(/[\s-]/g, '');
  const national = digits.replace(/^\+98/, '0').replace(/^0098/, '0').replace(/^98/, '0');
  if (!/^09\d{9}$/.test(national)) throw new Error('Mobile phone is invalid.');
  return `+98${national.slice(1)}`;
}
