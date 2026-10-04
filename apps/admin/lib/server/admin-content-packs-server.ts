import { Pool } from 'pg';

import { readAdminContentPacksConfig } from './admin-content-packs-config';
import {
  createContentPackCardsRoute,
  createContentPacksListRoute,
} from './admin-content-packs-routes';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresContentPacksStore } from './postgres-content-packs-store';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

export function createAdminContentPacksServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  now?: () => Date;
}) {
  const config = readAdminContentPacksConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const sessionStore = new PostgresOwnerAuthStore(pool);
    const store = new PostgresContentPacksStore(pool);
    const shared = {
      enabled: true,
      config,
      sessionStore,
      store,
      now: dependencies.now,
    };
    return {
      enabled: true as const,
      list: createContentPacksListRoute(shared),
      cards: createContentPackCardsRoute(shared),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminContentPacksServer() {
  return createAdminContentPacksServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)),
  });
}
