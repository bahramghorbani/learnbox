import { Pool } from 'pg';

import { readAdminContentReviewConfig } from './admin-content-review-config';
import {
  createContentReviewCheckRoute,
  createContentReviewDecisionRoute,
  createContentReviewQueueRoute,
} from './admin-content-review-routes';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresContentReviewStore } from './postgres-content-review-store';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

export function createAdminContentReviewServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  now?: () => Date;
}) {
  const config = readAdminContentReviewConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const sessionStore = new PostgresOwnerAuthStore(pool);
    const store = new PostgresContentReviewStore(pool);
    const shared = {
      enabled: true,
      config,
      sessionStore,
      store,
      now: dependencies.now,
    };
    return {
      enabled: true as const,
      queue: createContentReviewQueueRoute(shared),
      check: createContentReviewCheckRoute(shared),
      decision: createContentReviewDecisionRoute(shared),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminContentReviewServer() {
  return createAdminContentReviewServer({
    environment: process.env,
    createPool: (config) => new Pool(config),
  });
}
