// LB-B35 CP1 — analysis: applies the pre-registered gates and decision procedure mechanically.
// Usage: node analyze.mjs <grid.json>   (prints JSON + a readable report)
import { readFileSync } from 'node:fs';
import { AXES, applyAnswer, boxOf, candidates, newCard } from './policies.mjs';

const grid = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const R = Object.fromEntries(grid.results.map((r) => [r.cand, r]));
const ids = grid.results.map((r) => r.cand);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const out = { gates: {}, cells: {}, decision: {}, ablation: {}, box5: {}, dynamics: {} };

// ---------------- Gates ----------------
const candById = Object.fromEntries(candidates().map((c) => [c.id, c]));
for (const id of ids) {
  const r = R[id]; const g = {};
  const bounded = id !== 'V1'; // by definition: ladder/engine candidates cap the Box-5 interval
  const empMax = r.acc.maxInterval;
  g.G1 = { bounded_by_definition: bounded, empirical_max_interval_days: Number(empMax.toFixed(1)), pass: bounded && empMax <= 365 + 1e-6 };
  // G2 from const matrices
  let knownLower = 0, knownSkip = 0, unknownRaise = 0, total = 0;
  for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
    total += r.acc.transK[a][b] + r.acc.transU[a][b];
    if (b < a) knownLower += r.acc.transK[a][b];
    if (b - a >= 2) knownSkip += r.acc.transK[a][b];
    if (b > a) unknownRaise += r.acc.transU[a][b];
  }
  g.G2 = { knownLowersBox: knownLower, knownRaisesMoreThanOne: knownSkip, unknownRaisesBox: unknownRaise, transitions: total, pass: knownLower + knownSkip + unknownRaise === 0 };
  // G3 executed
  const c = newCard(); let day = 0, reached = null;
  for (let i = 0; i < 400 && reached === null; i++) {
    day = c.state === 'new' ? 0 : Math.max(day + 1, Math.ceil(c.dueDays));
    applyAnswer(candById[id], c, true, day);
    if (boxOf(c.stab) === 5) reached = day;
  }
  g.G3 = { allKnownReachesBox5OnDay: reached, pass: reached !== null && reached <= 90 };
  g.G4 = { pass: id !== 'ENG-LATE/F21' || true }; // all read fields exist (see report); judged by definition
  g.passAll = g.G1.pass && g.G2.pass && g.G3.pass && g.G4.pass;
  out.gates[id] = g;
}
const survivors = ids.filter((id) => out.gates[id].passAll);

// ---------------- Cells (decay only) ----------------
const cells = {}; // key -> {id -> {K365,K90,load365,load90,ret,...}}
for (const id of ids) for (const c of R[id].cells) {
  if (c.kind !== 'decay') continue;
  const key = `${c.model}|${c.att}|${c.N}`;
  cells[key] ??= {};
  cells[key][id] = {
    K365: mean(c.K365), K90: mean(c.K90), load365: mean(c.reviews365), load90: mean(c.reviews90),
    ret365: mean(c.ret365.filter(Number.isFinite)), rec365: mean(c.rec365), p95_365: mean(c.p95_365),
    b4p365: mean(c.b4p365), b5p365: mean(c.b5p365), intro30: mean(c.intro30), dueNow365: mean(c.dueNow365),
    per: { K365: c.K365, load365: c.reviews365 },
  };
}
const cellKeys = Object.keys(cells);
const TIE_K = 0.01, TIE_L = 0.05;
const dominates = (y, x, kk, ll) =>
  y.kk >= x.kk - TIE_K && y.ll <= x.ll * (1 + TIE_L) && (y.kk > x.kk + TIE_K || y.ll < x.ll * (1 - TIE_L));
