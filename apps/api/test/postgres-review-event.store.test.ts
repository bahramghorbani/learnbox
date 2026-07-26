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
    expect(result.schedule).toMatchObject({ state: 'relearning', lapses: 1, difficulty: 5.5 });
    expect(transactionCalls.map(({ sql }) => sql.split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'UPDATE',
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
