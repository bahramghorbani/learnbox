// LB-B35 CP6 — compatibility of EXISTING card_schedules rows with each candidate (real rows from the CP1 backup copy).
// 1) Box is derived from stored stability: no row moves Box at activation (checked below).
// 2) What the NEXT Known / Unknown does to each real row under each candidate.
import { readFileSync } from 'node:fs';
import { applyAnswer, boxOf, candidates } from './policies.mjs';
const rows = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .slice(1)
  .filter((l) => l && l !== '\\.')
  .map((l) => l.split('\t'))
  .map((r) => ({
    state: r[2],
    stab: Number(r[3]),
    diff: Number(r[4]),
    lapses: Number(r[5]),
    dueDays: 0,
    lastDays: null,
  }));
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
const hist = [0, 0, 0, 0, 0, 0];
for (const r of rows) hist[boxOf(r.stab)]++;
console.log(
  'rows',
  rows.length,
  'Box histogram (stored, v1.2.1 thresholds):',
  JSON.stringify(hist.slice(1)),
  'stab range',
  Math.min(...rows.map((r) => r.stab)).toFixed(4),
  '-',
  Math.max(...rows.map((r) => r.stab)).toFixed(4),
);
for (const id of [
  'ENG-DROP/G3-180',
  'GR-1.8/G3-180',
  'GR-2.5/G3-180',
  'GR-3/G3-180',
  'LAD-B/G3-180',
]) {
  const moved = { K: 0, KBoxUp: 0, U: 0, UDown: 0 };
  const after = [0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const b0 = boxOf(r.stab);
    const k = { ...r };
    applyAnswer(C[id], k, true, 10);
    const u = { ...r };
    applyAnswer(C[id], u, false, 10);
    if (boxOf(k.stab) > b0) moved.KBoxUp++;
    if (boxOf(u.stab) < b0) moved.UDown++;
    after[boxOf(k.stab)]++;
  }
  console.log(
    id.replace('/G3-180', '').padEnd(10),
    'next Known raises the Box for',
    moved.KBoxUp,
    'of',
    rows.length,
    'rows; next Unknown lowers the Box for',
    moved.UDown,
    '; Box histogram after one Known:',
    JSON.stringify(after.slice(1)),
  );
}
