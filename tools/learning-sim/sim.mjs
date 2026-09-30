// LB-B35 CP1 — simulator core. Pure, deterministic given (params, seed). Scratch tooling.
// Reuses the REAL planner (createDailySessionPlan) from the built learning-engine.

import { createDailySessionPlan } from '../../packages/learning-engine/dist/index.js';
import { applyAnswer, boxOf, candidates, newCard, toDate } from './policies.mjs';

export const CHECKPOINTS = [30, 90, 180, 365];
const HIST_BIN = 0.25; // days
const HIST_N = 1700; // up to 425 days overdue

// ---- deterministic hash RNG (common random numbers across candidates) ----
function hash32(a, b, c) {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = (Math.imul(h ^ (c + 0x165667b1), 0x27d4eb2f) ^ (h >>> 13)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h + 0.5) / 4294967296;
}
const normal = (seed, card, k) =>
  Math.sqrt(-2 * Math.log(hash32(seed, card, k))) *
  Math.cos(2 * Math.PI * hash32(seed, card, k + 1));

export function attendance(kind, seed, days) {
  const out = new Uint8Array(days);
  if (kind === 'A1') return out.fill(1);
  if (kind === 'A2') {
    for (let d = 0; d < days; d++) out[d] = hash32(seed, 900001, d) < 5 / 7 ? 1 : 0;
    return out;
  }
  let active = hash32(seed, 910000, 0) < 0.5;
  let d = 0;
  let block = 1;
  while (d < days) {
    const mean = active ? 10 : 14;
    const len = Math.max(
      1,
      Math.ceil(Math.log(1 - hash32(seed, 910000, block)) / Math.log(1 - 1 / mean)),
    );
    for (let i = 0; i < len && d < days; i++, d++) out[d] = active ? 1 : 0;
    active = !active;
    block++;
  }
  return out;
}

const emptyHist = () => new Float64Array(HIST_N + 1);
function histP95(hist, total) {
  if (!total) return 0;
  let acc = 0;
  for (let i = 0; i <= HIST_N; i++) {
    acc += hist[i];
    if (acc >= 0.95 * total) return i * HIST_BIN;
  }
  return HIST_N * HIST_BIN;
}

/**
 * One simulated learner-year.
 * model: {type:'const', p} | {type:'decay', m, sigma, G, pNew}
 */
