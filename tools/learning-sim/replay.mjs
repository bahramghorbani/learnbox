// LB-B35 CP1 — replay of real history (G5 fidelity + candidate projection). Read-only.
// Usage: node replay.mjs <review_events.copy> <card_schedules.copy>
// Output carries NO user/card identifiers: only ordinals and relative time.

import { readFileSync } from 'node:fs';
import { scheduleReview } from '../../packages/learning-engine/dist/index.js';
import { applyAnswer, boxOf, candidates, DAY_MS, newCard } from './policies.mjs';

const parse = (path) =>
  readFileSync(path, 'utf8').split('\n').slice(1).filter((l) => l && l !== '\\.').map((l) => l.split('\t'));
const events = parse(process.argv[2]).map((r) => ({
  user: r[1], card: r[2], grade: r[3], at: Date.parse(r[4].replace(' ', 'T').replace(/\+00$/, 'Z')), cursor: Number(r[7]),
}));
const schedules = new Map(
  parse(process.argv[3]).map((r) => [`${r[0]}|${r[1]}`, {
    state: r[2], stab: Number(r[3]), diff: Number(r[4]), lapses: Number(r[5]), due: Date.parse(r[6].replace(' ', 'T').replace(/\+00$/, 'Z')),
  }]),
);

// Stable anonymous ordinals.
const userOrd = new Map(); const cardOrd = new Map();
const ord = (m, k, p) => { if (!m.has(k)) m.set(k, `${p}${m.size + 1}`); return m.get(k); };
for (const u of [...new Set(events.map((e) => e.user))].sort()) ord(userOrd, u, 'U');

const byKey = new Map();
for (const e of events.sort((a, b) => a.cursor - b.cursor)) {
  const k = `${e.user}|${e.card}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(e);
}

const INITIAL = { state: 'new', stabilityDays: 1 / 24, difficulty: 5, lapses: 0 };
const cardsWithEvents = [...byKey.keys()];
const rows = []; let exact = 0; let compared = 0; const mismatches = [];
for (const k of cardsWithEvents) {
  const hist = byKey.get(k);
  let sch = { ...INITIAL, dueAt: new Date(hist[0].at) };
  for (const e of hist) sch = scheduleReview(sch, e.grade, new Date(e.at));
  const real = schedules.get(k);
  if (!real) { mismatches.push({ k: 'missing-schedule' }); continue; }
  compared++;
  const same =
    Math.abs(real.stab - sch.stabilityDays) < 1e-7 && Math.abs(real.diff - sch.difficulty) < 1e-9 &&
    real.lapses === sch.lapses && real.state === sch.state && Math.abs(real.due - sch.dueAt.getTime()) < 2;
  if (same) exact++;
  else mismatches.push({ user: userOrd.get(k.split('|')[0]), card: ord(cardOrd, k, 'C'), real, replay: { stab: sch.stabilityDays, diff: sch.difficulty, lapses: sch.lapses, state: sch.state, due: sch.dueAt.getTime() } });
  rows.push({ k, hist, realBox: boxOf(real.stab), user: userOrd.get(k.split('|')[0]) });
}
const g5 = { cardsWithEvents: cardsWithEvents.length, compared, exactMatches: exact, mismatches: mismatches.length };
console.log('G5', JSON.stringify(g5));
if (mismatches.length) console.log('MISMATCH-SAMPLE', JSON.stringify(mismatches.slice(0, 3)));

// Projection: forgot->Unknown, hard/remembered/mastered->Known. Owner account = user with most events.
const counts = {}; for (const e of events) counts[e.user] = (counts[e.user] || 0) + 1;
const owner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
const t0 = Math.min(...events.map((e) => e.at));
const out = {};
for (const cand of candidates()) {
  const boxes = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let maxIv = 0;
  for (const r of rows) {
    if (r.k.split('|')[0] !== owner) continue;
    const c = newCard(); c.dueDays = 0;
    for (const e of r.hist) {
      applyAnswer(cand, c, e.grade !== 'forgot', (e.at - t0) / DAY_MS);
      maxIv = Math.max(maxIv, c.dueDays - (e.at - t0) / DAY_MS);
    }
    boxes[boxOf(c.stab)]++;
  }
  out[cand.id] = { boxes, maxIntervalDays: Number(maxIv.toFixed(2)) };
}
const real = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (const r of rows) if (r.k.split('|')[0] === owner) real[r.realBox]++;
const ownerEvents = events.filter((e) => e.user === owner);
const span = (Math.max(...ownerEvents.map((e) => e.at)) - Math.min(...ownerEvents.map((e) => e.at))) / DAY_MS;
console.log('OWNER', JSON.stringify({ events: ownerEvents.length, cards: rows.filter((r) => r.user === userOrd.get(owner)).length, spanDays: Number(span.toFixed(2)), grades: ownerEvents.reduce((a, e) => ((a[e.grade] = (a[e.grade] || 0) + 1), a), {}), realBoxes: real }));
console.log('PROJECTION', JSON.stringify(out, null, 0));