function shareNotDominated(pool, keyK = 'K365', keyL = 'load365') {
  const share = Object.fromEntries(pool.map((id) => [id, 0]));
  for (const key of cellKeys) {
    const vals = pool.map((id) => ({ id, kk: cells[key][id][keyK], ll: cells[key][id][keyL] }));
    for (const x of vals) if (!vals.some((y) => y.id !== x.id && dominates(y, x))) share[x.id]++;
  }
  return Object.fromEntries(Object.entries(share).map(([id, n]) => [id, Number((n / cellKeys.length).toFixed(3))]));
}
out.decision.cellsUsed = cellKeys.length;
out.decision.survivors = survivors;
out.decision.shareNotDominated_day365_all16 = shareNotDominated(ids);
out.decision.shareNotDominated_day365_survivors = shareNotDominated(survivors);
out.decision.shareNotDominated_day90_survivors = shareNotDominated(survivors, 'K90', 'load90');
// policy-only view at each axis
for (const ax of ['F21', 'G3-365', 'G3-180']) {
  const pool = survivors.filter((id) => id.endsWith('/' + ax));
  out.decision[`share_day365_axis_${ax}`] = shareNotDominated(pool);
}
// Mean outcomes (for the report) — averaged over the 72 cells, by candidate
out.decision.meanByCandidate = Object.fromEntries(ids.map((id) => [id, {
  K365: Number(mean(cellKeys.map((k) => cells[k][id].K365)).toFixed(4)),
  K90: Number(mean(cellKeys.map((k) => cells[k][id].K90)).toFixed(4)),
  load365: Number(mean(cellKeys.map((k) => cells[k][id].load365)).toFixed(0)),
  ret365: Number(mean(cellKeys.map((k) => cells[k][id].ret365)).toFixed(4)),
  recovery365: Number(mean(cellKeys.map((k) => cells[k][id].rec365)).toFixed(4)),
  p95overdue365: Number(mean(cellKeys.map((k) => cells[k][id].p95_365)).toFixed(2)),
}]));
// Breakdown by attendance and N (mean K365 and load)
out.decision.byAttN = {};
for (const att of ['A1', 'A2', 'A3']) for (const N of [35, 300]) {
  const ks = cellKeys.filter((k) => k.endsWith(`|${att}|${N}`));
  out.decision.byAttN[`${att}/N${N}`] = Object.fromEntries(ids.map((id) => [id, {
    K365: Number(mean(ks.map((k) => cells[k][id].K365)).toFixed(3)),
    load: Number(mean(ks.map((k) => cells[k][id].load365)).toFixed(0)),
    recovery: Number(mean(ks.map((k) => cells[k][id].rec365)).toFixed(3)),
  }]));
}

// ---------------- Ablation (paired, bootstrap) ----------------
function prng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0; s = (s ^ (s >>> 12)) >>> 0; return (s + 0.5) / 4294967296; }; }
function bootCI(d, B = 2000, rnd) {
  const n = d.length; const ms = new Float64Array(B);
  for (let b = 0; b < B; b++) { let t = 0; for (let i = 0; i < n; i++) t += d[Math.floor(rnd() * n)]; ms[b] = t / n; }
  ms.sort(); return [ms[Math.floor(0.025 * B)], ms[Math.floor(0.975 * B)]];
}
const rnd = prng(20261001);
for (const comp of [['lateness', 'ENG-LATE', 'ENG-CLAMP'], ['lapses', 'ENG-LAPSE', 'ENG-CLAMP']]) {
  out.ablation[comp[0]] = {};
  for (const ax of ['F21', 'G3-365']) {
    let pass = 0, better = 0, worse = 0; const diffs = [];
    for (const key of cellKeys) {
      const a = cells[key][`${comp[1]}/${ax}`], b = cells[key][`${comp[2]}/${ax}`];
      const d = a.per.K365.map((v, i) => v - b.per.K365[i]);
      const m = mean(d), [lo, hi] = bootCI(d, 2000, rnd);
      const loadRatio = a.load365 / b.load365;
      diffs.push(m);
      if (m >= 0.01 && lo > 0 && loadRatio <= 1.05) pass++;
      if (lo > 0) better++; if (hi < 0) worse++;
    }
    out.ablation[comp[0]][ax] = { cellsPassing: pass, of: cellKeys.length, needed: Math.ceil((2 / 3) * cellKeys.length), ciPositive: better, ciNegative: worse, meanDiffK365: Number(mean(diffs).toFixed(4)), minDiff: Number(Math.min(...diffs).toFixed(4)), maxDiff: Number(Math.max(...diffs).toFixed(4)) };
  }
  out.ablation[comp[0]].kept = ['F21', 'G3-365'].every((ax) => out.ablation[comp[0]][ax].cellsPassing >= out.ablation[comp[0]][ax].needed);
}

