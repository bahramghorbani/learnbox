import { describe, expect, it } from 'vitest';

import { hashAdminSecret } from '../lib/server/admin-session';
import { createAdminWebAuthnService } from '../lib/server/admin-webauthn';

const hashKey = 'h'.repeat(32);
const now = new Date('2026-08-08T12:00:00.000Z');
const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: hashKey,
};

describe('admin WebAuthn login service', () => {
  it('creates discoverable, user-verified login options bound to an opaque browser nonce', async () => {
    const issued: unknown[] = [];
    const service = createAdminWebAuthnService({
      config,
      now: () => now,
      webauthn: {
        generateAuthenticationOptions: async (input) => {
          expect(input).toMatchObject({ rpID: config.rpId, userVerification: 'required' });
          expect(input).not.toHaveProperty('allowCredentials');
          return { challenge: 'raw-challenge', rpId: config.rpId };
        },
      },
      store: {
        issueChallenge: async (input) => {
          issued.push(input);
          return 'challenge-id';
        },
      },
    });

    await expect(service.createLoginOptions('browser-nonce')).resolves.toEqual({
      challenge: 'raw-challenge',
      rpId: config.rpId,
    });
    expect(issued).toEqual([
      {
        ceremony: 'authentication',
        challengeHash: hashAdminSecret('raw-challenge', hashKey),
        browserNonceHash: hashAdminSecret('browser-nonce', hashKey),
        ownerSingletonId: null,
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    ]);
  });

  it('verifies only a pending nonce-bound challenge with a known credential and consumes it', async () => {
    const completion: unknown[] = [];
    const credentialId = Buffer.from('credential-id').toString('base64url');
    const service = createAdminWebAuthnService({
      config,
      now: () => now,
      webauthn: {
        verifyAuthenticationResponse: async (input) => {
          expect(input.expectedOrigin).toBe(config.origin);
          expect(input.expectedRPID).toBe(config.rpId);
          expect(input.requireUserVerification).toBe(true);
          expect(input.credential).toMatchObject({ counter: 7 });
          expect(await input.expectedChallenge('raw-challenge')).toBe(true);
          expect(await input.expectedChallenge('wrong-challenge')).toBe(false);
          return { verified: true, authenticationInfo: { newCounter: 8 } };
        },
      },
      store: {
        findPendingChallenge: async () => ({
          id: 'challenge-id',
          challengeHash: hashAdminSecret('raw-challenge', hashKey),
        }),
        findActiveCredential: async () => ({
          credentialId: Buffer.from('credential-id'),
          publicKey: Buffer.from('public-key'),
          counter: 7,
          transports: ['internal'],
        }),
        completeAuthentication: async (input) => {
          completion.push(input);
          return { status: 'authenticated' as const };
        },
      },
    });

    await expect(
      service.verifyLogin({
        browserNonce: 'browser-nonce',
        response: { id: credentialId },
      }),
    ).resolves.toEqual({ status: 'authenticated' });
    expect(completion).toEqual([
      expect.objectContaining({
        ceremony: 'authentication',
        expectedCounter: 7,
        newCounter: 8,
        browserNonceHash: hashAdminSecret('browser-nonce', hashKey),
      }),
    ]);
  });

  it('returns a generic invalid result when the nonce, credential, or verification is unavailable', async () => {
    const service = createAdminWebAuthnService({
      config,
      now: () => now,
      webauthn: { verifyAuthenticationResponse: async () => ({ verified: false }) },
      store: { findPendingChallenge: async () => undefined },
    });

    await expect(
      service.verifyLogin({ browserNonce: 'browser-nonce', response: { id: 'missing' } }),
    ).resolves.toEqual({ status: 'invalid' });
  });
});
