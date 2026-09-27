import { describe, expect, it } from 'vitest';
import { createDailySessionPlan, type DailySessionInput } from '../src/index.js';

const now = new Date('2026-07-26T12:00:00Z');
const dueCard = (cardId: string) => ({
  cardId,
  state: 'review' as const,
  dueAt: new Date('2026-07-25T12:00:00Z'),
  stabilityDays: 2,
  lapses: 0,
  importance: 1,
});

const input = (overrides: Partial<DailySessionInput> = {}): DailySessionInput => ({
  durationMinutes: 5,
  now,
  dueCards: [dueCard('review-1')],
  newCards: [
    { cardId: 'new-low', importance: 1 },
    { cardId: 'new-high', importance: 2 },
  ],
  suggestedNewCards: 2,
  ...overrides,
});

describe('createDailySessionPlan', () => {
  it('prioritizes due cards and adds new cards only from spare capacity', () => {
    const plan = createDailySessionPlan(input());
    expect(plan).toMatchObject({ mode: 'normal', reviewCardIds: ['review-1'] });
    expect(plan.newCardIds).toEqual(['new-high', 'new-low']);
  });

  it('switches to recovery mode for a backlog larger than the selected session', () => {
    const dueCards = Array.from({ length: 13 }, (_, index) => dueCard(`review-${index}`));
    const plan = createDailySessionPlan(input({ dueCards }));
    expect(plan).toMatchObject({ mode: 'recovery', newCardIds: [] });
    expect(plan.reviewCardIds).toHaveLength(12);
  });

  it('does not use future or suspended cards as review work', () => {
    const plan = createDailySessionPlan(
      input({
        dueCards: [
          { ...dueCard('future'), dueAt: new Date('2026-07-27T12:00:00Z') },
          { ...dueCard('suspended'), state: 'suspended' },
        ],
      }),
    );
    expect(plan.reviewCardIds).toEqual([]);
  });

  it('does not repeat review work or introduce an already-due card as new', () => {
    const plan = createDailySessionPlan(
      input({
        dueCards: [dueCard('review-1'), { ...dueCard('review-1'), dueAt: new Date('2026-07-24') }],
        newCards: [
          { cardId: 'review-1', importance: 100 },
          { cardId: 'new-high', importance: 3 },
          { cardId: 'new-high', importance: 2 },
          { cardId: 'new-low', importance: 1 },
        ],
      }),
    );

    expect(plan.reviewCardIds).toEqual(['review-1']);
    expect(plan.newCardIds).toEqual(['new-high', 'new-low']);
  });
});
