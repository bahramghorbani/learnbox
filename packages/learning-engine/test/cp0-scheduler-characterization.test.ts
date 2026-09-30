import { describe, expect, it } from 'vitest';

import {
  createDailySessionPlan,
  scheduleReview,
  type CardSchedule,
  type ReviewGrade,
} from '../src/index.js';

/**
 * LB-B35 CP0 — characterization of the v1.2.1 scheduler and session planner.
 *
 * These tests PIN CURRENT BEHAVIOR, including behavior the learning-system
 * milestone intends to change. They are not an endorsement: each block says whether
 * it records a healthy property or a known defect, and a later checkpoint that
 * changes behavior must change the matching assertion deliberately and visibly.
 * Nothing here may be "fixed" by editing src/ during CP0.
 */

const DAY = 86_400_000;
const T0 = new Date('2026-10-01T09:00:00.000Z');

// Fresh card exactly as `ensureApprovedSchedule` creates it (DB column defaults).
const fresh: CardSchedule = {
  state: 'new',
  stabilityDays: 0.0416666667,
  difficulty: 5,
  lapses: 0,
  dueAt: T0,
};

// Box thresholds as shipped in apps/website (words route, today route, progress route).
// CP0 pins them so the canonical module (CP2) can be proven equal to today's display.
const boxOf = (stabilityDays: number) =>
  stabilityDays < 1
    ? 1
    : stabilityDays < 3
      ? 2
      : stabilityDays < 7
        ? 3
        : stabilityDays < 21
          ? 4
          : 5;

/** Reviews a card on time, every time, with the given grade sequence. */
function run(
  grades: ReviewGrade[],
  start: CardSchedule = fresh,
): Array<CardSchedule & { box: number; at: Date }> {
  const out: Array<CardSchedule & { box: number; at: Date }> = [];
  let card = start;
  let now = T0;
  for (const grade of grades) {
    card = scheduleReview(card, grade, now);
    out.push({ ...card, box: boxOf(card.stabilityDays), at: now });
    now = card.dueAt;
  }
  return out;
}

const repeat = (grade: ReviewGrade, n: number): ReviewGrade[] =>
  Array.from({ length: n }, () => grade);

describe('CP0 scheduler — grade multipliers (pinned)', () => {
  it('multiplies stability by 0.35 / 0.8 / 1.8 / 3 depending on grade', () => {
    const base: CardSchedule = { ...fresh, state: 'review', stabilityDays: 10 };
    const after = (grade: ReviewGrade) => scheduleReview(base, grade, T0).stabilityDays;
    expect(after('forgot')).toBeCloseTo(3.5, 10);
    expect(after('hard')).toBeCloseTo(8, 10);
    expect(after('remembered')).toBeCloseTo(18, 10);
    expect(after('mastered')).toBeCloseTo(30, 10);
  });

  it('floors stability at 10 minutes and the interval at one minute', () => {
    const tiny: CardSchedule = { ...fresh, state: 'relearning', stabilityDays: 0.001 };
    const next = scheduleReview(tiny, 'forgot', T0);
    expect(next.stabilityDays).toBeCloseTo(10 / 1440, 12);
    expect(next.dueAt.getTime() - T0.getTime()).toBe(10 * 60_000);
  });

  it('due = answer time + new stability (the client timestamp, not the server clock)', () => {
    const next = scheduleReview({ ...fresh, state: 'review', stabilityDays: 2 }, 'remembered', T0);
    expect(next.dueAt.getTime() - T0.getTime()).toBeCloseTo(3.6 * DAY, 0);
  });
});

