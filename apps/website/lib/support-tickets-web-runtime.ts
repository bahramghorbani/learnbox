import { Pool } from 'pg';

import { requireVerifiedDatabaseTls } from '../../api/dist/database/migration-runner.js';

import {
  createLearnerSupportTicket,
  listLearnerSupportTickets,
  type LearnerSupportTicket,
} from './support-tickets-store';

type Environment = Record<string, string | undefined>;
type SupportTicketsGlobal = typeof globalThis & {
  learnboxWebSupportTicketsPool?: { databaseUrl: string; pool: Pool };
};

export type LearnerSupportTicketsDependencies = {
  createTicket(input: {
    userId: string;
    requestId: string;
    subject: string;
    message: string;
  }): Promise<LearnerSupportTicket>;
  listTickets(userId: string): Promise<LearnerSupportTicket[]>;
};

export function learnerSupportTicketsDependenciesFromEnvironment(
  environment: Environment = process.env,
): LearnerSupportTicketsDependencies | null {
  if (environment.WEB_LEARNER_SUPPORT_TICKETS_ENABLED !== 'true') return null;
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return null;
  const pool = supportTicketsPool(databaseUrl);
  return {
    createTicket: (input) => createLearnerSupportTicket(pool, input),
    listTickets: (userId) => listLearnerSupportTickets(pool, userId),
  };
}

function supportTicketsPool(databaseUrl: string): Pool {
  const shared = globalThis as SupportTicketsGlobal;
  if (shared.learnboxWebSupportTicketsPool?.databaseUrl === databaseUrl) {
    return shared.learnboxWebSupportTicketsPool.pool;
  }
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(databaseUrl),
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxWebSupportTicketsPool = { databaseUrl, pool };
  return pool;
}
