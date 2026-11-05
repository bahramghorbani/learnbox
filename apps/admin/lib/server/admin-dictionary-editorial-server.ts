import { Pool } from 'pg';
import { readAdminDictionaryEditorialConfig } from './admin-dictionary-editorial-config';
import {
  createDictionaryEditorialCreateRoute,
  createDictionaryEditorialListRoute,
  createDictionaryEditorialTranslateExamplesRoute,
  createDictionaryEditorialAddSenseRoute,
  createDictionaryEditorialUpdateRoute,
} from './admin-dictionary-editorial-routes';
import { readAiGenerationConfig } from './ai-generation-provider';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresDictionaryEditorialStore } from './postgres-dictionary-editorial-store';
import {
  createDictionaryReleaseActionRoute,
  createDictionaryFeedbackRoute,
  createDictionaryReleaseStatusRoute,
} from './admin-dictionary-release-routes';
import { DictionaryReleasePublisher } from './dictionary-release-publisher';

/** The shared release directory the landing reads (unset: publishing is off, editing still works). */
function publisher(environment: Environment) {
  const dir = environment.LEARNBOX_ADMIN_DICTIONARY_RELEASE_DIR;
  if (!dir) return undefined;
  // getBuiltinModule keeps node:sqlite out of the bundler; it ships with the Node 22 runtime.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  return new DictionaryReleasePublisher(dir, DatabaseSync);
}

type Environment = Record<string, string | undefined>;
type Client = {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
};
type DatabasePool = {
  query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<Client>;
};
export function createAdminDictionaryEditorialServer(deps: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  now?: () => Date;
}) {
  const config = readAdminDictionaryEditorialConfig(deps.environment);
  if (!config.enabled) return { enabled: false as const };
  try {
    const pool = deps.createPool(readAdminDatabaseConfig(deps.environment));
    const release = publisher(deps.environment);
    // Same credential and model the Admin's card generator already uses in production; no second
    // AI flag for the dictionary.
    const aiConfig = readAiGenerationConfig(deps.environment);
    const shared = {
      enabled: true,
      config,
      sessionStore: new PostgresOwnerAuthStore(pool),
      store: new PostgresDictionaryEditorialStore(pool),
      now: deps.now,
      aiProvider: aiConfig.enabled ? aiConfig.provider : undefined,
    };
    return {
      enabled: true as const,
      list: createDictionaryEditorialListRoute(shared),
      create: createDictionaryEditorialCreateRoute(shared),
      update: createDictionaryEditorialUpdateRoute(shared),
      translateExamples: createDictionaryEditorialTranslateExamplesRoute(shared),
      addSense: createDictionaryEditorialAddSenseRoute(shared),
      releaseStatus: createDictionaryReleaseStatusRoute({ ...shared, publisher: release }),
      releaseAction: createDictionaryReleaseActionRoute({ ...shared, publisher: release }),
      feedback: createDictionaryFeedbackRoute({
        ...shared,
        publisher: release,
        feedbackDir: deps.environment.LEARNBOX_ADMIN_DICTIONARY_FEEDBACK_DIR,
      }),
    };
  } catch {
    return { enabled: false as const };
  }
}
export function getAdminDictionaryEditorialServer() {
  return createAdminDictionaryEditorialServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)),
  });
}
