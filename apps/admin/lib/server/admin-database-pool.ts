import type { AdminDatabaseConfig } from './admin-database';

type DatabasePool = {
  connect(): Promise<unknown>;
  query(sql: string, parameters?: readonly unknown[]): Promise<unknown>;
};

type AdminPoolGlobal = typeof globalThis & {
  learnboxAdminPools?: Map<string, DatabasePool>;
};

export function getSharedAdminDatabasePool<T extends DatabasePool>(
  config: AdminDatabaseConfig,
  createPool: (config: AdminDatabaseConfig) => T,
): T {
  const shared = globalThis as AdminPoolGlobal;
  const pools = (shared.learnboxAdminPools ??= new Map());
  const key = [
    config.connectionString,
    String(config.max),
    String(config.idleTimeoutMillis),
    String(config.connectionTimeoutMillis),
  ].join('\u0000');
  const existing = pools.get(key);
  if (existing) return existing as T;

  const pool = createPool(config);
  pools.set(key, pool);
  return pool;
}