describe('CP0 scheduler — difficulty and lapses', () => {
  it('forgot raises difficulty by 0.5 and adds a lapse; every other grade lowers it by 0.1', () => {
    const base: CardSchedule = { ...fresh, state: 'review', stabilityDays: 5 };
    expect(scheduleReview(base, 'forgot', T0)).toMatchObject({ difficulty: 5.5, lapses: 1 });
    for (const grade of ['hard', 'remembered', 'mastered'] as const) {
      const next = scheduleReview(base, grade, T0);
      expect(next.difficulty).toBeCloseTo(4.9, 10);
      expect(next.lapses).toBe(0);
    }
  });

  it('keeps difficulty in [1, 10] and never decreases lapses', () => {
    let card: CardSchedule = { ...fresh, state: 'review', stabilityDays: 5, difficulty: 10 };
    card = scheduleReview(card, 'forgot', T0);
    expect(card.difficulty).toBe(10);
    let low: CardSchedule = { ...fresh, state: 'review', stabilityDays: 5, difficulty: 1 };
    low = scheduleReview(low, 'mastered', T0);
    expect(low.difficulty).toBe(1);
    expect(scheduleReview({ ...card, lapses: 3 }, 'mastered', T0).lapses).toBe(3);
  });

  // DEFECT (design): difficulty is written but never feeds the interval.
  it('DEFECT: difficulty and lapses have no effect on the next interval', () => {
    const easy: CardSchedule = {
      ...fresh,
      state: 'review',
      stabilityDays: 4,
      difficulty: 1,
      lapses: 0,
    };
    const hard: CardSchedule = {
      ...fresh,
      state: 'review',
      stabilityDays: 4,
      difficulty: 10,
      lapses: 9,
    };
    for (const grade of ['forgot', 'hard', 'remembered', 'mastered'] as const) {
      expect(scheduleReview(easy, grade, T0).stabilityDays).toBe(
        scheduleReview(hard, grade, T0).stabilityDays,
      );
    }
  });
});

describe('CP0 scheduler — state machine (pinned)', () => {
  const at = (state: CardSchedule['state'], stabilityDays: number, grade: ReviewGrade) =>
    scheduleReview({ ...fresh, state, stabilityDays }, grade, T0).state;

  it('forgot always lands in relearning', () => {
    for (const state of ['new', 'learning', 'review', 'relearning', 'mastered'] as const) {
      expect(at(state, 30, 'forgot')).toBe('relearning');
    }
  });

  it('a new card becomes learning on any non-forgot grade, even mastered', () => {
    for (const grade of ['hard', 'remembered', 'mastered'] as const) {
      expect(at('new', 0.0416666667, grade)).toBe('learning');
    }
  });

  it('mastered needs the mastered GRADE and a new stability of at least 21 days', () => {
    expect(at('review', 7, 'mastered')).toBe('mastered'); // 7 * 3 = 21
    expect(at('review', 6.9, 'mastered')).toBe('review'); // 20.7
    expect(at('review', 12, 'remembered')).toBe('review'); // 21.6 d but grade is not `mastered`
    expect(at('review', 30, 'remembered')).toBe('review');
  });

  it('a mastered card drops to review (not relearning) on hard or remembered', () => {
    expect(at('mastered', 30, 'hard')).toBe('review');
    expect(at('mastered', 30, 'remembered')).toBe('review');
  });

  // DEFECT (consequence for the binary UX): state `mastered` is reachable only through
  // the `mastered` grade. A Known/Unknown UI that projects Known -> remembered can
  // NEVER produce state='mastered', however long the card survives.
  it('DEFECT: remembered-only reviews reach Box 5 without ever reaching state=mastered', () => {
    const trace = run(repeat('remembered', 14));
    expect(trace[trace.length - 1].box).toBe(5);
    expect(trace.some((step) => step.state === 'mastered')).toBe(false);
  });

  it('suspended and archived are never produced by the scheduler', () => {
    const all = run(['forgot', 'hard', 'remembered', 'mastered', 'forgot', 'mastered']);
    expect(all.some((s) => s.state === 'suspended' || s.state === 'archived')).toBe(false);
  });
});

