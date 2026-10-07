import { Pool } from 'pg';

import { readAdminSupportConfig } from './admin-content-packs-config';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import {
  createAdminUserPackEntitlementRoute,
  createAdminUserPacksRoute,
  createAdminUserStatusRoute,
  createAdminUsersRoute,
} from './admin-users-routes';
import { PostgresAdminUsersStore } from './postgres-admin-users-store';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';

/**
 * Admin support surface factory (Phase 3 / M3.1).
 *
 * Separate from the Content & Packs server because account support is not a content capability:
 * suspending an abusive account must not require the content workspace to be enabled, and enabling
 * the content workspace must not hand out account control. Both factories share the same canonical
 * database pool, the same Passkey session store and the same audit trail — only the gate differs.
 */
export function createAdminSupportServer(dependencies: {
  environment: Record<string, string | undefined>;
  createPool(config: AdminDatabaseConfig): Pool;
  now?: () => Date;
}) {
  const config = readAdminSupportConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const shared = {
      enabled: true,
      config,
      sessionStore: new PostgresOwnerAuthStore(pool),
      store: new PostgresAdminUsersStore(pool),
      now: dependencies.now,
    };
    return {
      enabled: true as const,
      users: createAdminUsersRoute(shared),
      setUserStatus: createAdminUserStatusRoute(shared),
      userPacks: createAdminUserPacksRoute(shared),
      setPackEntitlement: createAdminUserPackEntitlementRoute(shared),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminSupportServer() {
  return createAdminSupportServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)) as Pool,
  });
}
