import { Pool } from 'pg';

import {
  readAdminContentPacksConfig,
  readAdminContentPacksManageConfig,
} from './admin-content-packs-config';
import {
  createContentPackCardsRoute,
  createContentPacksListRoute,
} from './admin-content-packs-routes';
import {
  createContentCardCreateRoute,
  createContentCardEditRoute,
  createContentPackCreateRoute,
  createContentPackEditRoute,
} from './admin-content-packs-write-routes';
import {
  createContentImportConfirmRoute,
  createContentImportContractRoute,
  createContentImportPreviewRoute,
  createContentImportTemplateRoute,
} from './admin-content-import-routes';
import { ContentImportService } from './content-import-service';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresContentPacksStore } from './postgres-content-packs-store';
import { PostgresContentPacksWriteStore } from './postgres-content-packs-write-store';

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
    // Writes carry their own default-off gate; when it is off the mutation routes 404 while the
    // read workspace keeps working.
    const manageConfig = readAdminContentPacksManageConfig(dependencies.environment);
    const writeStore = new PostgresContentPacksWriteStore(pool);
    const writeShared = {
      enabled: manageConfig.enabled,
      config: manageConfig,
      sessionStore,
      store: writeStore,
      now: dependencies.now,
    };
    // Bulk import rides the same manage gate and the same canonical write store, so it can never
    // become a second content path with its own rules.
    const importShared = {
      enabled: manageConfig.enabled,
      config: manageConfig,
      sessionStore,
      service: new ContentImportService(pool, writeStore),
      now: dependencies.now,
    };
    return {
      enabled: true as const,
      manageEnabled: manageConfig.enabled,
      list: createContentPacksListRoute({ ...shared, manageEnabled: manageConfig.enabled }),
      cards: createContentPackCardsRoute(shared),
      createPack: createContentPackCreateRoute(writeShared),
      editPack: createContentPackEditRoute(writeShared),
      createCard: createContentCardCreateRoute(writeShared),
      editCard: createContentCardEditRoute(writeShared),
      importPreview: createContentImportPreviewRoute(importShared),
      importConfirm: createContentImportConfirmRoute(importShared),
      importTemplate: createContentImportTemplateRoute(importShared),
      importContract: createContentImportContractRoute(importShared),
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
