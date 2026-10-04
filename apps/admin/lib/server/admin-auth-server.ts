import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { Pool } from 'pg';

import { readAdminAuthConfig } from './admin-auth-policy';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { createAdminAuthRuntime } from './admin-auth-runtime';

type Environment = Record<string, string | undefined>;

type ServerWebAuthn = {
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
};

type RuntimeWebAuthn = {
  generateAuthenticationOptions(input: {
    rpID: string;
    userVerification: 'required';
  }): Promise<{ challenge: string; [key: string]: unknown }>;
  verifyAuthenticationResponse(input: {
    response: { id: string; [key: string]: unknown };
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
  }): Promise<{ verified: boolean; authenticationInfo?: { newCounter: number } }>;
  generateRegistrationOptions(input: {
    rpID: string;
    rpName: string;
    userName: string;
    userID: Uint8Array;
    userVerification: 'required';
    attestationType: 'none';
  }): Promise<{ challenge: string; [key: string]: unknown }>;
  verifyRegistrationResponse(input: {
    response: { id: string; [key: string]: unknown };
    expectedChallenge: (challenge: string) => Promise<boolean>;
    expectedOrigin: string;
    expectedRPID: string;
    requireUserVerification: true;
  }): Promise<{
    verified: boolean;
    registrationInfo?: {
      credential: {
        id: string;
        publicKey: Uint8Array;
        counter: number;
        transports?: string[];
      };
      credentialDeviceType: string;
      credentialBackedUp: boolean;
    };
  }>;
};

function adaptWebAuthn(webauthn: ServerWebAuthn): RuntimeWebAuthn {
  return {
    generateAuthenticationOptions: async (input) =>
      (await webauthn.generateAuthenticationOptions(input)) as unknown as {
        challenge: string;
        [key: string]: unknown;
      },
    verifyAuthenticationResponse: async (input) => {
      const result = await webauthn.verifyAuthenticationResponse({
        response: input.response as unknown as AuthenticationResponseJSON,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: input.expectedOrigin,
        expectedRPID: input.expectedRPID,
        requireUserVerification: input.requireUserVerification,
        credential: {
          id: input.credential.id,
          publicKey: input.credential.publicKey,
          counter: input.credential.counter,
          transports: input.credential.transports,
        } as WebAuthnCredential,
      });
      return {
        verified: result.verified,
        authenticationInfo: result.authenticationInfo
          ? { newCounter: result.authenticationInfo.newCounter }
          : undefined,
      };
    },
    generateRegistrationOptions: async (input) =>
      (await webauthn.generateRegistrationOptions({
        ...input,
        // SimpleWebAuthn narrows userID to Uint8Array<ArrayBuffer>; the runtime interface uses the
        // wider Uint8Array<ArrayBufferLike>. Copy into a fresh ArrayBuffer-backed view so the
        // buffer type matches exactly instead of being force-cast.
        userID: new Uint8Array(input.userID),
      })) as unknown as {
        challenge: string;
        [key: string]: unknown;
      },
    verifyRegistrationResponse: async (input) => {
      const result = await webauthn.verifyRegistrationResponse({
        response: input.response as unknown as RegistrationResponseJSON,
        expectedChallenge: input.expectedChallenge,
        expectedOrigin: input.expectedOrigin,
        expectedRPID: input.expectedRPID,
        requireUserVerification: input.requireUserVerification,
      });
      return {
        verified: result.verified,
        registrationInfo: result.registrationInfo
          ? {
              credential: {
                id: result.registrationInfo.credential.id,
                publicKey: result.registrationInfo.credential.publicKey,
                counter: result.registrationInfo.credential.counter,
                transports: result.registrationInfo.credential.transports,
              },
              credentialDeviceType: result.registrationInfo.credentialDeviceType,
              credentialBackedUp: result.registrationInfo.credentialBackedUp,
            }
          : undefined,
      };
    },
  };
}

export function createAdminAuthServer(dependencies: {
  environment: Environment;
  createPool: (config: AdminDatabaseConfig) => {
    connect(): Promise<{
      query(
        sql: string,
        parameters?: readonly unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }>;
      release(): void;
    }>;
    query(
      sql: string,
      parameters?: readonly unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }>;
  };
  webauthn: Partial<RuntimeWebAuthn>;
}) {
  const config = readAdminAuthConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };
  if (
    !dependencies.webauthn.generateAuthenticationOptions ||
    !dependencies.webauthn.verifyAuthenticationResponse ||
    !dependencies.webauthn.generateRegistrationOptions ||
    !dependencies.webauthn.verifyRegistrationResponse
  ) {
    throw new Error('Enabled admin passkeys require SimpleWebAuthn.');
  }
  const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
  return createAdminAuthRuntime({
    environment: dependencies.environment,
    pool,
    webauthn: dependencies.webauthn as RuntimeWebAuthn,
  });
}

export function getAdminAuthServer() {
  return createAdminAuthServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)),
    webauthn: adaptWebAuthn({
      generateAuthenticationOptions,
      verifyAuthenticationResponse,
      generateRegistrationOptions,
      verifyRegistrationResponse,
    }),
  });
}
