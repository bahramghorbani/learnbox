import { hashOtpCode, type OtpPurpose, type OtpVerificationOutcome } from './otp-challenge.js';

export interface OtpChallengeVerificationStore {
  verify(
    challengeId: string,
    purpose: OtpPurpose,
    suppliedCodeHash: string,
    now?: Date,
  ): Promise<OtpVerificationOutcome | null>;
}

type OtpVerificationServiceDependencies = {
  store: OtpChallengeVerificationStore;
  secret: string;
};

type OtpVerificationInput = {
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
  now?: Date;
};

export type OtpVerificationResult =
  { status: 'verified'; phoneHash: string } | { status: 'rejected' };

export class OtpVerificationService {
  constructor(private readonly dependencies: OtpVerificationServiceDependencies) {}

  async verify({
    challengeId,
    code,
    purpose,
    now = new Date(),
  }: OtpVerificationInput): Promise<OtpVerificationResult> {
    const suppliedCodeHash = hashOtpCode(this.dependencies.secret, challengeId, code);
    const outcome = await this.dependencies.store.verify(
      challengeId,
      purpose,
      suppliedCodeHash,
      now,
    );

    return outcome?.status === 'verified'
      ? { status: 'verified', phoneHash: outcome.record.phoneHash }
      : { status: 'rejected' };
  }
}
