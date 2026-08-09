import { timingSafeEqual } from 'node:crypto';

import type { EnabledAdminAuthConfig } from './admin-auth-policy';
import { hashAdminSecret } from './admin-session';

const challengeLifetimeMs = 5 * 60_000;

type AuthenticationOptions = { challenge: string; [key: string]: unknown };

type AuthenticationResponse = { id: string; [key: string]: unknown };

type Credential = {
  credentialId: Uint8Array;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
};

type RegistrationOptions = { challenge: string; user: { id: string }; [key: string]: unknown };

type RegistrationResponse = {
  id: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    [key: string]: unknown;
  };
  user?: { id: string; [key: string]: unknown };
  [key: string]: unknown;
};

type RegistrationResult = {
  verified: boolean;
  registrationInfo?: {
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports: string[];
    };
    credentialDeviceType: string;
    credentialBackedUp: boolean;
  };
};

type VerificationResult = {
  verified: boolean;
  authenticationInfo?: { newCounter: number };
};

type WebAuthnAdapter = {
  generateAuthenticationOptions(input: {
    rpID: string;
    userVerification: 'required';
  }): Promise<AuthenticationOptions>;
  verifyAuthenticationResponse(input: {
    response: AuthenticationResponse;
    expectedChallenge: (challenge: string) => Promise<boolean>;
    expectedOrigin: string;
    expectedRPID: string;
    requireUserVerification: true;
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports: string[];
    };
  }): Promise<VerificationResult>;
  generateRegistrationOptions(input: {
    rpID: string;
    rpName: string;
    userName: string;
    userID: Uint8Array;
    userVerification: 'required';
    attestationType: 'none';
  }): Promise<RegistrationOptions>;
  verifyRegistrationResponse(input: {
    response: RegistrationResponse;
    expectedChallenge: (challenge: string) => Promise<boolean>;
    expectedOrigin: string;
    expectedRPID: string;
    requireUserVerification: true;
  }): Promise<RegistrationResult>;
};

type AuthStore = {
  issueChallenge(input: {
    challengeHash: string;
    browserNonceHash: string;
    ceremony: 'authentication' | 'bootstrap_registration' | 'reauthentication';
    expiresAt: Date;
    ownerSingletonId: 1 | null;
  }): Promise<string>;
  findPendingChallenge(input: {
    browserNonceHash: string;
    ceremony: 'authentication' | 'bootstrap_registration' | 'reauthentication';
    now: Date;
  }): Promise<{ id: string; challengeHash: string } | undefined>;
  findActiveCredential(credentialId: Uint8Array): Promise<Credential | undefined>;
  completeAuthentication(input: {
    challengeHash: string;
    browserNonceHash: string;
    ceremony: 'authentication' | 'reauthentication';
    credentialId: Uint8Array;
    expectedCounter: number;
    newCounter: number;
    now: Date;
  }): Promise<{ status: 'authenticated' | 'invalid' }>;
  bootstrapFirstCredential(
    ownerHandle: Uint8Array,
    credential: PasskeyCredentialRecord,
    now: Date,
  ): Promise<{ status: 'bootstrapped' | 'closed' }>;
};

type PasskeyCredentialRecord = {
  credentialId: Uint8Array;
  publicKey: Uint8Array;
  counter: number;
  transports: readonly string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
};

function equalHash(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function decodeCredentialId(value: string): Uint8Array | undefined {
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length > 0 ? new Uint8Array(decoded) : undefined;
  } catch {
    return undefined;
  }
}

function deriveBootstrapOwnerHandle(browserNonce: string, tokenHashKey: string) {
  return new Uint8Array(Buffer.from(hashAdminSecret(browserNonce, tokenHashKey), 'base64url'));
}

