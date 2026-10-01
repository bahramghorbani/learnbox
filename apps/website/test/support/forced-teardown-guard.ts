import type { Pool, PoolClient } from 'pg';

/**
 * Scratch-database teardown helper for real-Postgres tests.
 *
 * `DROP DATABASE … WITH (FORCE)` terminates every backend still connected to the scratch DB.
 * pg then emits that FATAL (SQLSTATE 57P01, "terminating connection due to administrator
 * command") as an `error` event on the idle pooled client; with no listener it becomes an
 * uncaught exception and vitest fails the whole run even though every assertion passed.
 *
 * This guard swallows exactly that one expected error, and only after `beginTeardown()` was
 * called. Any other error — a different SQLSTATE, or a 57P01 while the suite is still running —
 * is re-thrown, so it surfaces exactly as it would without a guard.
 */
export const ADMIN_SHUTDOWN_SQLSTATE = '57P01';

export function isExpectedForcedTeardownError(err: unknown, tearingDown: boolean): boolean {
  return (
    tearingDown &&
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === ADMIN_SHUTDOWN_SQLSTATE
  );
}

export function guardForcedTeardown(pool: Pool): { beginTeardown: () => void } {
  let tearingDown = false;
  const onError = (err: Error): void => {
    if (isExpectedForcedTeardownError(err, tearingDown)) return;
    throw err;
  };
  pool.on('error', onError);
  pool.on('connect', (client: PoolClient) => {
    client.on('error', onError);
  });
  return {
    beginTeardown: () => {
      tearingDown = true;
    },
  };
}
