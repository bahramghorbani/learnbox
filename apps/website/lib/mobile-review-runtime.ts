import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

import { MobileSessionContract } from '../../api/dist/auth/mobile-session.js';
import { PostgresReviewEventStore } from '../../api/dist/reviews/postgres-review-event.store.js';
import { MobileReviewBatchService } from '../../api/dist/reviews/mobile-review-batch.service.js';
import {
  createSchedulerV2Preflight,
  isSchedulerV2Enabled,
} from '../../api/dist/reviews/scheduler-v2-preflight.js';
import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import type {
  MobileReviewHttpDependencies,
  MobileReviewReconciliationDependencies,
  AccessVerification,
} from './mobile-review-http';

export type MobileReviewRuntimeConfig = {
  databaseUrl: string;
  sessionSecret: string;
};

type Environment = Record<string, string | undefined>;
type ReviewGlobal = typeof globalThis & {
  learnboxMobileReviewPool?: { databaseUrl: string; pool: Pool };
};

export function readMobileReviewRuntimeConfig(
  environment: Environment = process.env,
): MobileReviewRuntimeConfig | null {
  if (environment.MOBILE_REVIEW_SYNC_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  const sessionSecret = environment.LEARNBOX_MOBILE_SESSION_SECRET ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl) || sessionSecret.length < 32) return null;
  return { databaseUrl, sessionSecret };
}

export function mobileReviewHttpDependenciesFromEnvironment(
  environment: Environment = process.env,
): MobileReviewHttpDependencies | null {
  const config = readMobileReviewRuntimeConfig(environment);
  if (!config) return null;
  const session = new MobileSessionContract({
    audience: 'learnbox-mobile',
    clock: { now: () => new Date() },
    key: config.sessionSecret,
    random: { bytes: randomBytes },
  });
  const pool = reviewPool(config.databaseUrl);
  // LB-B35 CP7 (default off): scheduler V2 fails closed unless the 0023 schema is present.
  const schedulerV2 = isSchedulerV2Enabled(environment);
  const service = new MobileReviewBatchService(
    new PostgresReviewEventStore(pool),
    undefined,
    schedulerV2 ? { schedulerV2, schedulerV2Preflight: createSchedulerV2Preflight(pool) } : {},
  );
  return {
    verifyAccessToken(token: string): AccessVerification {
      const result = session.verifyAccessToken(token);
      return result.status === 'valid'
        ? { status: 'valid', claims: { sub: result.claims.sub } }
        : { status: 'invalid' };
    },
    submit: (input) => service.submit(input),
  };
}

export function mobileReviewReconciliationDependenciesFromEnvironment(
  environment: Environment = process.env,
): MobileReviewReconciliationDependencies | null {
  const config = readMobileReviewRuntimeConfig(environment);
  if (!config) return null;
  const session = new MobileSessionContract({
    audience: 'learnbox-mobile',
    clock: { now: () => new Date() },
    key: config.sessionSecret,
    random: { bytes: randomBytes },
  });
  const store = new PostgresReviewEventStore(reviewPool(config.databaseUrl));
  return {
    verifyAccessToken(token: string): AccessVerification {
      const result = session.verifyAccessToken(token);
      return result.status === 'valid'
        ? { status: 'valid', claims: { sub: result.claims.sub } }
        : { status: 'invalid' };
    },
    readReconciliation: (input) => store.readReconciliation(input.userId, input.after),
  };
}

function reviewPool(databaseUrl: string): Pool {
  const shared = globalThis as ReviewGlobal;
  if (shared.learnboxMobileReviewPool?.databaseUrl === databaseUrl)
    return shared.learnboxMobileReviewPool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxMobileReviewPool = { databaseUrl, pool };
  return pool;
}
