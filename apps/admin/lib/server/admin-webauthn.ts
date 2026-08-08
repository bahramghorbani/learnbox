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
};

type AuthStore = {
  issueChallenge(input: {
    challengeHash: string;
    browserNonceHash: string;
    ceremony: 'authentication';
    expiresAt: Date;
    ownerSingletonId: null;
  }): Promise<string>;
  findPendingChallenge(input: {
    browserNonceHash: string;
    ceremony: 'authentication';
    now: Date;
  }): Promise<{ id: string; challengeHash: string } | undefined>;
  findActiveCredential(credentialId: Uint8Array): Promise<Credential | undefined>;
  completeAuthentication(input: {
    challengeHash: string;
    browserNonceHash: string;
    ceremony: 'authentication';
    credentialId: Uint8Array;
    expectedCounter: number;
    newCounter: number;
    now: Date;
  }): Promise<{ status: 'authenticated' | 'invalid' }>;
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

export function createAdminWebAuthnService(dependencies: {
  config: EnabledAdminAuthConfig;
  now: () => Date;
  webauthn: Partial<WebAuthnAdapter>;
  store: Partial<AuthStore>;
}) {
  const { config, now, webauthn, store } = dependencies;

  return {
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
