import { describe, expect, it } from 'vitest';

import {
  recordReviewEvent,
  type CardSchedule,
  type ReviewEventStore,
  type ReviewEventWriteResult,
} from '../src/index.js';

const schedule: CardSchedule = {
  state: 'learning',
  stabilityDays: 1,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date('2026-07-20T12:00:00Z'),
};

describe('recordReviewEvent', () => {
  it('does not reschedule a review event that was already accepted', async () => {
    const existing: ReviewEventWriteResult = {
      event: {
        id: 'event-1',
        userId: 'user-1',
        cardId: 'card-1',
        grade: 'remembered',
        occurredAt: new Date('2026-07-26T12:00:00Z'),
        clientEventId: 'client-1',
      },
      schedule,
      idempotent: false,
      reconciliationCursor: '4',
    };
    const store: ReviewEventStore = {
      findByClientEventId: async () => existing,
      writeAtomically: async () => {
        throw new Error('duplicate review should not be written');
      },
    };

    const result = await recordReviewEvent(store, schedule, existing.event);
    expect(result.idempotent).toBe(true);
    expect(result.schedule).toBe(schedule);
  });

  it('calculates the next schedule before delegating one atomic write', async () => {
    let writeCount = 0;
    const store: ReviewEventStore = {
      findByClientEventId: async () => null,
      writeAtomically: async (input, nextSchedule) => {
        writeCount += 1;
        return { event: { id: 'event-2', ...input }, schedule: nextSchedule, idempotent: false };
      },
    };

    const result = await recordReviewEvent(store, schedule, {
      userId: 'user-1',
      cardId: 'card-1',
      grade: 'forgot',
      occurredAt: new Date('2026-07-26T12:00:00Z'),
      clientEventId: 'client-2',
    });

    expect(writeCount).toBe(1);
    expect(result.schedule.state).toBe('relearning');
    expect(result.schedule.lapses).toBe(1);
  });
});
