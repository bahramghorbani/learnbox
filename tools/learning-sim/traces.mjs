// LB-B35 CP1 A11 — scripted single-card traces (no memory model). One session per day.
import { applyAnswer, boxOf, candidates, newCard } from './policies.mjs';
const SCRIPTS = {
  'K x12': 'K'.repeat(12),
  'U x6': 'U'.repeat(6),
  'KU x12': 'KU'.repeat(6),
  'KKU x8': 'KKU'.repeat(3) + 'KK',
  'K x10 then U x3': 'K'.repeat(10) + 'UUU',
  'K to Box5 then U,K,K,K': 'K'.repeat(14) + 'UKKK',
};
const fmt = (d) => (d < 1 ? `${Math.round(d * 1440)}m` : `${Number(d.toFixed(d < 10 ? 1 : 0))}d`);
const out = {};
for (const cand of candidates().filter(
  (c) => !c.axis || c.axis === 'G3-365' || c.policy === 'V1',
)) {
  out[cand.id] = {};
  for (const [name, script] of Object.entries(SCRIPTS)) {
    const c = newCard();
    let day = 0;
    const seq = [];
    for (const ch of script) {
      // session-per-day: a card becomes answerable at the first day >= due
      day = Math.max(day + 1, Math.ceil(c.dueDays));
      if (c.state === 'new') day = 0;
      applyAnswer(cand, c, ch === 'K', day);
      seq.push(`${ch}→B${boxOf(c.stab)}(${fmt(c.dueDays - day)})`);
    }
    out[cand.id][name] = { seq: seq.join(' '), endDay: day };
  }
}
for (const [id, scripts] of Object.entries(out)) {
  console.log('\n##', id);
  for (const [n, v] of Object.entries(scripts))
    console.log(' ', n.padEnd(24), 'day', String(v.endDay).padStart(4), v.seq);
}
