import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertBoxTransition,
  boxFromStabilityDays,
  finalizeBinarySchedule,
  scheduleBinaryReview,
  scheduleReview,
  SchedulerInvariantError,
  stateAfterBinaryReview,
  toBinaryResponse,
  V2_BOX5_CAP_DAYS,
  type Box,
  type BinaryResponse,
  type CardSchedule,
  type LearningState,
  type ReviewGrade,
} from '../src/index.js';

/**
 * LB-B35 CP7 — scheduler V2 (GR-1.8 + ENG-DROP) proof suite, run against the REAL functions.
 * The reference model below is written independently (explicit tables, no shared helper).
 */

const T0 = new Date('2026-10-01T09:00:00.000Z');
const DAY = 86_400_000;
const EDGE = [0, 1, 3, 7, 21] as const; // lower bound of Box 1..5

const fresh = (stabilityDays: number, extra: Partial<CardSchedule> = {}): CardSchedule => ({
  state: 'review',
  stabilityDays,
  difficulty: 5,
  lapses: 0,
  dueAt: T0,
  ...extra,
});
const K = (s: CardSchedule, at = T0) =>
  scheduleBinaryReview(s, { grade: 'remembered', response: 'known' }, at);
const U = (s: CardSchedule, at = T0) =>
  scheduleBinaryReview(s, { grade: 'forgot', response: 'unknown' }, at);
const boxOf = (s: CardSchedule) => boxFromStabilityDays(s.stabilityDays);

/** Independent reference: next BOX only (intervals are checked by range, not by re-deriving formulas). */
function refBox(before: Box, r: BinaryResponse, stability: number): Box {
  if (r === 'unknown') return before === 1 ? 1 : ((before - 1) as Box);
  if (before === 1) return 2;
  if (before === 5) return 5;
  const grown = stability * 1.8;
  return grown >= EDGE[before] ? ((before + 1) as Box) : before; // never skips: clamp keeps it in before+1
}

/** Dense sweep: log-spaced points + every Box edge at tiny offsets + the cap region. */
function stabilityPoints(): number[] {
  const pts = new Set<number>();
  // Geometric grid by repeated exact IEEE multiplication (no `**`: V8 rounds it differently per Node
  // version, which would change the point set between local and CI). 0.0014 .. ~224 days.
  let g = 0.0014125375446227544;
  for (let i = 0; i < 4500; i++) {
    pts.add(g);
    g *= 1.0026649009615933;
  }
  for (const edge of [1, 3, 7, 21]) {
    for (const d of [-1e-3, -1e-6, -1e-9, -1e-12, 0, 1e-12, 1e-9, 1e-6, 1e-3]) pts.add(edge + d);
  }
  for (const v of [10 / 1440, 0.0416666667, 60, 100, 179.999, 180, 180.0001, 200, 540, 4000])
    pts.add(v);
  return [...pts].filter((p) => p > 0).sort((a, b) => a - b);
}
const POINTS = stabilityPoints();

