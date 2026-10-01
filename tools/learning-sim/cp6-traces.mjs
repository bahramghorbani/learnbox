// LB-B35 CP6 — learner-visible Box/interval traces for scripted answer sequences. No memory model.
// Session-per-day: a card is answered on the first day >= due (on time). K=«بلد بودم», U=«بلد نیستم».
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const C = Object.fromEntries(candidates().map((c) => [c.id, c]));
const IDS = ['ENG-DROP/G3-180', 'GR-1.8/G3-180', 'GR-2.5/G3-180', 'GR-3/G3-180', 'LAD-B/G3-180'];
const fmt = (d) =>
  d < 1 ? `${Math.max(1, Math.round(d * 1440))}m` : `${Number(d.toFixed(d < 10 ? 1 : 0))}d`;
const rep = (s, n) => s.repeat(n);
const SCRIPTS = {
  'S1 Known x14 from new': rep('K', 14),
  'S2 KU alternating x8': rep('KU', 8),
  'S3 KKU x5': rep('KKU', 5),
  'S4 Known x12 then Unknown x3 (from deep)': rep('K', 12) + 'UUU',
  'S5 Unknown x4 from new': 'UUUU',
  'S6 Known x6, U, then K x6 (recovery)': rep('K', 6) + 'U' + rep('K', 6),
  'S7 Known x16 (long-term, Box 5 growth)': rep('K', 16),
};
const out = {};
for (const id of IDS) {
  out[id] = {};
  for (const [name, script] of Object.entries(SCRIPTS)) {
    const c = newCard();
    let day = 0;
    const seq = [];
    let prev = 1,
      run = 0,
      worst = 0;
    for (const ch of script) {
      day = c.state === 'new' ? 0 : Math.max(day + 1, Math.ceil(c.dueDays));
      applyAnswer(C[id], c, ch === 'K', day);
      const b = boxOf(c.stab);
      if (ch === 'K' && prev < 5) {
        run = b === prev ? run + 1 : 0;
        worst = Math.max(worst, run);
      } else if (ch === 'U') run = 0;
      seq.push(`${ch}→B${b}(${fmt(c.dueDays - day)})`);
      prev = b;
    }
    out[id][name] = { endDay: day, worst, seq: seq.join(' ') };
  }
}
// Unknown from Boxes 2–5: put a card exactly in Box b (by Known answers), then answer Unknown once.
const fromBox = {};
for (const id of IDS) {
  fromBox[id] = {};
  for (const target of [2, 3, 4, 5]) {
    const c = newCard();
    let day = 0,
      guard = 0;
    while (boxOf(c.stab) < target && guard++ < 40) {
      day = c.state === 'new' ? 0 : Math.max(day + 1, Math.ceil(c.dueDays));
      applyAnswer(C[id], c, true, day);
    }
    // Box 5: also let it grow to the cap so the deepest case is measured
    if (target === 5)
      for (let i = 0; i < 4; i++) {
        day = Math.max(day + 1, Math.ceil(c.dueDays));
        applyAnswer(C[id], c, true, day);
      }
    const before = `B${boxOf(c.stab)}(next ${fmt(c.dueDays - day)})`;
    day = Math.max(day + 1, Math.ceil(c.dueDays));
    applyAnswer(C[id], c, false, day);
    const after = `B${boxOf(c.stab)}(${fmt(c.dueDays - day)})`;
    day = Math.max(day + 1, Math.ceil(c.dueDays));
    applyAnswer(C[id], c, true, day);
    const rec = `then K→B${boxOf(c.stab)}(${fmt(c.dueDays - day)})`;
    fromBox[id][`from Box ${target}`] = `${before}  --U-->  ${after}  ${rec}`;
  }
}
console.log(JSON.stringify({ out, fromBox }));
if (process.argv[2] === 'text') {
  for (const id of IDS) {
    console.log('\n##', id);
    for (const [n, v] of Object.entries(out[id]))
      console.log(
        ' ',
        n.padEnd(42),
        `day ${String(v.endDay).padStart(4)} maxStall ${v.worst}  ${v.seq}`,
      );
    for (const [n, v] of Object.entries(fromBox[id])) console.log('  Unknown', n.padEnd(11), v);
  }
}
