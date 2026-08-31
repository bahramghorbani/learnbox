import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresLearnerStateRepository } from '../src/learner-state/postgres-learner-state.repository.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';

describe('PostgresLearnerStateRepository.readReconciliationCursor', () => {
  it('reads the per-learner cursor as a decimal string through a parameterized query', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ cursor: '7' }] };
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    const cursor = await repository.readReconciliationCursor(userId);

    expect(cursor).toBe('7');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/learner_reconciliation_cursors/);
    expect(calls[0]?.sql).toContain('$1');
    expect(calls[0]?.params).toEqual([userId]);
  });

  it('returns the decimal string 0 when no cursor row exists', async () => {
    const pool = {
      query: async () => ({ rows: [] }),
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    expect(await repository.readReconciliationCursor(userId)).toBe('0');
  });
});
