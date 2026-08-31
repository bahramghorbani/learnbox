import { describe, expect, it } from 'vitest';

import { LearnerStateService } from '../src/learner-state/learner-state.service.js';
import type { LearnerStateRepository } from '../src/learner-state/learner-state.service.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';
const cardId = '170b8a2a-7fa7-4e26-94ba-37e3a7fb65da';
const fixedNow = new Date('2026-07-26T12:30:00Z');

const repository: LearnerStateRepository = {
  async findSchedules() {
    return [
      {
        cardId,
        state: 'review',
        stabilityDays: 2,
        difficulty: 4.9,
        lapses: 0,
        dueAt: new Date('2026-07-25T12:00:00Z'),
        contentId: 'content-a',
      },
      {
        cardId: 'f6d4db5a-0af5-4b4c-8f1e-2b9c8d3a1b7f',
        state: 'learning',
        stabilityDays: 0.5,
        difficulty: 5.1,
        lapses: 0,
        dueAt: new Date('2026-07-28T12:00:00Z'),
        contentId: 'content-b',
      },
    ];
  },
  async countReviewEvents() {
    return 3;
  },
  async readReconciliationCursor() {
    return '42';
  },
};

describe('LearnerStateService', () => {
  it('builds a bounded due-card plan from the server schedule projection', async () => {
    const service = new LearnerStateService(repository, () => fixedNow);
    const state = await service.readLearnerState(userId);

    expect(state.schedules).toHaveLength(2);
    expect(state.plan.reviewCardIds).toEqual([cardId]);
    expect(state.plan.newCardIds).toEqual([]);
    expect(state.plan.mode).toBe('normal');
    expect(state.reviewEventsCount).toBe(3);
    expect(state.reconciliationCursor).toBe('42');
  });

  it('exposes the authoritative per-learner reconciliation cursor as a decimal string', async () => {
    const cursorRepository: LearnerStateRepository = {
      ...repository,
      async readReconciliationCursor() {
        return '0';
      },
    };
    const service = new LearnerStateService(cursorRepository, () => fixedNow);
    const state = await service.readLearnerState(userId);

    expect(state.reconciliationCursor).toBe('0');
  });

  it('passes a fixed clock through to plan composition', async () => {
    const service = new LearnerStateService(repository, () => new Date('2026-07-29T12:00:00Z'));
    const state = await service.readLearnerState(userId);

    // both cards are due at this later time
    expect(state.plan.reviewCardIds).toEqual([cardId, 'f6d4db5a-0af5-4b4c-8f1e-2b9c8d3a1b7f']);
  });

  it('fails closed when the learner has no schedules', async () => {
    const empty: LearnerStateRepository = {
      async findSchedules() {
        return [];
      },
      async countReviewEvents() {
        return 0;
      },
      async readReconciliationCursor() {
        return '0';
      },
    };
    const service = new LearnerStateService(empty);
    const state = await service.readLearnerState(userId);

    expect(state.schedules).toEqual([]);
    expect(state.plan).toEqual({
      mode: 'normal',
      reviewCardIds: [],
      newCardIds: [],
      message: 'امروز یک قدم کوچک و پیوسته کافی است.',
    });
    expect(state.reviewEventsCount).toBe(0);
    expect(state.reconciliationCursor).toBe('0');
  });
});
