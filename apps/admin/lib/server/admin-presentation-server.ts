import { Pool } from 'pg';

import { readAdminAuthConfig } from './admin-auth-policy';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import {
  createPresentationSlideImageRoute,
  createPresentationSlideReorderRoute,
  createPresentationSlideUpsertRoute,
  createPresentationSlidesRoute,
} from './admin-presentation-routes';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresPresentationSlidesStore } from './postgres-presentation-slides-store';

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

/**
 * The Presentation management surface (M4.2): the Slider Manager behind one default-off flag.
 *
 * Fails closed exactly like the other Admin servers — no flag, no Admin auth configuration or no
 * database configuration means the routes report 404 and nothing is reachable.
 */
export function createAdminPresentationServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  now?: () => Date;
}) {
  if (dependencies.environment.LEARNBOX_ADMIN_PRESENTATION_ENABLED !== 'true') {
    return { enabled: false as const };
  }

  try {
    const config = readAdminAuthConfig(dependencies.environment);
    if (!config.enabled) return { enabled: false as const };
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const shared = {
      enabled: true,
      config,
      now: dependencies.now,
      sessionStore: new PostgresOwnerAuthStore(pool),
      store: new PostgresPresentationSlidesStore(pool),
    };
    return {
      enabled: true as const,
      slides: createPresentationSlidesRoute(shared),
      upsertSlide: createPresentationSlideUpsertRoute(shared),
      reorderSlides: createPresentationSlideReorderRoute(shared),
      slideImage: createPresentationSlideImageRoute(shared),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminPresentationServer() {
  return createAdminPresentationServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)),
  });
}