describe('CP0 scheduler — trajectories against the Box 1-5 display (pinned numbers)', () => {
  it('on-time remembered: Box 2 at answer 6, Box 3 at 8, Box 4 at 9, Box 5 at 11', () => {
    const trace = run(repeat('remembered', 14));
    const firstIndexInBox = (box: number) => trace.findIndex((s) => s.box >= box);
    expect(firstIndexInBox(2) + 1).toBe(6);
    expect(firstIndexInBox(3) + 1).toBe(8);
    expect(firstIndexInBox(4) + 1).toBe(9);
    expect(firstIndexInBox(5) + 1).toBe(11);
  });

  it('first on-time remembered answers on a new card (hours, not days)', () => {
    const trace = run(repeat('remembered', 4));
    expect(trace.map((s) => Number((s.stabilityDays * 24).toFixed(2)))).toEqual([
      1.8, 3.24, 5.83, 10.5,
    ]);
    expect(trace[0].state).toBe('learning');
    expect(trace[1].state).toBe('review');
  });

  it('always-forgot: first answer is 21.6 min, every later one sits on the 10-minute floor', () => {
    const trace = run(repeat('forgot', 6));
    expect(trace[0].stabilityDays * 1440).toBeCloseTo(0.0416666667 * 0.35 * 1440, 6);
    for (const step of trace.slice(1)) {
      expect(step.stabilityDays * 1440).toBeCloseTo(10, 6);
    }
    expect(trace.every((s) => s.box === 1 && s.state === 'relearning')).toBe(true);
    expect(trace[trace.length - 1].lapses).toBe(6);
    expect(trace[trace.length - 1].difficulty).toBeCloseTo(8, 10);
  });

  it('always-hard shrinks the interval 20% per answer and never grows', () => {
    const trace = run(repeat('hard', 6));
    for (let i = 1; i < trace.length; i += 1) {
      expect(trace[i].stabilityDays).toBeLessThan(trace[i - 1].stabilityDays);
    }
    expect(trace[5].stabilityDays * 1440).toBeCloseTo(0.0416666667 * 0.8 ** 6 * 1440, 6);
  });

  it('always-mastered: no ceiling — 8 on-time answers give roughly 9 months', () => {
    const trace = run(repeat('mastered', 8));
    expect(trace[7].stabilityDays).toBeCloseTo(0.0416666667 * 3 ** 8, 6);
    expect(trace[7].stabilityDays).toBeGreaterThan(270);
    expect(trace[7].state).toBe('mastered');
  });

  // DEFECT (vs conventional Leitner): forgetting does NOT return a card to Box 1.
  it('DEFECT vs Leitner: forgot moves a card down only one Box from Boxes 3-5', () => {
    const fromStability = (stabilityDays: number): number => {
      const card: CardSchedule = { ...fresh, state: 'review', stabilityDays };
      return boxOf(scheduleReview(card, 'forgot', T0).stabilityDays);
    };
    expect(fromStability(5)).toBe(2); // Box 3 -> 2
    expect(fromStability(15)).toBe(3); // Box 4 -> 3
    expect(fromStability(40)).toBe(4); // Box 5 -> 4
    expect(fromStability(2)).toBe(1); // Box 2 -> 1 (the only path to Box 1)
  });

  // DEFECT: lateness is ignored. A card reviewed 30 days late gets the same next
  // stability as one reviewed on time.
  it('DEFECT: a very late review earns the same interval as an on-time review', () => {
    const due = new Date(T0.getTime() + 2 * DAY);
    const card: CardSchedule = { ...fresh, state: 'review', stabilityDays: 2, dueAt: due };
    const onTime = scheduleReview(card, 'remembered', due);
    const late = scheduleReview(card, 'remembered', new Date(due.getTime() + 30 * DAY));
    expect(late.stabilityDays).toBe(onTime.stabilityDays);
  });

  it('the 4-grade -> Box projection that the binary model must reproduce or replace', () => {
    // Box after ONE answer from a card at 5 days (Box 3): documents what each legacy
    // grade does today so CP1 can compare candidate binary policies against it.
    const card: CardSchedule = { ...fresh, state: 'review', stabilityDays: 5 };
    const box = (grade: ReviewGrade) => boxOf(scheduleReview(card, grade, T0).stabilityDays);
    expect({
      forgot: box('forgot'),
      hard: box('hard'),
      remembered: box('remembered'),
      mastered: box('mastered'),
    }).toEqual({ forgot: 2, hard: 3, remembered: 4, mastered: 4 });
  });
});

