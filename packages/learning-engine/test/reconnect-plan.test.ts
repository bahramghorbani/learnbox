import { describe, expect, it } from 'vitest';

import {
  createRecoveryPlan,
  createDailySessionPlan,
  type DailySessionInput,
  type RecoveryCandidate,
} from '../src/index.js';

const now = new Date('2026-07-26T12:00:00Z');

const candidate = (overrides: Partial<RecoveryCandidate>): RecoveryCandidate => ({
  cardId: 'card-1',
  state: 'review',
  dueAt: new Date('2026-07-25T12:00:00Z'),
  stabilityDays: 2,
  lapses: 0,
  importance: 1,
  ...overrides,
});

describe('reconnect state plan (contract M1-D 12.3)', () => {
  it('excludes pending events already acknowledged on the server', () => {
    const recovery = createRecoveryPlan(
      [candidate({ cardId: 'review-a', importance: 4 }), candidate({ cardId: 'review-b' })],
      5,
      now,
    );
    const input: DailySessionInput = {
      durationMinutes: 5,
      now,
      dueCards: recovery.cardIds.map((cardId) => candidate({ cardId })),
      newCards: [],
      suggestedNewCards: 0,
    };

    const plan = createDailySessionPlan(input);

    expect(plan.mode).toBe('normal');
    expect(plan.reviewCardIds).toEqual(recovery.cardIds);
    expect(plan.newCardIds).toEqual([]);
  });

  it('the server plan never contains suspended or archived cards', () => {
    const input: DailySessionInput = {
      durationMinutes: 5,
      now,
      dueCards: [
        candidate({ cardId: 'suspended', state: 'suspended' }),
        candidate({ cardId: 'archived', state: 'archived' }),
        candidate({ cardId: 'future', dueAt: new Date('2026-07-27T12:00:00Z') }),
        candidate({ cardId: 'due' }),
      ],
      newCards: [],
      suggestedNewCards: 0,
    };

    const plan = createDailySessionPlan(input);

    expect(plan.reviewCardIds).toEqual(['due']);
  });
});
