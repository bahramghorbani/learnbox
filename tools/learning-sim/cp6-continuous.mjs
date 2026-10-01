// LB-B35 CP6 — continuous-time characterization: the learner answers EXACTLY when the card is due
// (opens the app whenever something is due). Contrast with the once-a-day traces. No memory model.
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
const fmtT = (d) => (d < 1 ? `${Math.round(d * 24 * 10) / 10}h` : `${Number(d.toFixed(1))}d`);
for (const id of [
  'ENG-DROP/G3-180',
  'GR-1.8/G3-180',
  'GR-2.5/G3-180',
  'GR-3/G3-180',
  'LAD-B/G3-180',
]) {
  const c = newCard();
  let t = 0;
  const reach = {};
  const gaps = [];
  let prev = 1;
  for (let n = 1; n <= 14; n++) {
    applyAnswer(C[id], c, true, t);
    const b = boxOf(c.stab);
    gaps.push(fmtT(c.dueDays - t));
    if (b > prev) reach[b] = `#${n} @ ${fmtT(t)}`;
    prev = b;
    t = c.dueDays;
  }
  const first5 = gaps.slice(0, 5).join(', ');
  console.log(
    id.replace('/G3-180', '').padEnd(10),
    'Known#/elapsed at first entry of Box 2,3,4,5:',
    JSON.stringify(reach),
    ' | first five gaps:',
    first5,
  );
}