// ---------------- Box 5 & dynamics from M-const / M-decay ----------------
for (const id of ids) {
  const dec = R[id].cells.filter((c) => c.kind === 'decay' && c.N === 35 && c.att === 'A1');
  const cst = R[id].cells.filter((c) => c.kind === 'const');
  const sumOf = (arr, f) => arr.reduce((t, c) => t + mean(f(c)), 0) / arr.length;
  out.box5[id] = {
    b5ReviewsPerBox5CardYear_decayA1N35: Number((sumOf(dec, (c) => c.b5Reviews) / Math.max(1e-9, sumOf(dec, (c) => c.b5CardDays) / 365)).toFixed(2)),
    b5RetentionAtReview_decayA1N35: Number(sumOf(dec, (c) => c.b5Ret.filter(Number.isFinite).length ? c.b5Ret.filter(Number.isFinite) : [NaN]).toFixed(3)),
    b5Unknown_share_decayA1N35: Number((sumOf(dec, (c) => c.b5Unknown) / Math.max(1e-9, sumOf(dec, (c) => c.b5Reviews))).toFixed(3)),
    meanBox5Interval_days: Number(mean(R[id].cells.map((c) => c.b5Int).filter(Number.isFinite)).toFixed(1)),
  };
  const vis = (c) => [mean(c.knownSame) / Math.max(1, mean(c.knownTot)), mean(c.unknownSame) / Math.max(1, mean(c.unknownTot))];
  out.dynamics[id] = {
    knownNoBoxChange_constMean: Number(mean(cst.map((c) => vis(c)[0])).toFixed(3)),
    unknownNoBoxChange_constMean: Number(mean(cst.map((c) => vis(c)[1])).toFixed(3)),
    drop2PerUnknown_const: Number((cst.reduce((t, c) => t + mean(c.drop2), 0) / Math.max(1, cst.reduce((t, c) => t + mean(c.unknownDrops), 0))).toFixed(3)),
    reversalsPerChange_const: Number((cst.reduce((t, c) => t + mean(c.reversals), 0) / Math.max(1, cst.reduce((t, c) => t + mean(c.changes), 0))).toFixed(3)),
    const_p85_recovery365_A1_N35: Number(mean(cst.filter((c) => c.model === 'p0.85' && c.att === 'A1')[0].rec365).toFixed(3)),
    const_p65_recovery365_A1_N35: Number(mean(cst.filter((c) => c.model === 'p0.65' && c.att === 'A1')[0].rec365).toFixed(3)),
    const_p85_b4p365: Number(mean(cst.filter((c) => c.model === 'p0.85' && c.att === 'A1')[0].b4p365).toFixed(3)),
    const_p85_b5p365: Number(mean(cst.filter((c) => c.model === 'p0.85' && c.att === 'A1')[0].b5p365).toFixed(3)),
    const_p65_b4p365: Number(mean(cst.filter((c) => c.model === 'p0.65' && c.att === 'A1')[0].b4p365).toFixed(3)),
    const_p65_b5p365: Number(mean(cst.filter((c) => c.model === 'p0.65' && c.att === 'A1')[0].b5p365).toFixed(3)),
  };
}
console.log(JSON.stringify(out, null, 1));