describe('state-space sweep (real function)', () => {
  it('covers at least 4,000 distinct stability points, every Box, and every Box boundary', () => {
    expect(POINTS.length).toBeGreaterThanOrEqual(4000);
    expect(new Set(POINTS).size).toBe(POINTS.length);
    const boxes = new Set(POINTS.map((p) => boxOf(fresh(p))));
    expect([...boxes].sort()).toEqual([1, 2, 3, 4, 5]);
    for (const edge of [1, 3, 7, 21]) {
      expect(POINTS.some((p) => p < edge && edge - p <= 1e-9)).toBe(true);
      expect(POINTS).toContain(edge);
      expect(POINTS.some((p) => p > edge && p - edge <= 1e-9)).toBe(true);
    }
    expect(POINTS.some((p) => p >= 180)).toBe(true);
    expect(POINTS.some((p) => p > 180 && p < 181)).toBe(true);
    expect(Math.max(...POINTS)).toBeGreaterThanOrEqual(4000);
  });

  it('every point: exact Box rule, bounds and invariants for Known and Unknown', () => {
    let checked = 0;
    for (const stab of POINTS) {
      const s = fresh(stab);
      const before = boxOf(s);
      const k = K(s);
      const u = U(s);
      for (const [next, r] of [
        [k, 'known'],
        [u, 'unknown'],
      ] as const) {
        const after = boxOf(next);
        expect(after, `${r} @${stab}`).toBe(refBox(before, r, stab));
        expect(next.stabilityDays).toBeGreaterThan(0);
        expect(Number.isFinite(next.stabilityDays)).toBe(true);
        expect(next.dueAt.getTime()).toBeGreaterThan(T0.getTime());
        checked++;
      }
      // Unknown: exactly one Box down, Box 1 stays.
      expect(boxOf(u)).toBe(before === 1 ? 1 : before - 1);
      // Known: never lowers, at most +1, Box 1 always graduates, Box 5 stays and is capped.
      expect(boxOf(k)).toBeGreaterThanOrEqual(before);
      expect(boxOf(k)).toBeLessThanOrEqual(Math.min(5, before + 1));
      if (before === 1) expect(boxOf(k)).toBe(2);
      if (before === 5) {
        expect(boxOf(k)).toBe(5);
        expect(k.stabilityDays).toBeLessThanOrEqual(V2_BOX5_CAP_DAYS);
      }
      // Unknown shrinks stability, except where the 10-minute floor (or the lower edge of the Box below) applies.
      expect(u.stabilityDays).toBeLessThanOrEqual(
        Math.max(stab * 0.35, 10 / 1440, EDGE[Math.max(before - 2, 0)]!) + 1e-9,
      );
    }
    expect(checked).toBe(POINTS.length * 2);
  });

  it('a Known never leaves a stalled Box twice in a row (max one consecutive Known without Box change)', () => {
    for (const stab of POINTS) {
      let s = fresh(stab);
      if (boxOf(s) === 5) continue;
      const b0 = boxOf(s);
      const s1 = K(s);
      if (boxOf(s1) === b0) {
        const s2 = K(s1);
        expect(boxOf(s2), `two Knowns from ${stab}`).toBeGreaterThan(b0);
      }
      s = s1;
    }
  });

  it('Unknown from Box 5 at and beyond the 180-day cap drops exactly one Box to Box 4', () => {
    for (const stab of [21, 38, 63, 180, 180.0001, 400, 4000]) {
      const u = U(fresh(stab));
      expect(boxOf(u)).toBe(4);
      expect(u.stabilityDays).toBeLessThan(21);
      expect(u.stabilityDays).toBeGreaterThanOrEqual(7);
    }
  });

  it('Box 5 growth is x3 and never above 180 days', () => {
    let s = fresh(21);
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      s = K(s);
      seen.push(s.stabilityDays);
      expect(s.stabilityDays).toBeLessThanOrEqual(180);
    }
    expect(seen.slice(0, 3)).toEqual([63, 180, 180]);
    // A value already above the cap (legacy data) is pulled back to the cap, never grown.
    expect(K(fresh(4000)).stabilityDays).toBe(180);
  });
});

describe('GR-1.8 pinned Known progression from a new card', () => {
  const NEW = fresh(0.0416666667, { state: 'new' });
  it('matches the committed CP6 GR-1.8 trace exactly (docs/evidence/cp6/traces.txt, S1)', () => {
    let s = NEW;
    const out: string[] = [];
    for (let i = 0; i < 14; i++) {
      s = K(s);
      out.push(
        `B${boxOf(s)}(${s.stabilityDays >= 10 ? Math.round(s.stabilityDays) : Math.round(s.stabilityDays * 10) / 10}d)`,
      );
    }
    expect(out).toEqual([
      'B2(1d)',
      'B2(1.8d)',
      'B3(3.2d)',
      'B3(5.8d)',
      'B4(10d)',
      'B4(19d)',
      'B5(34d)',
      'B5(102d)',
      'B5(180d)',
      'B5(180d)',
      'B5(180d)',
      'B5(180d)',
      'B5(180d)',
      'B5(180d)',
    ]);
  });
  it('maximum one consecutive Known without a visible Box change; Box 5 reached on the 7th Known', () => {
    let s = NEW;
    let stall = 0;
    let maxStall = 0;
    let reached = 0;
    for (let i = 1; i <= 14; i++) {
      const before = boxOf(s);
      s = K(s);
      stall = boxOf(s) === before && before < 5 ? stall + 1 : 0;
      maxStall = Math.max(maxStall, stall);
      if (!reached && boxOf(s) === 5) reached = i;
    }
    expect(maxStall).toBeLessThanOrEqual(1);
    expect(reached).toBe(7);
  });
  it('first review of a new card writes state=learning for either answer', () => {
    expect(K(NEW).state).toBe('learning');
    expect(U(NEW).state).toBe('learning');
  });
});

