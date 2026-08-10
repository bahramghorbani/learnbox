import { Pool } from 'pg';

import { readAdminAuthConfig } from './admin-auth-policy';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import {
  createSplashCurrentRoute,
  createSplashPreviewRoute,
  createSplashReplaceRoute,
} from './admin-splash-routes';
import { normalizeSplashImage } from './splash-image';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresSplashStore } from './postgres-splash-store';
import { createPrivateSplashStorage } from './private-splash-storage';
import { replaceSplash, type NormalizedSplashCandidate } from './replace-splash';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Client = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
  release(): void;
};
type DatabasePool = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
  connect(): Promise<Client>;
};
type PrivateStorage = {
  read(objectKey: string): Promise<ReadableStream<Uint8Array> | undefined>;
  upload(objectKey: string, bytes: Buffer, contentType: 'image/webp'): Promise<void>;
  delete(objectKey: string): Promise<void>;
};

type Normalizer = (
  bytes: Buffer,
) => Promise<
  ({ kind: 'normalized' } & NormalizedSplashCandidate) | { kind: 'rejected'; code: string }
>;

export function createAdminSplashServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  createStorage(token: string): PrivateStorage;
  normalize?: Normalizer;
  now?: () => Date;
}) {
  if (dependencies.environment.LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED !== 'true') {
    return { enabled: false as const };
  }
  const token = dependencies.environment.BLOB_READ_WRITE_TOKEN;
  if (!token || token.length < 20) return { enabled: false as const };

  try {
    const config = readAdminAuthConfig(dependencies.environment);
    if (!config.enabled) return { enabled: false as const };
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const sessionStore = new PostgresOwnerAuthStore(pool);
    const splashStore = new PostgresSplashStore(pool);
    const storage = dependencies.createStorage(token);
    const shared = {
      enabled: true,
      config,
      now: dependencies.now,
      sessionStore,
      store: splashStore,
    };
    return {
      enabled: true as const,
      current: createSplashCurrentRoute(shared),
      preview: createSplashPreviewRoute({ ...shared, storage }),
      replace: createSplashReplaceRoute({
        ...shared,
        normalize: dependencies.normalize ?? normalizeSplashImage,
        replace: (input) => replaceSplash(input, { storage, store: splashStore }),
      }),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminSplashServer() {
  return createAdminSplashServer({
    environment: process.env,
    createPool: (config) => new Pool(config),
    createStorage: (token) => createPrivateSplashStorage({ token }),
  });
}
