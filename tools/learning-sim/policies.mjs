// LB-B35 CP1 — candidate scheduler policies (definitions frozen in
// docs/evidence/LB_B35_CP1_PREREGISTRATION.md). Scratch tooling: nothing here ships.
//
// V1 calls the real, unmodified `scheduleReview` from the built learning-engine, so the baseline cannot
// drift from what v1.2.1 runs. Every other candidate is a pure function of (card, answer, time).

import { scheduleReview } from '../../packages/learning-engine/dist/index.js';

export const DAY_MS = 86_400_000;
export const BASE_MS = Date.UTC(2026, 0, 1);
export const MIN_STAB = 10 / (24 * 60); // shipped minimum stability (10 minutes)
export const NEW_STAB = 1 / 24; // shipped initial stability (one hour)

// Canonical Box edges, identical to today/words routes: <1, <3, <7, <21, >=21 days.
const UPPER = [1, 3, 7, 21, Infinity];
const LOWER = [0, 1, 3, 7, 21];
const LADDER = [MIN_STAB, 1, 3, 7, 21]; // interval of Box 1..5

export const boxOf = (stab) => (stab < 1 ? 1 : stab < 3 ? 2 : stab < 7 ? 3 : stab < 21 ? 4 : 5);
export const toDate = (days) => new Date(BASE_MS + days * DAY_MS);

export const newCard = () => ({
  state: 'new',
  stab: NEW_STAB,
  diff: 5,
  lapses: 0,
  dueDays: 0,
  lastDays: null,
});

/** Box-5 axis: F21 => 21 days forever; G3-C => x3 growth capped at C days. */
function boxFive(axis, preBox, computed, stab) {
  if (axis.kind === 'F21') return 21;
  const grown = preBox === 5 ? stab * 3 : computed;
  return Math.min(axis.cap, Math.max(21, grown));
}

function finish(card, stab, known, nowDays) {
  card.stab = Math.max(MIN_STAB, stab);
  card.dueDays = nowDays + card.stab;
  card.lastDays = nowDays;
  card.state = known ? (card.state === 'new' ? 'learning' : 'review') : 'relearning';
  if (!known) card.lapses += 1;
}

function ladder(unknownRule) {
  return (card, known, nowDays, axis) => {
    const b = boxOf(card.stab);
    let stab;
    if (known) stab = b < 5 ? LADDER[b] : boxFive(axis, 5, card.stab, card.stab);
    else stab = unknownRule === 'reset' ? LADDER[0] : LADDER[Math.max(1, b - 1) - 1];
    finish(card, stab, known, nowDays);
  };
}

function engine({ late = false, lapse = false, drop = false }) {
  return (card, known, nowDays, axis) => {
    const b = boxOf(card.stab);
    let stab;
    if (known) {
      const elapsed = card.lastDays === null ? 0 : nowDays - card.lastDays;
      const base = late ? Math.max(card.stab, elapsed) : card.stab;
      if (b === 5) {
        stab = boxFive(axis, 5, base * 1.8, base);
      } else {
        stab = Math.min(base * 1.8, UPPER[b] - 1e-9);
        if (boxOf(stab) === 5) stab = boxFive(axis, b, stab, stab);
      }
    } else {
      const factor = 0.35 * (lapse ? 0.85 ** card.lapses : 1);
      const floor = b >= 2 ? LOWER[b - 2] : MIN_STAB;
      stab = Math.max(card.stab * factor, floor);
      // POST-HOC (A17): an Unknown must lower the Box by exactly one (Box 1 stays in Box 1).
      if (drop && b >= 2) stab = Math.min(stab, UPPER[b - 2] - 1e-9);
    }
    finish(card, stab, known, nowDays);
  };
}

