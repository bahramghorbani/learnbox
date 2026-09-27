import { Pool } from 'pg';

import { LearnerProfileService } from '../../api/dist/profile/learner-profile.service.js';
import { PostgresLearnerProfileRepository } from '../../api/dist/profile/postgres-learner-profile.repository.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type { WebLearnerProfileDependencies } from './learner-profile-web-http';

type Environment = Record<string, string | undefined>;
type Config = { databaseUrl: string; sessionSecret: string };
type ProfileGlobal = typeof globalThis & {
  learnboxWebLearnerProfilePool?: { databaseUrl: string; pool: Pool };
};

export function readWebLearnerProfileRuntimeConfig(
  environment: Environment = process.env,
): Config | null {
  if (environment.WEB_LEARNER_PROFILE_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const sessionSecret = environment.LEARNBOX_SESSION_SECRET ?? '';
  return /^postgres(ql)?:\/\//.test(databaseUrl) && sessionSecret.length >= 32
    ? { databaseUrl, sessionSecret }
    : null;
}

export function webLearnerProfileDependenciesFromEnvironment(
  environment: Environment = process.env,
): WebLearnerProfileDependencies | null {
  const config = readWebLearnerProfileRuntimeConfig(environment);
  if (!config) return null;
  const service = new LearnerProfileService(
    new PostgresLearnerProfileRepository(profilePool(config.databaseUrl)),
  );
  return { readLearnerProfile: (userId) => service.readLearnerProfile(userId) };
}

function profilePool(databaseUrl: string): Pool {
  const shared = globalThis as ProfileGlobal;
  if (shared.learnboxWebLearnerProfilePool?.databaseUrl === databaseUrl)
    return shared.learnboxWebLearnerProfilePool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxWebLearnerProfilePool = { databaseUrl, pool };
  return pool;
}
