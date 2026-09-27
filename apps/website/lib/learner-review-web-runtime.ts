import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';
import { MobileReviewBatchService } from '../../api/dist/reviews/mobile-review-batch.service.js';
import { PostgresReviewEventStore } from '../../api/dist/reviews/postgres-review-event.store.js';

import type { WebReviewDependencies } from './learner-review-web-http';
import { readWebLearnerStateRuntimeConfig } from './learner-state-web-runtime';

type Environment = Record<string, string | undefined>;
type ReviewGlobal = typeof globalThis & {
  learnboxWebReviewPool?: { databaseUrl: string; pool: Pool };
};

/** Uses the existing default-off Web learner-state gate; never reads mobile credentials. */
export function webReviewDependenciesFromEnvironment(
  environment: Environment = process.env,
): WebReviewDependencies | null {
  const config = readWebLearnerStateRuntimeConfig(environment);
  if (!config) return null;
  const store = new PostgresReviewEventStore(reviewPool(config.databaseUrl));
  const service = new MobileReviewBatchService(store);
  return {
    submit: (input) => service.submit(input),
    readReconciliation: (input) => store.readReconciliation(input.userId, input.after),
  };
}

function reviewPool(databaseUrl: string): Pool {
  const shared = globalThis as ReviewGlobal;
  if (shared.learnboxWebReviewPool?.databaseUrl === databaseUrl)
    return shared.learnboxWebReviewPool.pool;
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxWebReviewPool = { databaseUrl, pool };
  return pool;
}
