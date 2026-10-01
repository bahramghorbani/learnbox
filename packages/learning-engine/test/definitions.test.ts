import { describe, expect, it } from 'vitest';

import {
  BINARY_RESPONSES,
  BOXES,
  BOX_LOWER_BOUND_DAYS,
  HISTORICAL_GRADE_PROJECTION,
  LEARNED_MIN_BOX,
  MASTERED_MIN_BOX,
  REVIEW_GRADES,
  BINARY_SHADOW_GRADE,
  shadowGradeFor,
  resolveLearnerTimeZone,
  accuracyCountsSql,
  accuracyFromAnswers,
  addDaysToDayKey,
  answersProjectingTo,
  boxCaseSql,
  boxFromStabilityDays,
  computeAccuracy,
  computeStreak,
  countBoxes,
  isBinaryResponse,
  isLearnedStability,
  isMasteredStability,
  isReviewGrade,
  learnedPredicateSql,
  localDayKey,
  masteredPredicateSql,
  normalizeTimeZone,
  summarizeBoxCounts,
  toBinaryResponse,
} from '../src/definitions';
import { compareStoredToReplayed, summarizeReplayComparisons } from '../src/replay-compat';
import { scheduleReview, type CardSchedule } from '../src/index';

/** The thresholds v1.2.1 shipped in the Today, Words and Progress routes (pinned by CP0). */
const shippedBox = (stabilityDays: number) =>
  stabilityDays < 1
    ? 1
    : stabilityDays < 3
      ? 2
      : stabilityDays < 7
        ? 3
        : stabilityDays < 21
          ? 4
          : 5;

