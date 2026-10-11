import { Pool } from 'pg';

import { readAdminDashboardConfig } from './admin-content-packs-config';
import { createAdminDashboardOverviewRoute } from './admin-dashboard-routes';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresAdminDashboardStore } from './postgres-admin-dashboard-store';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';

/**
 * Admin Dashboard factory (Stage 2).
 *
 * Its own factory and its own gate, for the same reason support has one: an overview of learner
 * and content counts is not a content-authoring capability, and neither flag should imply the
 * other. It shares the canonical database pool and the Passkey session store with every other
 * Admin surface, so there is no second connection budget and no second notion of who the actor is.
 */
export function createAdminDashboardServer(dependencies: {
  environment: Record<string, string | undefined>;
  createPool(config: AdminDatabaseConfig): Pool;
  now?: () => Date;
}) {
  const config = readAdminDashboardConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    return {
      enabled: true as const,
      overview: createAdminDashboardOverviewRoute({
        enabled: true,
        config,
        sessionStore: new PostgresOwnerAuthStore(pool),
        store: new PostgresAdminDashboardStore(pool),
        now: dependencies.now,
        environment: dependencies.environment,
      }),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminDashboardServer() {
  return createAdminDashboardServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)) as Pool,
  });
}
