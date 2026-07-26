import { describe, expect, it } from 'vitest';
import { createRecoveryPlan, type RecoveryCandidate } from '../src/index.js';

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

describe('createRecoveryPlan', () => {
  it('prioritizes overdue, high-risk cards and does not introduce new cards', () => {
    const plan = createRecoveryPlan(
      [
        candidate({ cardId: 'low-risk' }),
        candidate({ cardId: 'high-risk', lapses: 3, importance: 2 }),
      ],
      5,
      now,
    );
    expect(plan.cardIds).toEqual(['high-risk', 'low-risk']);
    expect(plan.recommendedNewCards).toBe(0);
  });

  it('excludes future, archived, and suspended cards', () => {
    const plan = createRecoveryPlan(
      [
        candidate({ cardId: 'future', dueAt: new Date('2026-07-27T12:00:00Z') }),
        candidate({ cardId: 'archived', state: 'archived' }),
        candidate({ cardId: 'suspended', state: 'suspended' }),
      ],
      5,
      now,
    );
    expect(plan.cardIds).toEqual([]);
  });

  it('keeps the recovery session bounded by the selected duration', () => {
    const cards = Array.from({ length: 20 }, (_, index) => candidate({ cardId: `card-${index}` }));
    expect(createRecoveryPlan(cards, 5, now).cardIds).toHaveLength(12);
  });
});
