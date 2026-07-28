/**
 * The server-side boundary for the eventual SMS/identity provider.
 *
 * This module deliberately has no provider implementation. Until an approved
 * provider adapter is installed, every OTP operation fails closed and the
 * current phone screen remains a local-only alpha prototype.
 */

export type OtpPurpose = 'sign-in';

export type OtpChallengeRequest = {
  phoneE164: string;
  purpose: OtpPurpose;
  clientIpHash: string;
};

export type OtpChallenge = {
  challengeId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
};

export type VerifiedOtpIdentity = {
  providerSubject: string;
  phoneE164: string;
};

export type OtpVerificationRequest = {
  challengeId: string;
  code: string;
  purpose: OtpPurpose;
};

export interface OtpProvider {
  requestChallenge(request: OtpChallengeRequest): Promise<OtpChallenge>;
  verifyChallenge(request: OtpVerificationRequest): Promise<VerifiedOtpIdentity | null>;
}

export class OtpProviderUnavailableError extends Error {
  constructor() {
    super('OTP provider is not configured.');
    this.name = 'OtpProviderUnavailableError';
  }
}

class DisabledOtpProvider implements OtpProvider {
  async requestChallenge(): Promise<OtpChallenge> {
    throw new OtpProviderUnavailableError();
  }

  async verifyChallenge(): Promise<VerifiedOtpIdentity | null> {
    throw new OtpProviderUnavailableError();
  }
}

/**
 * A real adapter may be selected only after its account, terms, credentials,
 * abuse controls, and deployment environment have been explicitly approved.
 */
export function otpProvider(): OtpProvider {
  return new DisabledOtpProvider();
}
