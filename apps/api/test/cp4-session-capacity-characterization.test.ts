import { describe, expect, it } from 'vitest';

import { LearnerStateService } from '../src/learner-state/learner-state.service.js';
import type {
  LearnerNewCardCandidate,
  LearnerScheduleRow,
  LearnerStateRepository,
} from '../src/learner-state/learner-state.service.js';

/**
 * LB-B35 CP4 step 0 — freeze the EXISTING session-capacity semantics before any daily-plan logic.
 *
 * Owner instruction: the product has a 12-review session capacity. "12 due + 3 new" must NOT be
 * silently reinterpreted as a 15-card session. These tests pin what v1.2.1 actually does, so the
 * daily-plan work in CP4 can only add the missing invariant (a server-owned daily new-card cap)
 * without changing the 12-card capacity or the 3-new suggestion.
 *
 * Findings pinned here:
 *   1. Session capacity is 12 cards TOTAL (due reviews + new cards), for the 5-minute session.
 *   2. New cards are only the spare capacity, at most 3: new = min(3, 12 - due).
 *   3. More than 12 due => recovery mode: 12 reviews, 0 new.
 *   4. DEFECT (CP4 target): the 3-new limit is per plan READ, not per day. A new card stops being
 *      "new" the moment it has a schedule row, so finishing a session and reading the plan again
 *      grants 3 more, without bound.
 */
const NOW = new Date('2026-10-01T09:00:00Z');
const cardId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function dueSchedule(n: number): LearnerScheduleRow {
  return {
    cardId: cardId(n),
    contentId: `start-a1-due-${n}`,
    state: 'review',
    stabilityDays: 2,
    difficulty: 5,
    lapses: 0,
    dueAt: new Date('2026-09-30T09:00:00Z'),
  };
}

/** Stateful in-memory repository: answering a new card gives it a schedule row (as the real write path does). */
function world(dueCount: number, catalogSize = 35) {
  const schedules = new Map<string, LearnerScheduleRow>();
  for (let i = 0; i < dueCount; i += 1) schedules.set(cardId(i), dueSchedule(i));
  const catalog = Array.from({ length: catalogSize }, (_, i) => cardId(1000 + i));
  const repository: LearnerStateRepository = {
    async findSchedules() {
      return [...schedules.values()];
    },
    async findNewCardCandidates(_user, limit): Promise<LearnerNewCardCandidate[]> {
      return catalog
        .filter((id) => !schedules.has(id))
        .slice(0, limit)
        .map((id) => ({ cardId: id, contentId: `start-a1-${id.slice(-4)}`, importance: 1 }));
    },
    async countReviewEvents() {
      return 0;
    },
    async readReconciliationCursor() {
      return '0';
    },
  };
  const answer = (id: string, at: Date) =>
    schedules.set(id, {
      cardId: id,
      contentId: `start-a1-${id.slice(-4)}`,
      state: 'learning',
      stabilityDays: 0.04,
      difficulty: 5,
      lapses: 0,
      dueAt: new Date(at.getTime() + 3_600_000),
    });
  return { repository, schedules, answer };
}

const read = (repository: LearnerStateRepository, now = NOW) =>
  new LearnerStateService(repository, () => now).readLearnerState('user');

describe('CP4 step 0 — existing session capacity semantics (v1.2.1 behaviour, frozen)', () => {
  it('a learner with nothing due gets 3 new cards, not 12', async () => {
    const { plan } = await read(world(0).repository);
    expect(plan.mode).toBe('normal');
    expect(plan.reviewCardIds).toHaveLength(0);
    expect(plan.newCardIds).toHaveLength(3);
  });

  it('capacity is 12 TOTAL: new cards fill only the spare room, at most 3', async () => {
    const rows = [
      { due: 0, review: 0, fresh: 3 },
      { due: 5, review: 5, fresh: 3 },
      { due: 9, review: 9, fresh: 3 },
      { due: 10, review: 10, fresh: 2 },
      { due: 11, review: 11, fresh: 1 },
      { due: 12, review: 12, fresh: 0 },
    ];
    for (const row of rows) {
      const { plan } = await read(world(row.due).repository);
      expect(plan.mode).toBe('normal');
      expect(plan.reviewCardIds).toHaveLength(row.review);
      expect(plan.newCardIds).toHaveLength(row.fresh);
      // The session is NEVER 15 cards: 12 due + 3 new is not a thing.
      expect(plan.reviewCardIds.length + plan.newCardIds.length).toBeLessThanOrEqual(12);
    }
  });

  it('more than 12 due is recovery mode: 12 reviews and no new cards', async () => {
    const { plan } = await read(world(13).repository);
    expect(plan.mode).toBe('recovery');
    expect(plan.reviewCardIds).toHaveLength(12);
    expect(plan.newCardIds).toHaveLength(0);
  });

  it('DEFECT pin: the 3-new limit is per read — answering and re-reading grants 3 more, unbounded', async () => {
    const w = world(0);
    const granted: string[] = [];
    for (let session = 0; session < 5; session += 1) {
      const { plan } = await read(w.repository);
      expect(plan.newCardIds).toHaveLength(3);
      for (const id of plan.newCardIds) w.answer(id, NOW);
      granted.push(...plan.newCardIds);
    }
    // 5 sessions on one local day => 15 distinct new cards. CP4 caps this at 3 per learner-local day.
    expect(new Set(granted).size).toBe(15);
  });

  it('a plain refresh without answering is already stable: the same 3 new cards come back', async () => {
    const w = world(0);
    const a = (await read(w.repository)).plan.newCardIds;
    const b = (await read(w.repository)).plan.newCardIds;
    expect(b).toEqual(a);
  });
});
