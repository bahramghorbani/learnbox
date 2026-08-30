import { Pool } from 'pg';

import { LearnerStateService } from '../../api/dist/learner-state/learner-state.service.js';
import { PostgresLearnerStateRepository } from '../../api/dist/learner-state/postgres-learner-state.repository.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type { WebLearnerStateDependencies } from './learner-state-web-http';

export type WebLearnerStateRuntimeConfig = {
  databaseUrl: string;
  sessionSecret: string;
};

type Environment = Record<string, string | undefined>;
type StateGlobal = typeof globalThis & {
  learnboxWebLearnerStatePool?: { databaseUrl: string; pool: Pool };
};

export function readWebLearnerStateRuntimeConfig(
  environment: Environment = process.env,
): WebLearnerStateRuntimeConfig | null {
  if (environment.WEB_LEARNER_STATE_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const sessionSecret = environment.LEARNBOX_SESSION_SECRET ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl) || sessionSecret.length < 32) return null;
  return { databaseUrl, sessionSecret };
}

export function webLearnerStateDependenciesFromEnvironment(
  environment: Environment = process.env,
): WebLearnerStateDependencies | null {
  const config = readWebLearnerStateRuntimeConfig(environment);
  if (!config) return null;
  const service = new LearnerStateService(
    new PostgresLearnerStateRepository(statePool(config.databaseUrl)),
  );
  return {
    readLearnerState: (userId) => service.readLearnerState(userId),
  };
}

function statePool(databaseUrl: string): Pool {
  const shared = globalThis as StateGlobal;
  if (shared.learnboxWebLearnerStatePool?.databaseUrl === databaseUrl)
    return shared.learnboxWebLearnerStatePool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxWebLearnerStatePool = { databaseUrl, pool };
  return pool;
}