export function runOne(candidate, model, attKind, N, seed, options = {}) {
  const days = 365;
  const floorHl = options.variant === 'floor' || options.variant === 'floor-uncapped';
  const uncapped = options.variant === 'floor-uncapped';
  const att = options.attendance ?? attendance(attKind, seed, days);
  const cards = Array.from({ length: N }, () => null);
  const hl = new Float64Array(N); // hidden half-life (decay model)
  const hl0 = new Float64Array(N);
  const lastAns = new Float64Array(N);
  const nAns = new Int32Array(N);
  const intro = [];
  let nextNew = 0;

  const s = {
    attended: 0,
    recovery: 0,
    answers: 0,
    reviews: 0,
    knownAns: 0,
    unknownAns: 0,
    knownSame: 0,
    knownTot: 0,
    unknownSame: 0,
    unknownTot: 0,
    retSum: 0,
    retN: 0,
    hist: emptyHist(),
    histN: 0,
    b5Reviews: 0,
    b5Unknown: 0,
    b5RetSum: 0,
    b5CardDays: 0,
    b5Intervals: [],
    maxInterval: 0,
    drop2: 0,
    unknownDrops: 0,
    changes: 0,
    reversals: 0,
    transK: Array.from({ length: 6 }, () => new Array(6).fill(0)),
    transU: Array.from({ length: 6 }, () => new Array(6).fill(0)),
    snapshots: {},
  };
  const lastDir = new Int8Array(N);

  const recall = (i, nowDays, k) => {
    if (model.type === 'const') return hash32(seed, i, 1 + k) < model.p;
    const p = k === 0 ? model.pNew : 2 ** (-(nowDays - lastAns[i]) / hl[i]);
    return hash32(seed, i, 1 + k) < p;
  };
  const recallP = (i, nowDays) =>
    model.type === 'const' ? model.p : 2 ** (-(nowDays - lastAns[i]) / hl[i]);

  const snapshot = (day) => {
    let K = 0;
    const boxes = [0, 0, 0, 0, 0, 0];
    for (const i of intro) {
      K += model.type === 'decay' ? 2 ** (-(day - lastAns[i]) / hl[i]) : 0;
      boxes[boxOf(cards[i].stab)]++;
    }
    let overdue = 0;
    for (const i of intro) if (cards[i].dueDays <= day) overdue++;
    s.snapshots[day] = {
      K: K / N,
      boxes,
      introduced: intro.length,
      dueNow: overdue,
      reviews: s.reviews,
      answers: s.answers,
      recovery: s.recovery,
      attended: s.attended,
      p95: histP95(s.hist, s.histN),
      retention: s.retN ? s.retSum / s.retN : null,
      b5Reviews: s.b5Reviews,
      b5CardDays: s.b5CardDays,
    };
  };

  const answer = (i, known, day) => {
    const c = cards[i];
    const preBox = c.state === 'new' ? 0 : boxOf(c.stab);
    const preStab = c.stab;
    applyAnswer(candidate, c, known, day);
    const postBox = boxOf(c.stab);
    const interval = c.dueDays - day;
    if (interval > s.maxInterval) s.maxInterval = interval;
    nAns[i]++;
    s.answers++;
    if (known) s.knownAns++;
    else s.unknownAns++;
    if (model.type === 'decay')
      hl[i] = known ? hl[i] * model.G : floorHl ? Math.max(hl[i] * 0.5, hl0[i]) : hl[i] * 0.5;
    lastAns[i] = day;
    if (preBox === 0) return;
    s.reviews++;
    (known ? s.transK : s.transU)[preBox][postBox]++;
    if (known) {
      s.knownTot++;
      if (preBox < 5 && postBox === preBox) s.knownSame++;
    } else {
      s.unknownTot++;
      if (preBox > 1 && postBox === preBox) s.unknownSame++;
      if (preBox - postBox >= 2) s.drop2++;
      if (preBox > 1) s.unknownDrops++;
    }
    if (postBox !== preBox) {
      s.changes++;
      const dir = postBox > preBox ? 1 : -1;
      if (lastDir[i] !== 0 && lastDir[i] !== dir) s.reversals++;
      lastDir[i] = dir;
    }
    void preStab;
  };

  for (let day = 0; day <= days; day++) {
    if (CHECKPOINTS.includes(day) || (options.snap || []).includes(day)) snapshot(day);
    if (day === days) break;
    if (att[day]) {
      const dueList = [];
      for (const i of intro) if (cards[i].dueDays <= day) dueList.push(i);
      const now = toDate(day);
      const plan = uncapped
        ? uncappedPlan(dueList, cards, nextNew, N)
        : createDailySessionPlan({
            durationMinutes: 5,
            now,
            dueCards: dueList.map((i) => ({
              cardId: String(i).padStart(5, '0'),
              state: cards[i].state,
              dueAt: toDate(cards[i].dueDays),
              stabilityDays: cards[i].stab,
              lapses: cards[i].lapses,
              importance: 1,
            })),
            newCards: Array.from({ length: Math.min(3, N - nextNew) }, (_, j) => ({
              cardId: String(nextNew + j).padStart(5, '0'),
              importance: 1,
            })),
            suggestedNewCards: 3,
          });
      s.attended++;
      if (plan.mode === 'recovery') s.recovery++;
      if (options.trace)
        options.trace.push({
          day,
          mode: plan.mode,
          due: dueList.length,
          maxOver: dueList.reduce((m, i) => Math.max(m, day - cards[i].dueDays), 0),
        });
      for (const id of plan.reviewCardIds) {
        const i = Number(id);
        const c = cards[i];
        const over = day - c.dueDays;
        s.hist[Math.min(HIST_N, Math.floor(over / HIST_BIN))]++;
        s.histN++;
        const preBox = boxOf(c.stab);
        const p = recallP(i, day);
        s.retSum += p;
        s.retN++;
        if (preBox === 5) {
          s.b5Reviews++;
          s.b5RetSum += p;
        }
        const known = recall(i, day, nAns[i]);
        if (preBox === 5 && !known) s.b5Unknown++;
        if (preBox === 5) s.b5Intervals.push(c.dueDays - c.lastDays);
        answer(i, known, day);
      }
      for (const id of plan.newCardIds) {
        const i = Number(id);
        cards[i] = newCard();
        if (model.type === 'decay') hl[i] = model.m * Math.exp(model.sigma * normal(seed, i, 4000));
        hl0[i] = hl[i];
        lastAns[i] = day;
        intro.push(i);
        nextNew = Math.max(nextNew, i + 1);
        answer(i, recall(i, day, 0), day);
      }
    }
    for (const i of intro) if (boxOf(cards[i].stab) === 5) s.b5CardDays++;
  }
  s.introducedFinal = intro.length;
  return s;
}

function uncappedPlan(dueList, cards, nextNew, N) {
  const order = [...dueList].sort((a, b) => cards[a].dueDays - cards[b].dueDays || a - b);
  return {
    mode: 'normal',
    reviewCardIds: order.map((i) => String(i).padStart(5, '0')),
    newCardIds: Array.from({ length: Math.min(3, N - nextNew) }, (_, j) =>
      String(nextNew + j).padStart(5, '0'),
    ),
  };
}

export { candidates };
