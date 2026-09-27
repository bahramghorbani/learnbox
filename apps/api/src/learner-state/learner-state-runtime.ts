import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

import { MobileSessionContract } from '../auth/mobile-session.js';
import { requireVerifiedDatabaseTls } from '../database/migration-runner.js';
import { PostgresLearnerStateRepository } from './postgres-learner-state.repository.js';
import { LearnerStateService } from './learner-state.service.js';

import type { LearnerStateHttpDependencies } from './learner-state-http.js';

export type LearnerStateRuntimeConfig = {
  databaseUrl: string;
  sessionSecret: string;
};

type Environment = Record<string, string | undefined>;
type StateGlobal = typeof globalThis & {
  learnboxLearnerStatePool?: { databaseUrl: string; pool: Pool };
};

export function readLearnerStateRuntimeConfig(
  environment: Environment = process.env,
): LearnerStateRuntimeConfig | null {
  if (environment.LEARNER_STATE_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const sessionSecret = environment.LEARNBOX_MOBILE_SESSION_SECRET ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl) || sessionSecret.length < 32) return null;
  return { databaseUrl, sessionSecret };
}

export function learnerStateHttpDependenciesFromEnvironment(
  environment: Environment = process.env,
): LearnerStateHttpDependencies | null {
  const config = readLearnerStateRuntimeConfig(environment);
  if (!config) return null;
  const session = new MobileSessionContract({
    audience: 'learnbox-mobile',
    clock: { now: () => new Date() },
    key: config.sessionSecret,
    random: { bytes: randomBytes },
  });
  const service = new LearnerStateService(
    new PostgresLearnerStateRepository(statePool(config.databaseUrl)),
  );
  return {
    verifyAccessToken(token: string) {
      const result = session.verifyAccessToken(token);
      return result.status === 'valid'
        ? { status: 'valid', claims: { sub: result.claims.sub } }
        : { status: 'invalid' };
    },
    readLearnerState: (userId) => service.readLearnerState(userId),
  };
}

function statePool(databaseUrl: string): Pool {
  const shared = globalThis as StateGlobal;
  if (shared.learnboxLearnerStatePool?.databaseUrl === databaseUrl)
    return shared.learnboxLearnerStatePool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxLearnerStatePool = { databaseUrl, pool };
  return pool;
}
