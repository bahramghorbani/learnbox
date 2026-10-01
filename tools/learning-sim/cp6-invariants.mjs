// LB-B35 CP6 — exhaustive transition-invariant check over a dense stability grid (log-spaced 10 min .. 400 d,
// plus every Box edge +/- float epsilons). Counts violations of each candidate invariant. No memory model.
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
const grid = new Set();
for (let i = 0; i <= 4000; i++) grid.add((10 / 1440) * (400 / (10 / 1440)) ** (i / 4000));
for (const e of [1, 3, 7, 21, 180])
  for (const d of [-1e-3, -1e-9, -1e-12, 0, 1e-12, 1e-9, 1e-3]) grid.add(e + d);
const stabs = [...grid].filter((x) => x > 0);
for (const id of [
  'ENG-CLAMP/G3-180',
  'ENG-DROP/G3-180',
  'GR-1.8/G3-180',
  'GR-2.5/G3-180',
  'GR-3/G3-180',
  'LAD-B/G3-180',
]) {
  const v = {
    knownLowers: 0,
    knownRaisesGT1: 0,
    knownStuckBelow5: 0,
    unknownRaises: 0,
    unknownDropNot1: 0,
    unknownBox1Moves: 0,
    b5Over180: 0,
    n: stabs.length,
  };
  for (const s of stabs) {
    const b0 = boxOf(s);
    const k = { ...newCard(), state: 'review', stab: s, dueDays: 0, lastDays: 0 };
    applyAnswer(C[id], k, true, 10);
    const u = { ...newCard(), state: 'review', stab: s, dueDays: 0, lastDays: 0 };
    applyAnswer(C[id], u, false, 10);
    const bk = boxOf(k.stab),
      bu = boxOf(u.stab);
    if (bk < b0) v.knownLowers++;
    if (bk - b0 > 1) v.knownRaisesGT1++;
    if (b0 < 5 && bk === b0) v.knownStuckBelow5++;
    if (bu > b0) v.unknownRaises++;
    if (b0 >= 2 && b0 - bu !== 1) v.unknownDropNot1++;
    if (b0 === 1 && bu !== 1) v.unknownBox1Moves++;
    if (k.stab > 180 + 1e-9) v.b5Over180++;
  }
  console.log(id.replace('/G3-180', '').padEnd(10), JSON.stringify(v));
}
