// LB-B35 CP1 — decision pool after ablation: candidates that differ only by a component which FAILED
// ablation (ENG-LATE, ENG-LAPSE) are removed from the contract, leaving {LAD-R, LAD-B, ENG-CLAMP} x axes.
// Also reports the same pool over the constant-recall cells as a report-only sensitivity check.
// Usage: node pool.mjs <grid.json>
import { readFileSync } from 'node:fs';
const grid = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const POOL = ['LAD-R', 'LAD-B', 'ENG-CLAMP'].flatMap((p) =>
  ['F21', 'G3-365', 'G3-180'].map((a) => `${p}/${a}`),
);
const TIE_K = 0.01,
  TIE_L = 0.05;
const dom = (y, x) =>
  y.k >= x.k - TIE_K && y.l <= x.l * (1 + TIE_L) && (y.k > x.k + TIE_K || y.l < x.l * (1 - TIE_L));
function shares(kind, pool, filter = () => true) {
  const byKey = {};
  for (const id of pool)
    for (const c of grid.results.find((r) => r.cand === id).cells) {
      if (c.kind !== kind || !filter(c)) continue;
      (byKey[`${c.model}|${c.att}|${c.N}`] ??= {})[id] = { k: mean(c.K365), l: mean(c.reviews365) };
    }
  const keys = Object.keys(byKey);
  const s = Object.fromEntries(pool.map((i) => [i, 0]));
  for (const key of keys)
    for (const x of pool)
      if (!pool.some((y) => y !== x && dom({ ...byKey[key][y] }, byKey[key][x]))) s[x]++;
  return {
    cells: keys.length,
    share: Object.fromEntries(
      Object.entries(s).map(([i, n]) => [i, Number((n / keys.length).toFixed(3))]),
    ),
  };
}
const fam = (sh) => {
  const o = {};
  for (const [i, v] of Object.entries(sh.share)) {
    const p = i.split('/')[0];
    o[p] = Math.max(o[p] ?? 0, v);
  }
  return o;
};
const report = { decayAll: shares('decay', POOL), constN35: shares('const', POOL) };
const byAxis = {};
for (const ax of ['F21', 'G3-365', 'G3-180'])
  byAxis[ax] = shares(
    'decay',
    POOL.filter((i) => i.endsWith('/' + ax)),
  ).share;
report.decayPerAxis = byAxis;
console.log(
  JSON.stringify(
    {
      decay_familyBest: fam(report.decayAll),
      decay_all: report.decayAll,
      decay_perAxis: report.decayPerAxis,
      const_familyBest: fam(report.constN35),
      const_all: report.constN35,
    },
    null,
    1,
  ),
);
