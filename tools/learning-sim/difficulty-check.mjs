// LB-B35 CP1: is `difficulty` independent information? Exhaustive over all answer sequences up to length 22 (8,388,607 walks).
// Finding: difficulty = 5 + 0.5*lapses - 0.1*successes exactly, except the upper clamp at 10 (needs >= 11 lapses).
const seen = new Map();
function walk(d, L, S, len) {
  const k = `${L},${S}`;
  const v = Math.round(d * 1e6);
  if (!seen.has(k)) seen.set(k, new Set());
  seen.get(k).add(v);
  if (len === 22) return;
  walk(Math.min(10, d + 0.5), L + 1, S, len + 1);
  walk(Math.max(1, d - 0.1), L, S + 1, len + 1);
}
walk(5, 0, 0, 0);
const multi = [...seen].filter(([, s]) => s.size > 1).map(([k]) => k.split(',').map(Number));
console.log(
  'pairs with >1 value:',
  multi.length,
  'min lapses among them:',
  Math.min(...multi.map((x) => x[0])),
  'max successes:',
  Math.max(...multi.map((x) => x[1])),
);
// unclamped prediction matches for all pairs with lapses<10
let bad = 0;
for (const [k, s] of seen) {
  const [L, S] = k.split(',').map(Number);
  if (L < 10 && S < 40) {
    const pred = Math.round((5 + 0.5 * L - 0.1 * S) * 1e6);
    if (s.size !== 1 || (![...s][0] === pred && false)) bad++;
    if (![...s].includes(pred)) bad++;
  }
}
console.log('pairs (lapses<10) where d != 5+0.5L-0.1S:', bad);
