import { DAILY_NEW_CARD_ALLOWANCE, SESSION_CAPACITY_CARDS } from '@learnbox/learning-engine';
import { describe, expect, it } from 'vitest';

import { LearnerStateService } from '../src/learner-state/learner-state.service.js';
import type {
  DailyPlanStore,
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

/** In-memory DailyPlanStore with the same contract as the Postgres one (insert-if-absent, then read). */
function planStore(
  w: ReturnType<typeof world>,
  options: { zone?: string | null } = {},
): DailyPlanStore & { frozen: Map<string, string[]>; zone: string | null; inserts: number } {
  const frozen = new Map<string, string[]>();
  const store = {
    frozen,
    zone: options.zone ?? null,
    inserts: 0,
    async readStoredTimeZone() {
      return store.zone;
    },
    async persistTimeZone(_user: string, zone: string) {
      if (store.zone === null) store.zone = zone;
    },
    async readAllowance(_user: string, day: string) {
      return frozen.get(day) ?? null;
    },
    async freezeAllowance(_user: string, day: string, _zone: string, ids: string[]) {
      if (!frozen.has(day)) {
        frozen.set(day, ids);
        store.inserts += 1;
      }
      return frozen.get(day)!;
    },
    async findNewCardsByIds(_user: string, ids: string[]) {
      return ids
        .filter((id) => !w.schedules.has(id))
        .map((id) => ({ cardId: id, contentId: `start-a1-${id.slice(-4)}`, importance: 1 }));
    },
  };
  return store;
}
const readPlanned = (
  w: ReturnType<typeof world>,
  store: DailyPlanStore,
  now = NOW,
  tz: string | null = 'UTC',
) =>
  new LearnerStateService(w.repository, () => now, store).readLearnerState('user', {
    requestedTimeZone: tz,
  });

describe("CP4 — the invariant: the server owns the day's new-card allowance", () => {
  it('constants: session capacity stays 12 TOTAL and the allowance is 3 new cards per day', () => {
    expect(SESSION_CAPACITY_CARDS).toBe(12);
    expect(DAILY_NEW_CARD_ALLOWANCE).toBe(3);
  });

  it('repeated sessions on one learner-local day never grant more than 3 new cards', async () => {
    const w = world(0);
    const store = planStore(w);
    const granted = new Set<string>();
    for (let session = 0; session < 6; session += 1) {
      const { plan, newCards } = await readPlanned(w, store);
      for (const id of plan.newCardIds) granted.add(id);
      expect(plan.newCardIds.length).toBeLessThanOrEqual(3);
      expect(newCards.map((c) => c.cardId)).toEqual(plan.newCardIds);
      for (const id of plan.newCardIds) w.answer(id, NOW);
    }
    expect(granted.size).toBe(3); // was 15 without the allowance
    expect(store.inserts).toBe(1);
  });

  it('a refresh, or a second device, receives the SAME allowance', async () => {
    const w = world(0);
    const store = planStore(w);
    const a = (await readPlanned(w, store)).plan.newCardIds;
    const b = (await readPlanned(w, store)).plan.newCardIds;
    expect(b).toEqual(a);
    expect(a).toHaveLength(3);
  });

  it('answered new cards leave the offer but are NOT replaced by fresh ones the same day', async () => {
    const w = world(0);
    const store = planStore(w);
    const first = (await readPlanned(w, store)).plan.newCardIds;
    w.answer(first[0], NOW);
    const later = (await readPlanned(w, store, new Date(NOW.getTime() + 60_000))).plan.newCardIds;
    expect(later).toEqual(first.slice(1));
  });

  it('the next learner-local day grants a fresh allowance of 3', async () => {
    const w = world(0);
    const store = planStore(w);
    const day1 = (await readPlanned(w, store)).plan.newCardIds;
    for (const id of day1) w.answer(id, NOW);
    const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000);
    const day2 = (await readPlanned(w, store, tomorrow)).plan.newCardIds;
    expect(day2).toHaveLength(3);
    expect(day2.some((id) => day1.includes(id))).toBe(false);
  });

  it("the day boundary is the learner's: Tehran midnight is 20:30Z, not 00:00Z", async () => {
    const w = world(0);
    const store = planStore(w, { zone: 'Asia/Tehran' });
    const beforeMidnight = new Date('2026-09-29T20:29:59Z');
    const afterMidnight = new Date('2026-09-29T20:30:00Z');
    const a = (await readPlanned(w, store, beforeMidnight, 'UTC')).plan.newCardIds;
    for (const id of a) w.answer(id, beforeMidnight);
    const same = (await readPlanned(w, store, beforeMidnight, 'UTC')).plan.newCardIds;
    const next = (await readPlanned(w, store, afterMidnight, 'UTC')).plan.newCardIds;
    expect(same).toEqual([]);
    expect(next).toHaveLength(3);
    expect([...store.frozen.keys()]).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('due work is predictable: a due card is never hidden by the allowance, capacity stays 12 total', async () => {
    for (const due of [0, 5, 10, 11, 12]) {
      const w = world(due);
      const { plan } = await readPlanned(w, planStore(w));
      expect(plan.mode).toBe('normal');
      expect(plan.reviewCardIds).toHaveLength(due);
      expect(plan.reviewCardIds.length + plan.newCardIds.length).toBeLessThanOrEqual(12);
    }
  });

  it("recovery mode (>12 due) offers no new cards and does NOT spend the day's allowance", async () => {
    const w = world(13);
    const store = planStore(w);
    const recovery = await readPlanned(w, store);
    expect(recovery.plan.mode).toBe('recovery');
    expect(recovery.plan.newCardIds).toEqual([]);
    expect(store.inserts).toBe(0);
    // Backlog cleared later the same day: the learner still has today\'s allowance.
    for (let i = 0; i < 13; i += 1) w.schedules.delete(cardId(i));
    expect((await readPlanned(w, store)).plan.newCardIds).toHaveLength(3);
  });

  it('a nearly full session shrinks the allowance it can show, never the freeze (3 stay reserved)', async () => {
    const w = world(11); // 1 spare slot
    const store = planStore(w);
    const { plan } = await readPlanned(w, store);
    expect(plan.newCardIds).toHaveLength(1);
    expect(plan.reviewCardIds.length + plan.newCardIds.length).toBe(12);
    expect(store.frozen.get('2026-10-01')).toHaveLength(3);
  });

  it('with no flag/store the service behaves exactly as before (v1.2.1)', async () => {
    const w = world(0);
    const service = new LearnerStateService(w.repository, () => NOW);
    const first = (await service.readLearnerState('user')).plan.newCardIds;
    for (const id of first) w.answer(id, NOW);
    expect((await service.readLearnerState('user')).plan.newCardIds).toHaveLength(3);
  });

  it('an empty catalogue freezes nothing', async () => {
    const w = world(0, 0);
    const store = planStore(w);
    expect((await readPlanned(w, store)).plan.newCardIds).toEqual([]);
    expect(store.inserts).toBe(0);
  });

  it('stored zone wins over the device zone; a NULL stored zone is filled once', async () => {
    const w = world(0);
    const store = planStore(w, { zone: null });
    await readPlanned(w, store, NOW, 'Asia/Tehran');
    expect(store.zone).toBe('Asia/Tehran');
    await readPlanned(w, store, NOW, 'Europe/Berlin');
    expect(store.zone).toBe('Asia/Tehran');
  });
});
