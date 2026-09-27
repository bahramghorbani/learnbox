import { readAdminAuthConfig } from './admin-auth-policy';
import {
  createBootstrapOptionsRoute,
  createBootstrapVerifyRoute,
  createLoginOptionsRoute,
  createLoginVerifyRoute,
  createLogoutRoute,
  createReauthOptionsRoute,
  createReauthVerifyRoute,
  createSessionRoute,
} from './admin-auth-routes';
import { createAdminWebAuthnService } from './admin-webauthn';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';

type Environment = Record<string, string | undefined>;

type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

type Pool = Queryable & {
  connect(): Promise<Queryable & { release(): void }>;
};

type WebAuthnAdapter = {
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
};

export function createAdminAuthRuntime(dependencies: {
  environment: Environment;
  pool?: Pool;
  webauthn?: WebAuthnAdapter;
  now?: () => Date;
}) {
  const config = readAdminAuthConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };
  if (!dependencies.pool || !dependencies.webauthn) {
    throw new Error('Enabled admin passkeys require database and WebAuthn dependencies.');
  }

  const store = new PostgresOwnerAuthStore(dependencies.pool);
  const service = createAdminWebAuthnService({
    config,
    now: dependencies.now ?? (() => new Date()),
    webauthn: dependencies.webauthn,
    store,
  });
  return {
    enabled: true as const,
    bootstrapOptions: createBootstrapOptionsRoute({
      config,
      environment: dependencies.environment,
      service,
    }),
    bootstrapVerify: createBootstrapVerifyRoute({
      config,
      environment: dependencies.environment,
      service,
    }),
    loginOptions: createLoginOptionsRoute({ config, service }),
    loginVerify: createLoginVerifyRoute({
      config,
      now: dependencies.now,
      service,
      sessionStore: store,
    }),
    reauthOptions: createReauthOptionsRoute({
      config,
      environment: dependencies.environment,
      now: dependencies.now,
      sessionStore: store,
      service,
    }),
    reauthVerify: createReauthVerifyRoute({
      config,
      now: dependencies.now,
      service,
      sessionStore: store,
    }),
    session: createSessionRoute({ config, sessionStore: store }),
    logout: createLogoutRoute({ config, sessionStore: store }),
  };
}
