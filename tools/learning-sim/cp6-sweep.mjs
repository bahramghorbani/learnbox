// LB-B35 CP6 — deterministic stall sweep (no memory model). Which growth factors bound how long a card
// can sit in one Box under consecutive on-time Known answers? Session-per-day, like traces.mjs.
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
for (const id of [
  'ENG-CLAMP/G3-180',
  'ENG-DROP/G3-180',
  'GR-1.8/G3-180',
  'GR-2.2/G3-180',
  'GR-2.5/G3-180',
  'GR-3/G3-180',
  'LAD-B/G3-180',
]) {
  const c = newCard();
  let day = 0;
  const seq = [];
  let prev = 1,
    run = 0,
    worst = 0,
    first = {};
  for (let n = 1; n <= 16; n++) {
    day = c.state === 'new' ? 0 : Math.max(day + 1, Math.ceil(c.dueDays));
    applyAnswer(C[id], c, true, day);
    const b = boxOf(c.stab);
    if (prev < 5) {
      run = b === prev ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    if (b > prev) first[b] ??= `a${n}/d${day}`;
    seq.push(b);
    prev = b;
  }
  console.log(
    id.padEnd(18),
    'boxes',
    seq.join(''),
    ' maxStall',
    worst,
    ' firstAt',
    JSON.stringify(first),
  );
}