export function createAdminWebAuthnService(dependencies: {
  config: EnabledAdminAuthConfig;
  now: () => Date;
  webauthn: Partial<WebAuthnAdapter>;
  store: Partial<AuthStore>;
}) {
  const { config, now, webauthn, store } = dependencies;

  return {
    async createBootstrapOptions(browserNonce: string) {
      if (!webauthn.generateRegistrationOptions || !store.issueChallenge) {
        throw new Error('Admin WebAuthn bootstrap dependencies are unavailable.');
      }
      const ownerHandle = deriveBootstrapOwnerHandle(browserNonce, config.tokenHashKey);
      const options = await webauthn.generateRegistrationOptions({
        rpID: config.rpId,
        rpName: 'LearnBox',
        userName: 'learnbox-owner',
        userID: ownerHandle,
        userVerification: 'required',
        attestationType: 'none',
      });
      const issuedAt = now();
      await store.issueChallenge({
        challengeHash: hashAdminSecret(options.challenge, config.tokenHashKey),
        browserNonceHash: hashAdminSecret(browserNonce, config.tokenHashKey),
        ceremony: 'bootstrap_registration',
        expiresAt: new Date(issuedAt.getTime() + challengeLifetimeMs),
        ownerSingletonId: null,
      });
      return {
        ...options,
        user: { ...options.user, id: Buffer.from(ownerHandle).toString('base64url') },
      };
    },

    async verifyBootstrap(input: {
      browserNonce: string;
      secret: string;
      response: RegistrationResponse;
    }) {
      const currentTime = now();
      if (
        !webauthn.verifyRegistrationResponse ||
        !store.findPendingChallenge ||
        !store.bootstrapFirstCredential
      ) {
        return { status: 'invalid' as const };
      }
      const browserNonceHash = hashAdminSecret(input.browserNonce, config.tokenHashKey);
      const pendingChallenge = await store.findPendingChallenge({
        browserNonceHash,
        ceremony: 'bootstrap_registration',
        now: currentTime,
      });
      if (!pendingChallenge) return { status: 'invalid' as const };

      try {
        const verification = await webauthn.verifyRegistrationResponse({
          response: input.response,
          expectedChallenge: async (challenge) =>
            equalHash(
              hashAdminSecret(challenge, config.tokenHashKey),
              pendingChallenge.challengeHash,
            ),
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
        });
        if (!verification.verified || !verification.registrationInfo) {
          return { status: 'invalid' as const };
        }
        const credential = verification.registrationInfo.credential;
        const result = await store.bootstrapFirstCredential(
          deriveBootstrapOwnerHandle(input.browserNonce, config.tokenHashKey),
          {
            credentialId: new Uint8Array(Buffer.from(credential.id, 'base64url')),
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
            deviceType:
              verification.registrationInfo.credentialDeviceType === 'singleDevice'
                ? 'singleDevice'
                : 'multiDevice',
            backedUp: verification.registrationInfo.credentialBackedUp,
          },
          currentTime,
        );
        return {
          status:
            result.status === 'bootstrapped' ? ('bootstrapped' as const) : ('invalid' as const),
        };
      } catch {
        return { status: 'invalid' as const };
      }
    },

    async createReauthOptions(browserNonce: string) {
      if (!webauthn.generateAuthenticationOptions || !store.issueChallenge) {
        throw new Error('Admin WebAuthn reauthentication dependencies are unavailable.');
      }
      const options = await webauthn.generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
      });
      const issuedAt = now();
      await store.issueChallenge({
        challengeHash: hashAdminSecret(options.challenge, config.tokenHashKey),
        browserNonceHash: hashAdminSecret(browserNonce, config.tokenHashKey),
        ceremony: 'reauthentication',
        expiresAt: new Date(issuedAt.getTime() + challengeLifetimeMs),
        ownerSingletonId: 1,
      });
      return options;
    },

    async verifyReauth(input: { browserNonce: string; response: AuthenticationResponse }) {
      const currentTime = now();
      if (
        !webauthn.verifyAuthenticationResponse ||
        !store.findPendingChallenge ||
        !store.findActiveCredential ||
        !store.completeAuthentication
      ) {
        return { status: 'invalid' as const };
      }
      const browserNonceHash = hashAdminSecret(input.browserNonce, config.tokenHashKey);
      const pendingChallenge = await store.findPendingChallenge({
        browserNonceHash,
        ceremony: 'reauthentication',
        now: currentTime,
      });
      const credentialId = decodeCredentialId(input.response.id);
      if (!pendingChallenge || !credentialId) return { status: 'invalid' as const };

      const credential = await store.findActiveCredential(credentialId);
      if (!credential) return { status: 'invalid' as const };

      try {
        const verification = await webauthn.verifyAuthenticationResponse({
          response: input.response,
          expectedChallenge: async (challenge) =>
            equalHash(
              hashAdminSecret(challenge, config.tokenHashKey),
              pendingChallenge.challengeHash,
            ),
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          credential: {
            id: Buffer.from(credential.credentialId).toString('base64url'),
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
          },
        });
        if (!verification.verified || !verification.authenticationInfo) {
          return { status: 'invalid' as const };
        }
        const completion = await store.completeAuthentication({
          challengeHash: pendingChallenge.challengeHash,
          browserNonceHash,
          ceremony: 'reauthentication',
          credentialId,
          expectedCounter: credential.counter,
          newCounter: verification.authenticationInfo.newCounter,
          now: currentTime,
        });
        return {
          status:
            completion.status === 'authenticated'
              ? ('reauthenticated' as const)
              : ('invalid' as const),
        };
      } catch {
        return { status: 'invalid' as const };
      }
    },

    async createLoginOptions(browserNonce: string) {
      if (!webauthn.generateAuthenticationOptions || !store.issueChallenge) {
        throw new Error('Admin WebAuthn login dependencies are unavailable.');
      }
      const options = await webauthn.generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
      });
      const issuedAt = now();
      await store.issueChallenge({
        challengeHash: hashAdminSecret(options.challenge, config.tokenHashKey),
        browserNonceHash: hashAdminSecret(browserNonce, config.tokenHashKey),
        ceremony: 'authentication',
        expiresAt: new Date(issuedAt.getTime() + challengeLifetimeMs),
        ownerSingletonId: null,
      });
      return options;
    },

    async verifyLogin(input: { browserNonce: string; response: AuthenticationResponse }) {
      const currentTime = now();
      if (
        !webauthn.verifyAuthenticationResponse ||
        !store.findPendingChallenge ||
        !store.findActiveCredential ||
        !store.completeAuthentication
      ) {
        return { status: 'invalid' as const };
      }
      const browserNonceHash = hashAdminSecret(input.browserNonce, config.tokenHashKey);
      const pendingChallenge = await store.findPendingChallenge({
        browserNonceHash,
        ceremony: 'authentication',
        now: currentTime,
      });
      const credentialId = decodeCredentialId(input.response.id);
      if (!pendingChallenge || !credentialId) return { status: 'invalid' as const };

      const credential = await store.findActiveCredential(credentialId);
      if (!credential) return { status: 'invalid' as const };

      try {
        const verification = await webauthn.verifyAuthenticationResponse({
          response: input.response,
          expectedChallenge: async (challenge) =>
            equalHash(
              hashAdminSecret(challenge, config.tokenHashKey),
              pendingChallenge.challengeHash,
            ),
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          credential: {
            id: Buffer.from(credential.credentialId).toString('base64url'),
            publicKey: credential.publicKey,
            counter: credential.counter,
            transports: credential.transports,
          },
        });
        if (!verification.verified || !verification.authenticationInfo) {
          return { status: 'invalid' as const };
        }
        return store.completeAuthentication({
          challengeHash: pendingChallenge.challengeHash,
          browserNonceHash,
          ceremony: 'authentication',
          credentialId,
          expectedCounter: credential.counter,
          newCounter: verification.authenticationInfo.newCounter,
          now: currentTime,
        });
      } catch {
        return { status: 'invalid' as const };
      }
    },
  };
}