describe('CP0 daily session plan — capacity, ordering, new-card limit', () => {
  const now = new Date('2026-10-01T10:00:00.000Z');
  const due = (cardId: string, hoursAgo: number, extra = {}) => ({
    cardId,
    dueAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    state: 'review' as const,
    stabilityDays: 2,
    lapses: 0,
    importance: 1,
    ...extra,
  });
  const fresh35 = Array.from({ length: 35 }, (_, i) => ({
    cardId: `new-${String(i).padStart(2, '0')}`,
    importance: 1,
  }));

  it('orders due cards by due time then card id, then appends up to the suggested new cards', () => {
    const plan = createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards: [due('b', 1), due('a', 5), due('c', 5)],
      newCards: fresh35,
      suggestedNewCards: 3,
    });
    expect(plan.mode).toBe('normal');
    expect(plan.reviewCardIds).toEqual(['a', 'c', 'b']);
    expect(plan.newCardIds).toEqual(['new-00', 'new-01', 'new-02']);
  });

  it('new cards are ordered by importance then card id (alphabetical), not by curriculum order', () => {
    const plan = createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards: [],
      newCards: [
        { cardId: 'z-card', importance: 1 },
        { cardId: 'a-card', importance: 1 },
        { cardId: 'm-card', importance: 1 },
      ],
      suggestedNewCards: 3,
    });
    expect(plan.newCardIds).toEqual(['a-card', 'm-card', 'z-card']);
  });

  it('suspended and archived cards are excluded from the queue', () => {
    const plan = createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards: [
        due('s', 3, { state: 'suspended' }),
        due('x', 3, { state: 'archived' }),
        due('ok', 3),
      ],
      newCards: [],
      suggestedNewCards: 0,
    });
    expect(plan.reviewCardIds).toEqual(['ok']);
  });

  it('more than 12 due cards switches to recovery: 12 cards, zero new cards', () => {
    const many = Array.from({ length: 13 }, (_, i) => due(`d${String(i).padStart(2, '0')}`, i + 1));
    const plan = createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards: many,
      newCards: fresh35,
      suggestedNewCards: 3,
    });
    expect(plan.mode).toBe('recovery');
    expect(plan.reviewCardIds).toHaveLength(12);
    expect(plan.newCardIds).toEqual([]);
  });

  it('exactly 12 due cards is still normal mode and leaves no room for new cards', () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      due(`d${String(i).padStart(2, '0')}`, i + 1),
    );
    const plan = createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards: twelve,
      newCards: fresh35,
      suggestedNewCards: 3,
    });
    expect(plan.mode).toBe('normal');
    expect(plan.newCardIds).toEqual([]);
  });

  // DEFECT: the planner has no memory. Every call with spare capacity grants up to
  // `suggestedNewCards` again, so a per-user-day limit cannot be enforced here; it is
  // only as good as whatever the caller passes in `suggestedNewCards`.
  it('DEFECT: no per-user-day new-card cap — every plan request grants new cards again', () => {
    const grant = () =>
      createDailySessionPlan({
        durationMinutes: 5,
        now,
        dueCards: [],
        newCards: fresh35,
        suggestedNewCards: 3,
      }).newCardIds.length;
    const requestsInOneDay = [grant(), grant(), grant(), grant()];
    expect(requestsInOneDay).toEqual([3, 3, 3, 3]); // 12 new cards from one "3 per day" setting
  });

  it('input is not mutated by planning', () => {
    const dueCards = [due('b', 1), due('a', 5)];
    const snapshot = JSON.stringify(dueCards);
    createDailySessionPlan({
      durationMinutes: 5,
      now,
      dueCards,
      newCards: [],
      suggestedNewCards: 0,
    });
    expect(JSON.stringify(dueCards)).toBe(snapshot);
  });
});
