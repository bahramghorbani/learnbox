// LB-B35 CP2 — characterizes learner-facing progression for repeated, on-time Known answers.
// Read-only instrument: drives the CP1 policy code; changes nothing shipped. No memory model.
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const wanted = process.argv[2] ?? 'ENG-CLAMP';
const cand =
  candidates().find(
    (c) => c.id.startsWith(wanted) && (!c.axis || /180|G3-180/.test(c.axis ?? '')),
  ) ?? candidates().find((c) => c.id.startsWith(wanted));
console.log('candidate:', cand.id);
const c = newCard();
let day = 0;
const firstAt = {};
const answers = [];
let prev = 1;
for (let n = 1; n <= 40; n += 1) {
  day = Math.max(day + 1, Math.ceil(c.dueDays));
  if (n === 1) day = 0;
  applyAnswer(cand, c, true, day);
  const b = boxOf(c.stab);
  answers.push({ n, day, box: b, interval: +(c.dueDays - day).toFixed(3) });
  if (b > prev) firstAt[b] ??= { answer: n, day };
  prev = b;
}
console.log('first time in each Box (consecutive on-time Known):', firstAt);
console.log(
  'Known answers that left the Box unchanged in first 12:',
  answers.slice(0, 12).filter((a, i, arr) => (i ? arr[i - 1].box : 1) === a.box).length,
  'of 12',
);
console.log(
  answers
    .slice(0, 14)
    .map((a) => `#${a.n}:B${a.box}(${a.interval}d)`)
    .join(' '),
);
