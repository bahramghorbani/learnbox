import { describe, expect, it } from 'vitest';
import { scheduleReview, type CardSchedule } from '../src/index.js';

const initial: CardSchedule = {
  state: 'learning',
  stabilityDays: 1,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date(0),
};
describe('scheduleReview', () => {
  it('moves a forgotten card to relearning and increments lapses', () => {
    const next = scheduleReview(initial, 'forgot', new Date(0));
    expect(next).toMatchObject({ state: 'relearning', lapses: 1 });
    expect(next.dueAt.getTime()).toBeGreaterThan(0);
  });
  it('makes mastered cards due later than remembered cards', () => {
    const now = new Date(0);
    expect(scheduleReview(initial, 'mastered', now).dueAt.getTime()).toBeGreaterThan(
      scheduleReview(initial, 'remembered', now).dueAt.getTime(),
    );
  });
});
