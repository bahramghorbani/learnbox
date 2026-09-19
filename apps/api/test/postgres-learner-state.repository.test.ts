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

describe('PostgresLearnerStateRepository.findNewCardCandidates', () => {
  it('returns only bounded approved Start candidates unscheduled for this learner', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return {
          rows: [
            {
              card_id: '11111111-1111-4111-8111-111111111111',
              content_id: 'start-a1-haus',
            },
          ],
        };
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    const candidates = await repository.findNewCardCandidates(userId, 12);

    expect(candidates).toEqual([
      {
        cardId: '11111111-1111-4111-8111-111111111111',
        contentId: 'start-a1-haus',
        importance: 1,
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual([userId, 'start-a1-%', 12]);
    expect(calls[0]?.sql).toMatch(/cv\.status IN \('approved', 'published'\)/);
    expect(calls[0]?.sql).toMatch(
      /LEFT JOIN card_schedules s\s+ON s\.user_id = \$1 AND s\.card_id = c\.id/,
    );
    expect(calls[0]?.sql).toMatch(/s\.card_id IS NULL/);
    expect(calls[0]?.sql).toMatch(/c\.content_id LIKE \$2/);
    expect(calls[0]?.sql).toMatch(/LIMIT \$3/);
  });

  it('rejects an unbounded or invalid candidate limit before querying', async () => {
    const pool = {
      query: async () => {
        throw new Error('must not query');
      },
    } as unknown as Pool;
    const repository = new PostgresLearnerStateRepository(pool);

    await expect(repository.findNewCardCandidates(userId, 0)).rejects.toThrow('candidate limit');
    await expect(repository.findNewCardCandidates(userId, 13)).rejects.toThrow('candidate limit');
  });
});
