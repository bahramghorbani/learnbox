import { recordReviewEvent, type CardSchedule } from '@learnbox/learning-engine';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresReviewEventStore } from '../src/reviews/postgres-review-event.store.js';

const currentSchedule: CardSchedule = {
  state: 'learning',
  stabilityDays: 1,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date('2026-07-20T12:00:00Z'),
};

const input = {
  userId: '2efaf676-84e4-45b1-8a13-50735a8df2c8',
  cardId: '170b8a2a-7fa7-4e26-94ba-37e3a7fb65da',
  grade: 'forgot' as const,
  occurredAt: new Date('2026-07-26T12:00:00Z'),
  clientEventId: 'review-client-event-1',
};

describe('PostgresReviewEventStore', () => {
  it('persists one scheduled review through an ordered database transaction', async () => {
    const transactionCalls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        transactionCalls.push({ sql, params });
        if (sql.startsWith('INSERT INTO review_events')) {
          return {
            rows: [
              {
                id: 'persisted-event-1',
                user_id: input.userId,
                card_id: input.cardId,
                grade: input.grade,
                occurred_at: input.occurredAt,
                client_event_id: input.clientEventId,
              },
            ],
          };
        }
        if (sql.startsWith('UPDATE card_schedules')) {
          return {
            rows: [
              {
                state: 'relearning',
                stability_days: 10 / (24 * 60),
                difficulty: 5.5,
                lapses: 1,
                due_at: new Date('2026-07-26T12:10:00Z'),
              },
            ],
          };
        }
        if (sql.includes('advance_learner_reconciliation_cursor')) {
          return { rows: [{ cursor: 1 }] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => client,
    } as unknown as Pool;

    const result = await recordReviewEvent(
      new PostgresReviewEventStore(pool),
      currentSchedule,
      input,
    );

    expect(result.idempotent).toBe(false);
    expect(result.reconciliationCursor).toBe(1);
    expect(result.schedule).toMatchObject({ state: 'relearning', lapses: 1, difficulty: 5.5 });
    expect(transactionCalls.map(({ sql }) => sql.split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'UPDATE',
      'SELECT',
      'COMMIT',
    ]);
    expect(transactionCalls[2].params?.[7]).toEqual(input.occurredAt);
  });

  it('reads an existing client event before opening a second transaction', async () => {
    let connectCount = 0;
    const pool = {
      query: async () => ({
        rows: [
          {
            id: 'persisted-event-1',
            user_id: input.userId,
            card_id: input.cardId,
            grade: input.grade,
            occurred_at: input.occurredAt,
            client_event_id: input.clientEventId,
            state: 'review',
            stability_days: 2,
            difficulty: 4.9,
            lapses: 0,
            due_at: new Date('2026-07-28T12:00:00Z'),
          },
        ],
      }),
      connect: async () => {
        connectCount += 1;
        throw new Error('a duplicate event must not open a transaction');
      },
    } as unknown as Pool;

    const result = await recordReviewEvent(
      new PostgresReviewEventStore(pool),
      currentSchedule,
      input,
    );

    expect(result.idempotent).toBe(true);
    expect(result.schedule.state).toBe('review');
    expect(connectCount).toBe(0);
  });
});

import { ReviewIdempotencyConflictError } from '../src/reviews/postgres-review-event.store.js';

const conflictingRow = {
  id: 'persisted-event-1',
  user_id: input.userId,
  card_id: input.cardId,
  grade: 'hard' as 'forgot' | 'hard' | 'remembered' | 'mastered',
  occurred_at: input.occurredAt,
  client_event_id: input.clientEventId,
  state: 'review' as const,
  stability_days: 2,
  difficulty: 4.9,
  lapses: 0,
  due_at: new Date('2026-07-28T12:00:00Z'),
  cursor: 5,
};

const replayPool = (existingRow: typeof conflictingRow) => {
  let updateCalls = 0;
  let scopedLookupSql = '';
  const client = {
    query: async (sql: string) => {
      if (sql.startsWith('INSERT INTO review_events')) return { rows: [] };
      if (sql.startsWith('UPDATE card_schedules')) {
        updateCalls += 1;
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = {
    query: async (sql: string) => {
      if (sql.startsWith('SELECT e.id')) {
        scopedLookupSql = sql;
        return { rows: [existingRow] };
      }
      return { rows: [] };
    },
    connect: async () => client,
  } as unknown as Pool;
  return { pool, updateCalls: () => updateCalls, scopedLookupSql: () => scopedLookupSql };
};

describe('PostgresReviewEventStore learner-scoped idempotency', () => {
  it('rejects a same-learner replay whose payload differs without mutating the schedule', async () => {
    const { pool, updateCalls, scopedLookupSql } = replayPool(conflictingRow);

    const store = new PostgresReviewEventStore(pool);
    await expect(
      store.writeAtomically(input, { ...currentSchedule, state: 'relearning' }),
    ).rejects.toBeInstanceOf(ReviewIdempotencyConflictError);

    expect(updateCalls()).toBe(0);
    expect(scopedLookupSql()).toMatch(/WHERE e\.user_id = \$1 AND e\.client_event_id = \$2/);
  });

  it('acknowledges a same-learner replay with an exact payload match', async () => {
    const { pool, updateCalls } = replayPool({
      ...conflictingRow,
      grade: input.grade,
      occurred_at: input.occurredAt,
    });

    const store = new PostgresReviewEventStore(pool);
    const result = await store.writeAtomically(input, { ...currentSchedule, state: 'relearning' });

    expect(result.idempotent).toBe(true);
    expect(result.event.clientEventId).toBe(input.clientEventId);
    expect(updateCalls()).toBe(0);
  });

  it('claims the learner-scoped key, derives applied_at and advances the cursor in one transaction', async () => {
    const transactionCalls: string[] = [];
    let insertSql = '';
    let advanceSql = '';
    const client = {
      query: async (sql: string) => {
        transactionCalls.push(sql);
        if (sql.startsWith('INSERT INTO review_events')) {
          insertSql = sql;
          return {
            rows: [
              {
                id: 'persisted-event-1',
                user_id: input.userId,
                card_id: input.cardId,
                grade: input.grade,
                occurred_at: input.occurredAt,
                client_event_id: input.clientEventId,
              },
            ],
          };
        }
        if (sql.startsWith('UPDATE card_schedules')) {
          return {
            rows: [
              {
                state: 'relearning',
                stability_days: 10 / (24 * 60),
                difficulty: 5.5,
                lapses: 1,
                due_at: new Date('2026-07-26T12:10:00Z'),
              },
            ],
          };
        }
        if (sql.includes('advance_learner_reconciliation_cursor')) {
          advanceSql = sql;
          return { rows: [{ cursor: 3 }] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => client,
    } as unknown as Pool;

    const result = await new PostgresReviewEventStore(pool).writeAtomically(input, {
      ...currentSchedule,
      state: 'relearning',
    });

    expect(result.idempotent).toBe(false);
    expect(result.reconciliationCursor).toBe(3);
    expect(transactionCalls.map((sql) => sql.split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'UPDATE',
      'SELECT',
      'COMMIT',
    ]);
    expect(advanceSql).toMatch(/SELECT advance_learner_reconciliation_cursor\(\$1\) AS cursor/i);
    expect(insertSql).toMatch(/ON CONFLICT \(user_id, client_event_id\) DO NOTHING/i);
    expect(insertSql).toMatch(/applied_at/i);
    expect(insertSql).toMatch(/GREATEST/i);
    expect(insertSql).toMatch(/MAX\(applied_at\)/i);
    expect(insertSql).toMatch(/LEAST\(\$4, now\(\)\)/i);
  });

  it('returns the authoritative cursor on an exact idempotent replay without advancing', async () => {
    const { pool, updateCalls, scopedLookupSql } = replayPool({
      ...conflictingRow,
      grade: input.grade,
      occurred_at: input.occurredAt,
      cursor: 7,
    });

    const store = new PostgresReviewEventStore(pool);
    const result = await store.writeAtomically(input, { ...currentSchedule, state: 'relearning' });

    expect(result.idempotent).toBe(true);
    expect(result.reconciliationCursor).toBe(7);
    expect(updateCalls()).toBe(0);
    expect(scopedLookupSql()).toMatch(/FROM review_events e/);
    expect(scopedLookupSql()).toMatch(/learner_reconciliation_cursors/i);
  });

  it('never advances the cursor when the schedule update misses', async () => {
    const transactionCalls: string[] = [];
    const client = {
      query: async (sql: string) => {
        transactionCalls.push(sql);
        if (sql.startsWith('INSERT INTO review_events')) {
          return {
            rows: [
              {
                id: 'persisted-event-1',
                user_id: input.userId,
                card_id: input.cardId,
                grade: input.grade,
                occurred_at: input.occurredAt,
                client_event_id: input.clientEventId,
              },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      query: async () => ({ rows: [] }),
      connect: async () => client,
    } as unknown as Pool;

    const store = new PostgresReviewEventStore(pool);
    await expect(
      store.writeAtomically(input, { ...currentSchedule, state: 'relearning' }),
    ).rejects.toThrow('Card schedule must exist');
    expect(
      transactionCalls.some((sql) => sql.includes('advance_learner_reconciliation_cursor')),
    ).toBe(false);
    expect(transactionCalls).toContain('ROLLBACK');
  });

  it('never advances the cursor on an idempotency conflict', async () => {
    const { pool, updateCalls, scopedLookupSql } = replayPool(conflictingRow);

    const store = new PostgresReviewEventStore(pool);
    await expect(
      store.writeAtomically(input, { ...currentSchedule, state: 'relearning' }),
    ).rejects.toBeInstanceOf(ReviewIdempotencyConflictError);

    expect(updateCalls()).toBe(0);
    expect(scopedLookupSql()).not.toMatch(/advance_learner_reconciliation_cursor/i);
  });

  it('resolves canonical content ids, bootstraps schedules and reads learner schedules', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.startsWith('SELECT c.id')) {
          return params?.[0] === 'content-a' ? { rows: [{ id: input.cardId }] } : { rows: [] };
        }
        if (sql.startsWith('SELECT state')) {
          return {
            rows: [
              {
                state: 'review',
                stability_days: 2,
                difficulty: 4.9,
                lapses: 0,
                due_at: new Date('2026-07-28T12:00:00Z'),
              },
            ],
          };
        }
        return { rows: [] };
      },
      connect: async () => {
        throw new Error('lookup methods must not open transactions');
      },
    } as unknown as Pool;
    const store = new PostgresReviewEventStore(pool);

    await expect(store.resolveCardId('content-a')).resolves.toBe(input.cardId);
    await expect(store.resolveCardId('missing')).resolves.toBeNull();
    await store.bootstrapSchedules(input.userId);
    await expect(store.findSchedule(input.userId, input.cardId)).resolves.toMatchObject({
      state: 'review',
      stabilityDays: 2,
    });

    expect(queries[0].sql).toMatch(/FROM cards c\s+WHERE c\.content_id = \$1/i);
    expect(queries[0].params).toEqual(['content-a']);
    expect(queries[1].params).toEqual(['missing']);
    expect(queries[2].sql).toMatch(/bootstrap_approved_card_schedules\(\$1\)/);
    expect(queries[2].params).toEqual([input.userId]);
    expect(queries[3].sql).toMatch(/FROM card_schedules\s+WHERE user_id = \$1 AND card_id = \$2/);
  });
});
