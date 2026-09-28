import { Pool } from 'pg';

import type { DependencyProbe } from './health';

/**
 * Builds the dependency probe set for `/api/health` (LB-B02).
 *
 * The probes reuse a module-scoped pool with a single connection so that repeated uptime polling
 * cannot exhaust database connections — an uptime check must never become the cause of an outage.
 */

type Environment = Record<string, string | undefined>;

type HealthGlobal = typeof globalThis & {
  learnboxHealthPool?: { databaseUrl: string; pool: Pool };
};

export function readHealthDependencies(environment: Environment = process.env): DependencyProbe[] {
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return [];

  return [
    {
      name: 'database',
      degradedAfterMs: 750,
      timeoutMs: 4000,
      probe: async () => {
        const pool = healthPool(databaseUrl);
        // `select 1` proves the connection is usable without reading any learner row.
        await pool.query('select 1');
      },
    },
  ];
}

function healthPool(databaseUrl: string): Pool {
  const shared = globalThis as HealthGlobal;
  if (shared.learnboxHealthPool?.databaseUrl === databaseUrl) return shared.learnboxHealthPool.pool;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000,
    allowExitOnIdle: true,
  });
  // A pool-level error must not crash the process; the probe reports `down` instead.
  pool.on('error', () => {});
  shared.learnboxHealthPool = { databaseUrl, pool };
  return pool;
}
