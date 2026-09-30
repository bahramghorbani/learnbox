import { describe, expect, it } from 'vitest';

import { boxFromStabilityDays, scheduleReview, type Box, type CardSchedule } from '../src/index';

/**
 * LB-B35 CP2 — characterization of learner-facing Box progression for repeated on-time Known answers.
 *
 * Owner decision D1 selected ENG-CLAMP and required that, BEFORE activation, this behavior is explicitly
 * characterized and a learner-facing progression invariant is established WITHOUT silently changing the
 * scheduler. This file does exactly that and nothing more:
 *
 *  - It pins the measured behavior (the "Known" multiplier, factor 1.8, is the `remembered` factor of the
 *    shipped engine; ENG-CLAMP only adds a one-Box-per-answer ceiling, a Box-5 growth cap and Unknown = one
 *    Box down, none of which alters the progression BELOW Box 5 for Known answers — CP1 traces).
 *  - It states the candidate invariants and records, for each, whether the measured behavior satisfies it.
 *  - It does NOT assert that the strict invariant holds. Whether the strict invariant is required, and
 *    therefore whether ENG-CLAMP must change, is an OWNER decision (see CP2 report). No policy is invented.
 *
 * No scheduler is implemented or activated here; `scheduleReview` is the unmodified shipped engine.
 */
const T0 = new Date('2026-01-01T00:00:00Z');
const initial: CardSchedule = {
  state: 'new',
  stabilityDays: 0.0416666667,
  difficulty: 5,
  lapses: 0,
  dueAt: T0,
};

/** Reviews exactly when due, `count` times, every answer Known (= the `remembered` factor). */
function onTimeKnownRun(count: number) {
  let card = initial;
  let now = T0;
  const boxes: Box[] = [];
  const intervalsDays: number[] = [];
  for (let i = 0; i < count; i += 1) {
    card = scheduleReview(card, 'remembered', now);
    boxes.push(boxFromStabilityDays(card.stabilityDays));
    intervalsDays.push(card.stabilityDays);
    now = card.dueAt;
  }
  return { boxes, intervalsDays };
}

const firstAnswerReaching = (boxes: Box[], box: Box) => boxes.findIndex((b) => b >= box) + 1;

describe('LB-B35 CP2 — Known-answer progression through Boxes (characterization, no policy change)', () => {
  const { boxes, intervalsDays } = onTimeKnownRun(20);

  it('matches the CP1 simulator traces exactly: answers needed to first reach Box 2, 3, 4, 5', () => {
    expect(firstAnswerReaching(boxes, 2)).toBe(6);
    expect(firstAnswerReaching(boxes, 3)).toBe(8);
    expect(firstAnswerReaching(boxes, 4)).toBe(9);
    expect(firstAnswerReaching(boxes, 5)).toBe(11);
  });

  it('CHARACTERIZATION: the first five on-time Known answers leave the card in Box 1', () => {
    expect(boxes.slice(0, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(boxes[5]).toBe(2);
  });

  it('measures how many of the first 12 Known answers change nothing the learner can see', () => {
    const unchanged = boxes
      .slice(0, 12)
      .filter((box, index) => box === (index === 0 ? 1 : boxes[index - 1]!)).length;
    // 8 of 12 leave the Box unchanged (CP1: "64–80% of Known answers may leave a card in the same Box").
    expect(unchanged).toBe(8);
  });

  it('never moves more than one Box per Known answer below Box 5, and never regresses', () => {
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i]! - boxes[i - 1]!).toBeGreaterThanOrEqual(0);
      expect(boxes[i]! - boxes[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the underlying interval strictly growing on every Known answer, even when the Box label does not change', () => {
    // This is the "visible progress" that exists today: the next-review distance always grows.
    for (let i = 1; i < 10; i += 1)
      expect(intervalsDays[i]!).toBeGreaterThan(intervalsDays[i - 1]!);
  });
});

describe('LB-B35 CP2 — candidate learner-facing progression invariants and what the measured behavior satisfies', () => {
  const { boxes, intervalsDays } = onTimeKnownRun(20);

  // Each entry is a CANDIDATE invariant for the owner to choose from. `holds` is computed, not assumed.
  const candidates = {
    // S: the strictest: every on-time Known answer moves the card up at least one Box until Box 5.
    'S: every on-time Known answer advances one Box until Box 5': boxes
      .slice(0, 4)
      .every((b, i) => b === ((i + 2) as Box)),
    // M: bounded stall — no more than N consecutive Known answers may leave the Box unchanged (below Box 5).
    'M5: at most 5 consecutive Known answers without a Box change (below Box 5)': (() => {
      let run = 0;
      let worst = 0;
      let previous: Box = 1;
      for (const box of boxes) {
        if (previous === 5) break;
        run = box === previous ? run + 1 : 0;
        worst = Math.max(worst, run);
        previous = box;
      }
      return worst <= 5;
    })(),
    'M3: at most 3 consecutive Known answers without a Box change (below Box 5)': (() => {
      let run = 0;
      let worst = 0;
      let previous: Box = 1;
      for (const box of boxes) {
        if (previous === 5) break;
        run = box === previous ? run + 1 : 0;
        worst = Math.max(worst, run);
        previous = box;
      }
      return worst <= 3;
    })(),
    // E: eventual — repeated on-time Known answers always reach Box 5 within a bounded number of answers.
    'E12: Box 5 is reached within 12 on-time Known answers': firstAnswerReaching(boxes, 5) <= 12,
    // G: the interval grows on every Known answer (monotone), i.e. progress is real even if the label is stable.
    'G: the interval grows on every Known answer': intervalsDays
      .slice(0, 11)
      .every((v, i, all) => i === 0 || v > all[i - 1]!),
  } as const;

  it('records the verdicts (owner chooses which, if any, is the required invariant)', () => {
    expect(candidates).toEqual({
      'S: every on-time Known answer advances one Box until Box 5': false,
      'M5: at most 5 consecutive Known answers without a Box change (below Box 5)': true,
      'M3: at most 3 consecutive Known answers without a Box change (below Box 5)': false,
      'E12: Box 5 is reached within 12 on-time Known answers': true,
      'G: the interval grows on every Known answer': true,
    });
  });

  it('documents that the strictest invariant S would require a different policy (not ENG-CLAMP as selected)', () => {
    // Reaching Box 2 needs 6 answers, so "advance on every Known answer" cannot hold for the selected policy.
    expect(firstAnswerReaching(boxes, 2)).toBeGreaterThan(1);
  });
});