/**
 * LB-B35 CP6 (report-only, extra=true): Box-targeted engine family. Every member shares ENG-DROP's
 * Unknown rule (exactly one Box down, Box 1 stays) and the Box-5 rule (x3, capped by the axis). They differ
 * only in how Known grows stability below Box 5:
 *   factor   - multiplier (ENG-CLAMP uses 1.8);
 *   graduate - a Known from Box 1 lifts stability to at least 1 day, i.e. the card enters Box 2.
 * The one-Box-per-Known ceiling (clamp) is unchanged.
 */
function boxTargeted({ factor, graduate }) {
  return (card, known, nowDays, axis) => {
    const b = boxOf(card.stab);
    let stab;
    if (known) {
      if (b === 5) {
        stab = boxFive(axis, 5, card.stab * factor, card.stab);
      } else {
        let base = card.stab * factor;
        if (graduate && b === 1) base = Math.max(base, 1);
        stab = Math.min(base, UPPER[b] - 1e-9);
        if (boxOf(stab) === 5) stab = boxFive(axis, b, stab, stab);
      }
    } else {
      const floor = b >= 2 ? LOWER[b - 2] : MIN_STAB;
      stab = Math.max(card.stab * 0.35, floor);
      if (b >= 2) stab = Math.min(stab, UPPER[b - 2] - 1e-9);
    }
    finish(card, stab, known, nowDays);
  };
}

// V1: the shipped engine, Known -> remembered, Unknown -> forgot, nothing else.
function v1(card, known, nowDays) {
  const next = scheduleReview(
    {
      state: card.state,
      stabilityDays: card.stab,
      difficulty: card.diff,
      lapses: card.lapses,
      dueAt: toDate(card.dueDays),
    },
    known ? 'remembered' : 'forgot',
    toDate(nowDays),
  );
  card.state = next.state;
  card.stab = next.stabilityDays;
  card.diff = next.difficulty;
  card.lapses = next.lapses;
  card.dueDays = (next.dueAt.getTime() - BASE_MS) / DAY_MS;
  card.lastDays = nowDays;
}

export const POLICIES = {
  V1: { answer: v1, axes: false },
  'LAD-R': { answer: ladder('reset'), axes: true },
  'LAD-B': { answer: ladder('back'), axes: true },
  'ENG-CLAMP': { answer: engine({}), axes: true },
  'ENG-LATE': { answer: engine({ late: true }), axes: true },
  'ENG-LAPSE': { answer: engine({ lapse: true }), axes: true },
  // post-hoc, report-only (amendment A17); excluded from candidates() unless LB_EXTRA=1
  'ENG-DROP': { answer: engine({ drop: true }), axes: true, extra: true },
  // CP6 (report-only)
  'GR-1.8': { answer: boxTargeted({ factor: 1.8, graduate: true }), axes: true, extra: true },
  'GR-2.2': { answer: boxTargeted({ factor: 2.2, graduate: true }), axes: true, extra: true },
  'GR-2.5': { answer: boxTargeted({ factor: 2.5, graduate: true }), axes: true, extra: true },
  'GR-3': { answer: boxTargeted({ factor: 3, graduate: true }), axes: true, extra: true },
};

export const AXES = {
  F21: { kind: 'F21', name: 'F21' },
  'G3-365': { kind: 'G3', cap: 365, name: 'G3-365' },
  'G3-180': { kind: 'G3', cap: 180, name: 'G3-180' },
};

export function candidates() {
  const out = [{ policy: 'V1', axis: null, id: 'V1' }];
  for (const [policy, def] of Object.entries(POLICIES)) {
    if (!def.axes || (def.extra && !process.env.LB_EXTRA)) continue;
    for (const axis of Object.keys(AXES)) out.push({ policy, axis, id: `${policy}/${axis}` });
  }
  return out;
}

export function applyAnswer(candidate, card, known, nowDays) {
  POLICIES[candidate.policy].answer(
    card,
    known,
    nowDays,
    candidate.axis ? AXES[candidate.axis] : null,
  );
}
