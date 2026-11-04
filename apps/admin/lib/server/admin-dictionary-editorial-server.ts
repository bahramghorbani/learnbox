import { Pool } from 'pg';
import { readAdminDictionaryEditorialConfig } from './admin-dictionary-editorial-config';
import { createDictionaryEditorialCreateRoute, createDictionaryEditorialListRoute, createDictionaryEditorialUpdateRoute } from './admin-dictionary-editorial-routes';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresDictionaryEditorialStore } from './postgres-dictionary-editorial-store';

type Environment = Record<string, string | undefined>;
type Client = { query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>; release(): void };
type DatabasePool = { query(sql: string, parameters?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>; connect(): Promise<Client> }; 
export function createAdminDictionaryEditorialServer(deps: { environment: Environment; createPool(config: AdminDatabaseConfig): DatabasePool; now?: () => Date }) {
  const config = readAdminDictionaryEditorialConfig(deps.environment);
  if (!config.enabled) return { enabled: false as const };
  try {
    const pool = deps.createPool(readAdminDatabaseConfig(deps.environment));
    const shared = { enabled: true, config, sessionStore: new PostgresOwnerAuthStore(pool), store: new PostgresDictionaryEditorialStore(pool), now: deps.now };
    return { enabled: true as const, list: createDictionaryEditorialListRoute(shared), create: createDictionaryEditorialCreateRoute(shared), update: createDictionaryEditorialUpdateRoute(shared) };
  } catch { return { enabled: false as const }; }
}
export function getAdminDictionaryEditorialServer() {
  return createAdminDictionaryEditorialServer({ environment: process.env, createPool: (config) => getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)) });
}
