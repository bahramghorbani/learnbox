// CP8 remediated boundary sweep: Unknown drop, Box-5 cap, and Known no-skip at every Box boundary.
//
// Answers the "only sampled at one point" finding. Every injected stability is ledgered, and the
// sweep asserts a DISCRIMINATING property at each point rather than a tautology.
//
// Scope note, stated explicitly because the previous package left it implicit: stabilities are
// injected directly with SQL so the sweep can probe exact Box floors and ceilings (3.0, 7.0, 21.0)
// that V2 would never produce naturally. That makes the sweep stronger than a natural-progression
// test for boundary handling, and it is NOT a claim that V2 generates those values itself.
import {
  record,
  finish,
  ledger,
  submit,
  item,
  scheduleOf,
  ensureSchedule,
  setStability,
  boxOf,
  ENV_V2,
  closePool,
  L1,
} from './lib.mjs';

const CARD = 'cp8-lampe';
await ensureSchedule(L1, CARD, 'sweep fixture');

// Box lower bounds are [0, 1, 3, 7, 21]: probe just below and just above each boundary, plus the cap.
const UNKNOWN_POINTS = [0.5, 1.0, 1.5, 2.9, 3.0, 6.9, 7.0, 20.9, 21.0, 100, 180];
let seq = 0;
let unknownViolations = 0;
const unknownRows = [];

for (const stability of UNKNOWN_POINTS) {
  await setStability(L1, CARD, stability, `sweep: inject Box boundary probe ${stability}`);
  const before = await scheduleOf(L1, CARD);
  const fromBox = boxOf(before.stability_days);
  seq += 1;
  const r = await submit(L1, [item(CARD, 'unknown', `cp8-r2-sweep-u-${seq}`)], ENV_V2(), {
    cause: `sweep unknown from stability ${stability}`,
  });
  const after = await scheduleOf(L1, CARD);
  const toBox = boxOf(after.stability_days);
  // ENG-DROP: exactly one Box down, and Box 1 stays Box 1 (it cannot drop further).
  const expected = Math.max(1, fromBox - 1);
  const ok = r.status === 200 && toBox === expected;
  if (!ok) unknownViolations += 1;
  unknownRows.push(`${stability}:B${fromBox}->B${toBox}(exp B${expected})`);
}
record(
  'V2: Unknown drops exactly one Box at every Box boundary, and Box 1 never drops below 1',
  unknownViolations === 0,
  `${UNKNOWN_POINTS.length} cases: ${unknownRows.join(' ')}`,
);

// Box-5 cap: repeated Known at the ceiling must converge to exactly 180 and never exceed it.
await setStability(L1, CARD, 102.036672, 'sweep: inject Box-5 pre-cap value');
let capViolations = 0;
let maxSeen = 0;
for (let i = 0; i < 12; i += 1) {
  seq += 1;
  await submit(L1, [item(CARD, 'known', `cp8-r2-sweep-cap-${seq}`)], ENV_V2(), {
    cause: 'sweep Box-5 cap',
  });
  const s = Number((await scheduleOf(L1, CARD)).stability_days);
  maxSeen = Math.max(maxSeen, s);
  if (s > 180 + 1e-9) capViolations += 1;
}
const finalCap = Number((await scheduleOf(L1, CARD)).stability_days);
record(
  'V2: Box-5 180-day cap is never exceeded across 12 consecutive Known answers',
  capViolations === 0 && Math.abs(finalCap - 180) < 1e-9,
  `max=${maxSeen} final=${finalCap} violations=${capViolations}`,
);

// Known no-skip: from every boundary, a Known may advance at most one Box.
const KNOWN_POINTS = [0.5, 1.0, 2.9, 3.0, 6.9, 7.0, 20.9, 21.0, 180];
let skipViolations = 0;
const knownRows = [];
for (const stability of KNOWN_POINTS) {
  await setStability(L1, CARD, stability, `sweep: inject Known probe ${stability}`);
  const fromBox = boxOf((await scheduleOf(L1, CARD)).stability_days);
  seq += 1;
  await submit(L1, [item(CARD, 'known', `cp8-r2-sweep-k-${seq}`)], ENV_V2(), {
    cause: `sweep known from stability ${stability}`,
  });
  const toBox = boxOf((await scheduleOf(L1, CARD)).stability_days);
  if (toBox - fromBox > 1 || toBox < fromBox) skipViolations += 1;
  knownRows.push(`${stability}:B${fromBox}->B${toBox}`);
}
record(
  'V2: no Known transition skips a Box or moves backwards, at every Box boundary',
  skipViolations === 0,
  `${KNOWN_POINTS.length} cases: ${knownRows.join(' ')}`,
);

console.log(`sweep_submissions=${seq}`);
ledger({ kind: 'note', cause: `sweep completed with ${seq} V2 submissions on ${CARD}` });

const failures = finish('CP8_SWEEP');
await closePool();
process.exit(failures === 0 ? 0 : 1);