describe('LB-B35 CP2 — canonical Box derivation', () => {
  it('equals the shipped Box thresholds at every boundary, just below and just above', () => {
    for (const edge of [1, 3, 7, 21]) {
      for (const value of [edge - 1e-9, edge, edge + 1e-9]) {
        expect(boxFromStabilityDays(value)).toBe(shippedBox(value));
      }
    }
  });

  it('equals the shipped thresholds on a dense sweep (no existing card changes Box)', () => {
    for (let v = 0.001; v < 400; v += 0.0137) {
      expect(boxFromStabilityDays(v)).toBe(shippedBox(v));
    }
  });

  it('puts the initial card and every engine output in a valid Box', () => {
    expect(boxFromStabilityDays(0.0416666667)).toBe(1);
    expect(boxFromStabilityDays(10 / (24 * 60))).toBe(1);
    expect(boxFromStabilityDays(Number.MAX_VALUE)).toBe(5);
  });

  it('is monotone non-decreasing in stability', () => {
    let previous = 1;
    for (let v = 0; v < 500; v += 0.05) {
      const box = boxFromStabilityDays(v);
      expect(box).toBeGreaterThanOrEqual(previous);
      previous = box;
    }
  });

  it('refuses NaN instead of silently assigning a Box', () => {
    expect(() => boxFromStabilityDays(Number.NaN)).toThrow(RangeError);
  });

  it('exposes exactly five Boxes whose lower bounds are increasing', () => {
    expect(BOXES).toEqual([1, 2, 3, 4, 5]);
    expect([...BOX_LOWER_BOUND_DAYS]).toEqual([0, 1, 3, 7, 21]);
  });

  it('counts Boxes and never loses or double-counts a card', () => {
    const values = [0.04, 0.5, 1, 2.9, 3, 6.99, 7, 20.99, 21, 180, 400];
    const counts = countBoxes(values);
    expect(counts).toEqual([2, 2, 2, 2, 3]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(values.length);
  });
});

describe('LB-B35 CP2 — Learned = Box 4+, Mastered = Box 5', () => {
  it('uses the owner-decided thresholds', () => {
    expect(LEARNED_MIN_BOX).toBe(4);
    expect(MASTERED_MIN_BOX).toBe(5);
  });

  it('classifies by stability, independent of the legacy state column', () => {
    expect(isLearnedStability(6.99)).toBe(false);
    expect(isLearnedStability(7)).toBe(true);
    expect(isMasteredStability(20.99)).toBe(false);
    expect(isMasteredStability(21)).toBe(true);
    // Mastered implies Learned, never the reverse.
    for (let v = 0.01; v < 300; v += 0.31) {
      if (isMasteredStability(v)) expect(isLearnedStability(v)).toBe(true);
    }
  });

  it('summarizes started, learned and mastered from Box counts', () => {
    expect(summarizeBoxCounts([5, 4, 3, 2, 1])).toEqual({
      started: 15,
      learned: 3,
      mastered: 1,
      boxes: [5, 4, 3, 2, 1],
    });
  });

  it('CHARACTERIZATION: a v1 "remembered"-only card is Mastered without ever being state=mastered', () => {
    // The legacy `state` column is not the definition of Mastered (CP0 defect D9). Canonical Mastered is Box 5.
    let card: CardSchedule = {
      state: 'new',
      stabilityDays: 0.0416666667,
      difficulty: 5,
      lapses: 0,
      dueAt: new Date(0),
    };
    let now = new Date(0);
    for (let i = 0; i < 12; i += 1) {
      card = scheduleReview(card, 'remembered', now);
      now = card.dueAt;
    }
    expect(card.state).not.toBe('mastered');
    expect(isMasteredStability(card.stabilityDays)).toBe(true);
  });
});

describe('LB-B35 CP2 — canonical binary response and historical grade projection', () => {
  it('projects the owner-decided mapping exactly', () => {
    expect(HISTORICAL_GRADE_PROJECTION).toEqual({
      forgot: 'unknown',
      hard: 'known',
      remembered: 'known',
      mastered: 'known',
    });
  });

  it('is total over every historical grade and only produces binary values', () => {
    for (const grade of REVIEW_GRADES) {
      expect(BINARY_RESPONSES).toContain(toBinaryResponse(grade));
    }
  });

  it('accepts binary values directly so pre- and post-binary history read through one function', () => {
    expect(toBinaryResponse('known')).toBe('known');
    expect(toBinaryResponse('unknown')).toBe('unknown');
  });

  it('rejects anything else instead of guessing', () => {
    for (const bad of ['good', 'again', '', 'Forgot', 'KNOWN', 'easy']) {
      expect(() => toBinaryResponse(bad)).toThrow(RangeError);
    }
    expect(isReviewGrade('good')).toBe(false);
    expect(isBinaryResponse('hard')).toBe(false);
  });

  it('lists every stored answer that projects to each response', () => {
    expect([...answersProjectingTo('known')].sort()).toEqual(
      ['hard', 'known', 'mastered', 'remembered'].sort(),
    );
    expect([...answersProjectingTo('unknown')].sort()).toEqual(['forgot', 'unknown']);
  });

  it('does not change the historical four-grade scheduler (v1 still maps grades via its own factors)', () => {
    const base: CardSchedule = {
      state: 'review',
      stabilityDays: 4,
      difficulty: 5,
      lapses: 0,
      dueAt: new Date(0),
    };
    expect(scheduleReview(base, 'forgot', new Date(0)).stabilityDays).toBeCloseTo(1.4, 10);
    expect(scheduleReview(base, 'hard', new Date(0)).stabilityDays).toBeCloseTo(3.2, 10);
    expect(scheduleReview(base, 'remembered', new Date(0)).stabilityDays).toBeCloseTo(7.2, 10);
    expect(scheduleReview(base, 'mastered', new Date(0)).stabilityDays).toBeCloseTo(12, 10);
  });
});

describe('LB-B35 CP2 — canonical Accuracy', () => {
  it('is known / total, counting each answer once', () => {
    expect(computeAccuracy({ known: 3, unknown: 1 })).toEqual({
      known: 3,
      unknown: 1,
      total: 4,
      ratio: 0.75,
      percent: 75,
    });
  });

  it('is null (not 0) when there are no answers', () => {
    const accuracy = computeAccuracy({ known: 0, unknown: 0 });
    expect(accuracy.ratio).toBeNull();
    expect(accuracy.percent).toBeNull();
  });

  it('FIXES CP0 D1: a learner who answers only "mastered" is 100%, not 0%', () => {
    expect(accuracyFromAnswers(['mastered', 'mastered', 'mastered']).percent).toBe(100);
  });

  it('counts hard as known and forgot as unknown, historical and binary alike', () => {
    expect(accuracyFromAnswers(['forgot', 'hard', 'remembered', 'mastered']).percent).toBe(75);
    expect(accuracyFromAnswers(['known', 'unknown']).percent).toBe(50);
    expect(accuracyFromAnswers(['forgot', 'known']).known).toBe(1);
  });

  it('rounds half up and stays within 0..100', () => {
    expect(computeAccuracy({ known: 1, unknown: 2 }).percent).toBe(33);
    expect(computeAccuracy({ known: 2, unknown: 1 }).percent).toBe(67);
    expect(computeAccuracy({ known: 1, unknown: 7 }).percent).toBe(13); // 12.5 rounds up
    expect(computeAccuracy({ known: 7, unknown: 0 }).percent).toBe(100);
    expect(computeAccuracy({ known: 0, unknown: 7 }).percent).toBe(0);
  });

  it('rejects negative, fractional or non-finite counts', () => {
    expect(() => computeAccuracy({ known: -1, unknown: 0 })).toThrow(RangeError);
    expect(() => computeAccuracy({ known: 1.5, unknown: 0 })).toThrow(RangeError);
    expect(() => computeAccuracy({ known: Number.NaN, unknown: 0 })).toThrow(RangeError);
  });

  it('rejects an unrecognised stored answer rather than miscounting it', () => {
    expect(() => accuracyFromAnswers(['remembered', 'good'])).toThrow(RangeError);
  });
});

describe('LB-B35 CP2 — canonical local-day semantics', () => {
  it('buckets by the learner zone: 00:30 Tehran is already the next local day, UTC is not', () => {
    const instant = new Date('2026-10-01T21:00:00Z'); // 00:30 on Oct 2 in Asia/Tehran (+03:30)
    expect(localDayKey(instant, 'Asia/Tehran')).toBe('2026-10-02');
    expect(localDayKey(instant, 'UTC')).toBe('2026-10-01');
  });

  it('handles a zone with a DST shift without skipping or repeating a day', () => {
    const before = localDayKey(new Date('2026-03-08T06:59:00Z'), 'America/New_York');
    const after = localDayKey(new Date('2026-03-08T07:01:00Z'), 'America/New_York');
    expect(before).toBe('2026-03-08');
    expect(after).toBe('2026-03-08');
    expect(localDayKey(new Date('2026-03-09T05:00:00Z'), 'America/New_York')).toBe('2026-03-09');
  });

  it('degrades an unknown, empty or oversized zone to UTC', () => {
    expect(normalizeTimeZone(undefined)).toBe('UTC');
    expect(normalizeTimeZone('')).toBe('UTC');
    expect(normalizeTimeZone('Not/AZone')).toBe('UTC');
    expect(normalizeTimeZone('x'.repeat(65))).toBe('UTC');
    expect(normalizeTimeZone('Asia/Tehran')).toBe('Asia/Tehran');
    expect(normalizeTimeZone('UTC')).toBe('UTC');
    expect(normalizeTimeZone('America/Argentina/Buenos_Aires')).toBe(
      'America/Argentina/Buenos_Aires',
    );
    // Fixed UTC offsets are not IANA zones: Postgres would read '+03:30' with the opposite sign.
    for (const offset of [
      '+03:30',
      '-05:00',
      '+0330',
      '3',
      'UTC+3',
      '+03',
      'Etc/../../x',
      'Asia//Tehran',
    ]) {
      expect(normalizeTimeZone(offset), offset).toBe('UTC');
    }
  });

  it('adds days across month and year boundaries and leap days', () => {
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rejects a malformed day key', () => {
    expect(() => addDaysToDayKey('2026-1-1', 1)).toThrow(RangeError);
  });
});

describe('LB-B35 CP2 — canonical streak', () => {
  it('counts a run that ends today', () => {
    expect(computeStreak(['2026-10-01', '2026-09-30', '2026-09-29'], '2026-10-01')).toEqual({
      current: 3,
      longest: 3,
      activeDays: 3,
    });
  });

  it('keeps a run that ended yesterday alive, and drops it after a missed full day', () => {
    expect(computeStreak(['2026-09-30', '2026-09-29'], '2026-10-01').current).toBe(2);
    expect(computeStreak(['2026-09-29', '2026-09-28'], '2026-10-01').current).toBe(0);
  });

  it('reports the longest historical run independently of the current one', () => {
    const summary = computeStreak(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-20'],
      '2026-10-01',
    );
    expect(summary).toEqual({ current: 0, longest: 4, activeDays: 5 });
  });

  it('ignores duplicates and input order', () => {
    expect(
      computeStreak(['2026-10-01', '2026-09-30', '2026-10-01', '2026-09-30'], '2026-10-01'),
    ).toEqual({ current: 2, longest: 2, activeDays: 2 });
  });

  it('is empty-safe', () => {
    expect(computeStreak([], '2026-10-01')).toEqual({ current: 0, longest: 0, activeDays: 0 });
  });
});

describe('LB-B35 CP2 — generated SQL fragments', () => {
  it('builds a Box CASE from the same thresholds', () => {
    expect(boxCaseSql('stability_days')).toBe(
      'CASE WHEN stability_days >= 21 THEN 5 WHEN stability_days >= 7 THEN 4 WHEN stability_days >= 3 THEN 3 WHEN stability_days >= 1 THEN 2 ELSE 1 END',
    );
  });

  it('builds Learned and Mastered predicates from the same thresholds', () => {
    expect(learnedPredicateSql('cs.stability_days')).toBe('cs.stability_days >= 7');
    expect(masteredPredicateSql('cs.stability_days')).toBe('cs.stability_days >= 21');
  });

  it('builds the accuracy counts from the canonical projection', () => {
    expect(accuracyCountsSql('grade')).toBe(
      "count(*) FILTER (WHERE grade IN ('hard', 'remembered', 'mastered', 'known')) AS known, count(*) FILTER (WHERE grade IN ('forgot', 'unknown')) AS unknown",
    );
  });

  it('refuses a column reference that could inject SQL', () => {
    for (const bad of ['x; DROP TABLE users', "a'b", 'a b', '', '1abc', 'a..b']) {
      expect(() => boxCaseSql(bad)).toThrow(RangeError);
      expect(() => learnedPredicateSql(bad)).toThrow(RangeError);
      expect(() => accuracyCountsSql(bad)).toThrow(RangeError);
    }
  });
});

describe('LB-B35 CP2 — historical replay compatibility policy', () => {
  it('classifies exact, same-Box and Box-changing differences', () => {
    expect(compareStoredToReplayed(0.5, 0.5).agreement).toBe('exact');
    // The CP1 finding: stored exactly 10/9 of the replayed value, still the same Box.
    const tenNinths = compareStoredToReplayed(0.05 * (10 / 9), 0.05);
    expect(tenNinths.agreement).toBe('same-box');
    expect(tenNinths.stabilityRatio).toBeCloseTo(10 / 9, 12);
    expect(compareStoredToReplayed(1.2, 0.9).agreement).toBe('conflict');
  });

  it('reports the Box on each side so a conflict is never silently absorbed', () => {
    expect(compareStoredToReplayed(8, 2)).toMatchObject({
      agreement: 'conflict',
      storedBox: 4,
      replayedBox: 2,
    });
  });

  it('summarizes without dropping any comparison', () => {
    const report = summarizeReplayComparisons([
      compareStoredToReplayed(2, 2),
      compareStoredToReplayed(0.55, 0.5),
      compareStoredToReplayed(8, 2),
    ]);
    expect(report).toEqual({ compared: 3, exact: 1, sameBox: 1, conflicts: 1 });
  });

  it('has a null ratio instead of dividing by zero', () => {
    expect(compareStoredToReplayed(1, 0).stabilityRatio).toBeNull();
  });
});

describe('LB-B35 CP2 — streak ignores days after today', () => {
  it('does not let a skew-stamped future day erase or extend the current run', () => {
    expect(computeStreak(['2026-09-30', '2026-10-01', '2026-10-02'], '2026-10-01')).toEqual({
      current: 2,
      longest: 2,
      activeDays: 2,
    });
  });
});

describe('resolveLearnerTimeZone (LB-B35 CP4, owner decision O2)', () => {
  it('prefers the stored zone and never persists over it', () => {
    expect(resolveLearnerTimeZone('Asia/Tehran', 'Europe/Berlin')).toEqual({
      timeZone: 'Asia/Tehran',
      source: 'stored',
      persist: null,
    });
  });

  it('falls back to a valid device zone and asks to persist it once', () => {
    expect(resolveLearnerTimeZone(null, 'Europe/Berlin')).toEqual({
      timeZone: 'Europe/Berlin',
      source: 'request',
      persist: 'Europe/Berlin',
    });
    expect(resolveLearnerTimeZone(undefined, 'Asia/Tehran').persist).toBe('Asia/Tehran');
  });

  it('skips an invalid stored zone instead of trusting it', () => {
    expect(resolveLearnerTimeZone('Not/AZone', 'Asia/Tehran').source).toBe('request');
    expect(resolveLearnerTimeZone('+03:30', null)).toEqual({
      timeZone: 'UTC',
      source: 'default',
      persist: null,
    });
  });

  it('missing, invalid, offset-style or oversized zones resolve to UTC and persist nothing', () => {
    for (const bad of [
      null,
      undefined,
      '',
      '+03:30',
      '-0500',
      'Nope/Nope',
      'x'.repeat(65),
      '../etc',
    ]) {
      expect(resolveLearnerTimeZone(null, bad)).toEqual({
        timeZone: 'UTC',
        source: 'default',
        persist: null,
      });
    }
  });
});

describe('binary shadow grade (LB-B35 CP4)', () => {
  it('projects back to the response it was derived from, for every binary response', () => {
    for (const response of BINARY_RESPONSES) {
      expect(toBinaryResponse(shadowGradeFor(response))).toBe(response);
    }
  });

  it('is a legacy grade the database CHECK accepts, and the mapping is exactly the plan', () => {
    expect(BINARY_SHADOW_GRADE).toEqual({ known: 'remembered', unknown: 'forgot' });
    for (const response of BINARY_RESPONSES) {
      expect(REVIEW_GRADES).toContain(shadowGradeFor(response));
    }
    expect(Object.isFrozen(BINARY_SHADOW_GRADE)).toBe(true);
  });
});