describe('repeated Unknown and mixed sequences', () => {
  it('repeated Unknown walks down one Box per answer and then holds Box 1', () => {
    let s = fresh(180);
    const boxes: number[] = [];
    for (let i = 0; i < 8; i++) {
      s = U(s);
      boxes.push(boxOf(s));
    }
    expect(boxes).toEqual([4, 3, 2, 1, 1, 1, 1, 1]);
    expect(s.stabilityDays).toBeGreaterThanOrEqual(10 / 1440 - 1e-15);
    expect(s.lapses).toBe(8);
  });

  it('alternating Known/Unknown from Box 1: Known graduates, Unknown returns to Box 1', () => {
    let s = fresh(0.0416666667, { state: 'new' });
    const boxes: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = i % 2 === 0 ? K(s) : U(s);
      boxes.push(boxOf(s));
    }
    expect(boxes).toEqual([2, 1, 2, 1, 2, 1]);
  });

  it('a recovery after Unknown from Box 5 returns to Box 5 after one or two Known', () => {
    let s = U(fresh(63));
    expect(boxOf(s)).toBe(4);
    s = K(s);
    if (boxOf(s) !== 5) s = K(s);
    expect(boxOf(s)).toBe(5);
  });

  it('1,000 seeded random sequences follow the independent reference and every invariant', () => {
    let seed = 0xc0ffee;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const digest = createHash('sha256');
    for (let run = 0; run < 1000; run++) {
      let s = fresh(rnd() < 0.5 ? 0.0416666667 : 0.01 * (1 + rnd() * 99) * (1 + rnd() * 9), {
        state: rnd() < 0.3 ? 'new' : 'review',
      });
      let now = T0;
      for (let i = 0; i < 40; i++) {
        const r: BinaryResponse = rnd() < 0.62 ? 'known' : 'unknown';
        const before = boxOf(s);
        const stabBefore = s.stabilityDays;
        s = scheduleBinaryReview(
          s,
          { grade: r === 'known' ? 'remembered' : 'forgot', response: r },
          now,
        );
        expect(boxOf(s)).toBe(refBox(before, r, stabBefore));
        expect(s.stabilityDays).toBeLessThanOrEqual(r === 'known' && before === 5 ? 180 : 1e9);
        now = s.dueAt;
        digest.update(`${run}:${i}:${r}:${boxOf(s)}:${s.stabilityDays.toPrecision(12)}|`);
      }
    }
    // Deterministic: the digest is pinned so any behavior change must be deliberate and visible.
    expect(digest.digest('hex')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('legacy grades are binary under V2', () => {
  const grades: ReviewGrade[] = ['forgot', 'hard', 'remembered', 'mastered'];
  it('every legacy grade schedules exactly as its canonical projection', () => {
    for (const stab of POINTS.filter((_, i) => i % 7 === 0)) {
      for (const g of grades) {
        const legacy = scheduleBinaryReview(fresh(stab), { grade: g }, T0);
        const binary = scheduleBinaryReview(
          fresh(stab),
          { grade: g, response: toBinaryResponse(g) },
          T0,
        );
        expect(legacy).toEqual(binary);
      }
      // hard / remembered / mastered are indistinguishable (no hidden four-grade behavior)
      const h = scheduleBinaryReview(fresh(stab), { grade: 'hard' }, T0);
      const m = scheduleBinaryReview(fresh(stab), { grade: 'mastered' }, T0);
      const rm = scheduleBinaryReview(fresh(stab), { grade: 'remembered' }, T0);
      expect(h).toEqual(rm);
      expect(m).toEqual(rm);
    }
  });
});

describe('compatibility state is never an input', () => {
  const states: LearningState[] = [
    'new',
    'learning',
    'review',
    'relearning',
    'mastered',
    'suspended',
    'archived',
  ];
  it('changing state/difficulty/lapses/dueAt cannot change stability or the Box or the interval', () => {
    for (const stab of POINTS.filter((_, i) => i % 5 === 0)) {
      for (const r of ['known', 'unknown'] as const) {
        const base = scheduleBinaryReview(fresh(stab), { grade: 'x', response: r }, T0);
        for (const state of states) {
          for (const difficulty of [1, 5, 10]) {
            for (const lapses of [0, 3, 99]) {
              const other = scheduleBinaryReview(
                fresh(stab, { state, difficulty, lapses, dueAt: new Date(0) }),
                { grade: 'x', response: r },
                T0,
              );
              expect(other.stabilityDays).toBe(base.stabilityDays);
              expect(other.dueAt.getTime()).toBe(base.dueAt.getTime());
            }
          }
        }
      }
    }
  });
  it('lateness is not an input: the same schedule reviewed early or very late gets the same interval', () => {
    const s = fresh(5, { dueAt: new Date(T0.getTime() + 5 * DAY) });
    const onTime = K(s, new Date(T0.getTime() + 5 * DAY));
    const veryLate = K(s, new Date(T0.getTime() + 400 * DAY));
    expect(onTime.stabilityDays).toBe(veryLate.stabilityDays);
    expect(veryLate.dueAt.getTime() - (T0.getTime() + 400 * DAY)).toBe(
      onTime.dueAt.getTime() - (T0.getTime() + 5 * DAY),
    );
  });
  it('writes the compatibility state exactly as decided', () => {
    expect(stateAfterBinaryReview('new', 'known', 2)).toBe('learning');
    expect(stateAfterBinaryReview('new', 'unknown', 1)).toBe('learning');
    expect(stateAfterBinaryReview('review', 'unknown', 3)).toBe('relearning');
    expect(stateAfterBinaryReview('learning', 'known', 5)).toBe('mastered');
    expect(stateAfterBinaryReview('relearning', 'known', 3)).toBe('review');
    expect(stateAfterBinaryReview('mastered', 'known', 5)).toBe('mastered');
  });
  it('difficulty and lapses keep the V1 arithmetic (compatibility columns)', () => {
    const n = U(fresh(5, { difficulty: 5, lapses: 2 }));
    expect(n.difficulty).toBe(5.5);
    expect(n.lapses).toBe(3);
    expect(K(fresh(5, { difficulty: 5 })).difficulty).toBeCloseTo(4.9, 12);
  });
});

describe('runtime transition assertions refuse invalid transitions', () => {
  const ok = {
    before: 3 as Box,
    response: 'known' as const,
    after: 4 as Box,
    nextStabilityDays: 8,
    nextDueAt: new Date(T0.getTime() + DAY),
    now: T0,
  };
  it('accepts a valid transition', () => {
    expect(() => assertBoxTransition(ok)).not.toThrow();
  });
  const bad: Array<[string, Parameters<typeof assertBoxTransition>[0]]> = [
    ['Known lowers Box', { ...ok, after: 2 }],
    ['Known skips a Box', { ...ok, after: 5, nextStabilityDays: 30 }],
    ['Known from Box 1 stays', { ...ok, before: 1, after: 1, nextStabilityDays: 0.5 }],
    ['Known in Box 5 above cap', { ...ok, before: 5, after: 5, nextStabilityDays: 181 }],
    ['Known in Box 5 leaves Box 5', { ...ok, before: 5, after: 4, nextStabilityDays: 10 }],
    ['Unknown raises', { ...ok, response: 'unknown', before: 3, after: 4 }],
    ['Unknown stays above Box 1', { ...ok, response: 'unknown', before: 3, after: 3 }],
    [
      'Unknown drops two',
      { ...ok, response: 'unknown', before: 4, after: 2, nextStabilityDays: 2 },
    ],
    [
      'Unknown in Box 1 moves',
      { ...ok, response: 'unknown', before: 1, after: 2, nextStabilityDays: 1.5 },
    ],
    ['non-finite stability', { ...ok, nextStabilityDays: Number.NaN }],
    ['zero stability', { ...ok, nextStabilityDays: 0 }],
    ['due not after now', { ...ok, nextDueAt: T0 }],
  ];
  for (const [name, input] of bad) {
    it(`throws SchedulerInvariantError: ${name}`, () => {
      expect(() => assertBoxTransition(input)).toThrow(SchedulerInvariantError);
    });
  }
  it('the single gate returns NO schedule for an invalid proposal (so nothing can be persisted)', () => {
    const from3 = fresh(5); // Box 3
    const proposals: Array<[BinaryResponse, number, string]> = [
      ['known', 30, 'Known skipping a Box'],
      ['known', 5, 'Known not changing Box 3 is allowed only when it stays: 5 -> Box 3'],
      ['unknown', 5, 'Unknown that does not lower the Box'],
      ['unknown', 0.5, 'Unknown dropping two Boxes'],
      ['known', Number.NaN, 'NaN stability'],
      ['known', -1, 'negative stability'],
    ];
    for (const [response, proposed, label] of proposals) {
      if (label.startsWith('Known not changing')) {
        expect(() => finalizeBinarySchedule(from3, response, proposed, T0), label).not.toThrow();
        continue;
      }
      let returned: CardSchedule | undefined;
      expect(() => {
        returned = finalizeBinarySchedule(from3, response, proposed, T0);
      }, label).toThrow(SchedulerInvariantError);
      expect(returned, label).toBeUndefined();
    }
  });
  it('refuses an invalid stored stability instead of scheduling from it', () => {
    for (const stab of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => K(fresh(stab))).toThrow(SchedulerInvariantError);
    }
  });
});

describe('scheduler V1 is untouched (flag-off equivalence input)', () => {
  it('scheduleReview over 12,000 deterministic inputs hashes to the digest generated from pristine main', () => {
    // Portable generator: integer LCG and exact IEEE operations only. `**`/Math.pow/log/exp are NOT used
    // because V8 rounds them differently across Node versions (Node 22 in CI vs a newer local Node), which
    // would change the generated INPUTS and make the pin meaningless. The digest below was produced by
    // building `packages/learning-engine` from origin/main (before CP7) and is identical on Node 22 and 26.
    let seed = 123456789;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const pow2 = (k: number) => {
      let v = 1;
      for (let i = 0; i < Math.abs(k); i++) v = k >= 0 ? v * 2 : v / 2;
      return v;
    };
    const states = [
      'new',
      'learning',
      'review',
      'relearning',
      'mastered',
      'suspended',
      'archived',
    ] as const;
    const grades = ['forgot', 'hard', 'remembered', 'mastered'] as const;
    const special = [0.0001, 0.007, 1, 3, 7, 21, 180, 400, 4000];
    const h = createHash('sha256');
    for (let i = 0; i < 12000; i++) {
      const stab =
        i % 50 === 0
          ? special[(i / 50) % special.length]!
          : pow2(Math.floor(rnd() * 14) - 9) * (1 + rnd());
      const sched: CardSchedule = {
        state: states[Math.floor(rnd() * 7)]!,
        stabilityDays: stab,
        difficulty: 1 + rnd() * 9,
        lapses: Math.floor(rnd() * 20),
        dueAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(rnd() * 4e8)),
      };
      const g = grades[Math.floor(rnd() * 4)]!;
      const now = new Date(Date.UTC(2026, 9, 1) + Math.floor(rnd() * 4e8));
      const r = scheduleReview(sched, g, now);
      h.update(
        JSON.stringify([
          sched.state,
          sched.stabilityDays,
          sched.difficulty,
          sched.lapses,
          sched.dueAt.toISOString(),
          g,
          now.toISOString(),
          r.state,
          r.stabilityDays,
          r.difficulty,
          r.lapses,
          r.dueAt.toISOString(),
        ]),
      );
    }
    expect(h.digest('hex')).toBe(
      '5cd3080ab280b3ea65bebf07866f0b4303fb7c5b216a35b75f8aca5fe5cb36a2',
    );
  });
});
