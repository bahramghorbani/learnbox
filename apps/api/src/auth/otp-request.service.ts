import { randomUUID } from 'node:crypto';

import {
  createOtpChallenge,
  createOtpCode,
  hashOtpCode,
  hashOtpPhone,
  type OtpChallengeRecord,
  type OtpPurpose,
  type OtpRequestRateLimitOutcome,
} from './otp-challenge.js';

export interface OtpChallengeRequestStore {
  createIfRequestAllowed(
    record: OtpChallengeRecord,
    clientIpHash: string,
    now?: Date,
  ): Promise<OtpRequestRateLimitOutcome>;
}

export interface OtpCodeDeliveryClient {
  sendVerificationCode(phoneE164: string, code: string): Promise<void>;
}

type OtpRequestServiceDependencies = {
  store: OtpChallengeRequestStore;
  delivery: OtpCodeDeliveryClient;
  secret: string;
  createChallengeId?: () => string;
  createCode?: () => string;
};

type OtpRequestInput = {
  phoneE164: string;
  clientIpHash: string;
  purpose: OtpPurpose;
  now?: Date;
};

export type OtpRequestOutcome =
  | {
      status: 'created';
      challengeId: string;
      expiresAt: Date;
      resendAvailableAt: Date;
    }
  | Extract<OtpRequestRateLimitOutcome, { status: 'rate_limited' }>;

export class OtpRequestService {
  private readonly createChallengeId: () => string;
  private readonly createCode: () => string;

  constructor(private readonly dependencies: OtpRequestServiceDependencies) {
    this.createChallengeId = dependencies.createChallengeId ?? randomUUID;
    this.createCode = dependencies.createCode ?? createOtpCode;
  }

  async request({
    phoneE164,
    clientIpHash,
    purpose,
    now = new Date(),
  }: OtpRequestInput): Promise<OtpRequestOutcome> {
    const challengeId = this.createChallengeId();
    const code = this.createCode();
    const challenge = createOtpChallenge({
      id: challengeId,
      phoneHash: hashOtpPhone(this.dependencies.secret, phoneE164),
      codeHash: hashOtpCode(this.dependencies.secret, challengeId, code),
      purpose,
      now,
    });

    const persistence = await this.dependencies.store.createIfRequestAllowed(
      challenge,
      clientIpHash,
      now,
    );
    if (persistence.status === 'rate_limited') return persistence;

    await this.dependencies.delivery.sendVerificationCode(phoneE164, code);
    return {
      status: 'created',
      challengeId,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: challenge.resendAvailableAt,
    };
  }
}
