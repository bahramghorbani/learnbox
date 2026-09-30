// Simulator validity checks (run before any result is interpreted).
import { candidates } from './policies.mjs';
import { runOne } from './sim.mjs';
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fail++;
};
const d = { type: 'decay', m: 2, sigma: 0.5, G: 2.5, pNew: 0.5 };
const a = runOne(C['ENG-CLAMP/G3-365'], d, 'A2', 35, 7),
  b = runOne(C['ENG-CLAMP/G3-365'], d, 'A2', 35, 7);
ok(
  'deterministic (same seed, same output)',
  JSON.stringify(a.snapshots) === JSON.stringify(b.snapshots),
);
ok(
  'paired: different candidates share attendance+card params',
  (() => {
    const x = runOne(C['V1'], d, 'A3', 35, 9),
      y = runOne(C['LAD-R/F21'], d, 'A3', 35, 9);
    return x.attended === y.attended;
  })(),
);
let inRange = true;
for (const id of Object.keys(C)) {
  const s = runOne(C[id], d, 'A1', 35, 3);
  for (const k of [30, 90, 180, 365]) {
    const K = s.snapshots[k].K;
    if (!(K >= 0 && K <= 1)) inRange = false;
  }
}
ok('knowledge fraction within [0,1] for all candidates', inRange);
// Cross-check against CP0's independent simulation (constant recall, daily, 35 cards): recovery share at p=.85 / .65
const rec = (id, p) => {
  let r = 0,
    n = 0;
  for (let s = 1; s <= 40; s++) {
    const x = runOne(C[id], { type: 'const', p }, 'A1', 300, s);
    r += x.recovery;
    n += x.attended;
  }
  return r / n;
};
console.log(
  'INFO V1 recovery share N=300 p=.85:',
  rec('V1', 0.85).toFixed(3),
  ' p=.65:',
  rec('V1', 0.65).toFixed(3),
);
console.log(
  'INFO LAD-R/F21 recovery share N=300 p=.85:',
  rec('LAD-R/F21', 0.85).toFixed(3),
  ' p=.65:',
  rec('LAD-R/F21', 0.65).toFixed(3),
);
process.exit(fail ? 1 : 0);
