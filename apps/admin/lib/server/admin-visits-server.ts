import { Pool } from 'pg';

import { readAdminAuthConfig } from './admin-auth-policy';
import { createAdminVisitsOverviewRoute } from './admin-visits-routes';
import { AdminVisitsStore, type VisitsSiteConfig } from './admin-visits-store';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { StatsFaClient } from './statsfa-client';

type Environment = Record<string, string | undefined>;

/**
 * Own default-off gate, same reasoning as the Dashboard's: viewing traffic aggregates needs no
 * content-authoring access, so it must not share the content flag. It still requires the Passkey
 * auth runtime and the canonical role check, because an operator's permission to view the number
 * is resolved from `admin_role_assignments`, never from the request.
 *
 * Reads the StatsFA credential and the two tracked website ids from the environment. The website
 * ids (`7132` landing, `7133` app) are not secrets — StatsFA assigns them per site, visible in any
 * of its own dashboard URLs — only `STATSFA_API_KEY` is treated as one.
 */
function readSites(environment: Environment): VisitsSiteConfig[] {
  const landing = environment.STATSFA_WEBSITE_ID_LANDING ?? '7132';
  const app = environment.STATSFA_WEBSITE_ID_APP ?? '7133';
  return [
    { id: landing, domain: 'learnboxapp.com', label: 'لندینگ' },
    { id: app, domain: 'app.learnboxapp.com', label: 'اپ' },
  ];
}

export function createAdminVisitsServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): Pool;
  now?: () => Date;
}) {
  const { environment } = dependencies;
  if (environment.LEARNBOX_ADMIN_VISITS_ENABLED !== 'true') return { enabled: false as const };
  const apiKey = environment.STATSFA_API_KEY;
  if (!apiKey) return { enabled: false as const };
  const config = readAdminAuthConfig(environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(environment));
    return {
      enabled: true as const,
      overview: createAdminVisitsOverviewRoute({
        enabled: true,
        config,
        sessionStore: new PostgresOwnerAuthStore(pool),
        store: new AdminVisitsStore(pool, new StatsFaClient(apiKey), readSites(environment)),
        now: dependencies.now,
      }),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminVisitsServer() {
  return createAdminVisitsServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)) as Pool,
  });
}
