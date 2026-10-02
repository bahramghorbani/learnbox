// CP8 remediated end-to-end proof: V1 equivalence, V2 activation behaviour, provenance, idempotency.
//
// Every assertion here is written to FAIL if the feature under test were absent or broken. Where V1
// and V2 would produce the same arithmetic (V1's `remembered` factor is 1.8 and GR-1.8's multiplier
// is also 1.8), the test uses a Box-1 card, which is the only input where the two engines genuinely
// diverge: V1 gives 0.0417 * 1.8 = 0.075 and the card stays in Box 1, while V2 graduates it to
// exactly 1.0 day and the card moves to Box 2.
import { readFileSync } from 'node:fs';
import {
  pool,
  record,
  finish,
  submit,
  item,
  scheduleOf,
  ensureSchedule,
  countEvents,
  eventDigest,
  scheduleDigest,
  boxOf,
  ENV_V1,
  ENV_V2,
  runtime,
  closePool,
  L1,
  L2,
  L3,
  L4,
} from './lib.mjs';

const BOX1 = 'cp8-stuhl'; // seeded 0.0416666667 -> Box 1. The discriminating fixture.
const MID = 'cp8-buch'; // seeded 1.8 -> Box 2.
const TRACE = 'cp8-haus'; // seeded 1.0 -> Box 2 for L1; fresh row for L3's pinned trace.
const LAMP = 'cp8-lampe'; // seeded 0.0416666667 -> Box 1, used for V1 equivalence.

// ============================================================ 1. V1 EQUIVALENCE, FLAG OFF
{
  const before = await scheduleOf(L1, LAMP);
  const r = await submit(L1, [item(LAMP, 'known', 'cp8-r2-v1-box1')], ENV_V1(), {
    cause: 'V1 equivalence',
  });
  const after = await scheduleOf(L1, LAMP);
  const expectedV1 = Number(before.stability_days) * 1.8;

  record(
    'flag OFF: request accepted through the real web path',
    r.status === 200,
    `status=${r.status}`,
  );
  record(
    'flag OFF: Box-1 card follows V1 arithmetic (x1.8), NOT GR-1.8 graduation',
    Math.abs(Number(after.stability_days) - expectedV1) < 1e-9,
    `${before.stability_days} -> ${after.stability_days} (V1 expects ${expectedV1}, V2 would give 1)`,
  );
  record(
    'flag OFF: V2 graduation did NOT happen (card stays in Box 1)',
    boxOf(after.stability_days) === 1 && Number(after.stability_days) !== 1,
    `box=${boxOf(after.stability_days)} stability=${after.stability_days}`,
  );

  const ev = await pool.query(
    "select engine_version, response, grade from review_events where client_event_id = 'cp8-r2-v1-box1'",
  );
  record(
    'flag OFF: event written with engine_version NULL (V1 provenance)',
    ev.rows.length === 1 && ev.rows[0].engine_version === null,
    `rows=${ev.rows.length} engine_version=${ev.rows[0]?.engine_version}`,
  );
  record(
    'flag OFF: binary response still recorded (CP4/0023 column in use)',
    ev.rows[0]?.response === 'known',
    `response=${ev.rows[0]?.response}`,
  );
}

// ============================================================ 2. FORWARD-ONLY ACTIVATION
{
  const beforeSched = await scheduleDigest();
  const beforeEvents = await countEvents();
  runtime.webReviewDependenciesFromEnvironment(ENV_V2()); // construct the V2 runtime, submit nothing
  const afterSched = await scheduleDigest();
  const afterEvents = await countEvents();
  record(
    'activation alone rewrites no existing schedule',
    beforeSched === afterSched,
    `schedule digest ${beforeSched === afterSched ? 'identical' : 'CHANGED'}`,
  );
  record(
    'activation alone writes no review event',
    afterEvents === beforeEvents,
    `events ${beforeEvents} -> ${afterEvents}`,
  );
}

// ============================================================ 3. V2 BOX-1 GRADUATION (DISCRIMINATING)
{
  const before = await scheduleOf(L4, BOX1);
  const r = await submit(L4, [item(BOX1, 'known', 'cp8-r2-v2-box1')], ENV_V2(), {
    cause: 'V2 Box-1 graduation',
  });
  const after = await scheduleOf(L4, BOX1);
  const v1Would = Number(before.stability_days) * 1.8;

  record(
    'V2: existing Box-1 card advances on its next future Known',
    r.status === 200,
    `status=${r.status}`,
  );
  record(
    'V2: Box-1 graduates to exactly 1.0 day (GR-1.8 base), not V1 x1.8',
    Math.abs(Number(after.stability_days) - 1) < 1e-9 &&
      Math.abs(Number(after.stability_days) - v1Would) > 0.9,
    `${before.stability_days} -> ${after.stability_days} (V1 would be ${v1Would.toFixed(4)})`,
  );
  record(
    'V2: Box advances exactly one step (1 -> 2)',
    boxOf(before.stability_days) === 1 && boxOf(after.stability_days) === 2,
    `box ${boxOf(before.stability_days)} -> ${boxOf(after.stability_days)}`,
  );

  const ev = await pool.query(
    "select engine_version, response, grade from review_events where client_event_id = 'cp8-r2-v2-box1'",
  );
  record(
    'V2: event stamped engine_version=2',
    ev.rows[0]?.engine_version === 2,
    `engine_version=${ev.rows[0]?.engine_version}`,
  );
  record(
    'V2: known carries shadow legacy grade=remembered and response=known',
    ev.rows[0]?.response === 'known' && ev.rows[0]?.grade === 'remembered',
    `response=${ev.rows[0]?.response} grade=${ev.rows[0]?.grade}`,
  );
}

// ============================================================ 4. UNKNOWN DROPS EXACTLY ONE BOX
{
  const before = await scheduleOf(L2, MID); // Box 2
  const r = await submit(L2, [item(MID, 'unknown', 'cp8-r2-v2-unknown')], ENV_V2(), {
    cause: 'V2 unknown drop',
  });
  const after = await scheduleOf(L2, MID);
  record('V2: unknown accepted', r.status === 200, `status=${r.status}`);
  record(
    'V2: unknown drops exactly one Box (ENG-DROP)',
    boxOf(after.stability_days) === boxOf(before.stability_days) - 1,
    `box ${boxOf(before.stability_days)} -> ${boxOf(after.stability_days)} ` +
      `(stability ${before.stability_days} -> ${after.stability_days})`,
  );
  const ev = await pool.query(
    "select response, grade, engine_version from review_events where client_event_id = 'cp8-r2-v2-unknown'",
  );
  record(
    'V2: unknown stored as response=unknown with shadow legacy grade=forgot',
    ev.rows[0]?.response === 'unknown' && ev.rows[0]?.grade === 'forgot',
    `response=${ev.rows[0]?.response} grade=${ev.rows[0]?.grade}`,
  );
}

// ============================================================ 5. PINNED CP6 PROGRESSION TRACE
{
  await ensureSchedule(L3, TRACE, 'pinned trace fixture (explicit, not lazy)');
  const observed = [];
  for (let i = 0; i < 10; i += 1) {
    await submit(L3, [item(TRACE, 'known', `cp8-r2-trace-${i}`)], ENV_V2(), {
      cause: 'pinned CP6 trace',
    });
    const s = await scheduleOf(L3, TRACE);
    observed.push({ box: boxOf(s.stability_days), stability: Number(s.stability_days) });
  }
  // NF-5: the pinned expectation is PARSED from the committed CP6 artifact rather than retyped
  // here, so the doc's "matches the CP6 pin" claim is mechanically auditable instead of asserted.
  // The pin records display-rounded days (1.8d, 3.2d, ...) plus the Box per step; we check the Box
  // sequence exactly and each stability to the pin's own displayed precision.
  const grSection = readFileSync('docs/evidence/cp6/traces.txt', 'utf8').split('## ');
  const gr18 = grSection.find((s) => s.startsWith('GR-1.8/G3-180'));
  if (!gr18) {
    console.error('FATAL: GR-1.8/G3-180 section missing from CP6 pin');
    process.exit(1);
  }
  const pinS1 = gr18.split(/\n/).find((l) => /S1 Known x14 from new/.test(l));
  if (!pinS1) {
    console.error('FATAL: GR-1.8 S1 trace missing from CP6 pin');
    process.exit(1);
  }
  const pinSteps = [...pinS1.matchAll(/K→B(\d)\(([\d.]+)(d|m)\)/g)].slice(0, 10).map((m) => ({
    box: Number(m[1]),
    days: m[3] === 'm' ? Number(m[2]) / 1440 : Number(m[2]),
    printed: m[2], // the pin's own printed form, e.g. "10" or "3.2"
    unit: m[3],
  }));
  // Rounds x to the number of significant digits the pin actually printed, so the comparison is an
  // EXACT match at the pin's precision rather than an invented tolerance.
  const toPinPrecision = (x, printed) => {
    const digits = printed.replace('.', '').replace(/^0+/, '').length;
    if (x === 0) return 0;
    const mag = Math.floor(Math.log10(Math.abs(x)));
    const f = 10 ** (digits - 1 - mag);
    return Math.round(x * f) / f;
  };
  console.log(
    `pin_source=docs/evidence/cp6/traces.txt pin_steps=${pinSteps.map((p) => `B${p.box}:${p.days}`).join(' ')}`,
  );
  record(
    'V2: pinned CP6 trace parsed from the committed artifact (not retyped) and has 10 steps',
    pinSteps.length === 10,
    `parsed=${pinSteps.length}`,
  );

  const expected = [1, 1.8, 3.24, 5.832, 10.4976, 18.89568, 34.012224, 102.036672, 180, 180];
  record(
    "V2: hardcoded expectation reproduces the committed CP6 pin EXACTLY at the pin's precision",
    pinSteps.every(
      (p, i) =>
        p.box === boxOf(expected[i]) &&
        Math.abs(toPinPrecision(expected[i], p.printed) - p.days) < 1e-9,
    ),
    pinSteps.map((p, i) => `${p.days}==${toPinPrecision(expected[i], p.printed)}`).join(' '),
  );
  record(
    'V2: pinned CP6 progression trace reproduced end-to-end through the real path',
    observed.every((o, i) => Math.abs(o.stability - expected[i]) < 1e-6),
    observed.map((o) => `B${o.box}:${o.stability.toFixed(3)}`).join(' '),
  );
  record(
    'V2: observed Box sequence matches the committed CP6 pin Box-for-Box',
    observed.every((o, i) => o.box === pinSteps[i].box),
    `observed=${observed.map((o) => o.box).join('')} pin=${pinSteps.map((p) => p.box).join('')}`,
  );
  record(
    'V2: Box-5 180-day cap holds; no value exceeds the cap',
    observed.every((o) => o.stability <= 180 + 1e-9) && observed.at(-1).stability === 180,
    `max=${Math.max(...observed.map((o) => o.stability))} final=${observed.at(-1).stability}`,
  );
  // NF-3: bidirectional. The previous form (diff <= 1) was satisfied by a BACKWARD move on Known,
  // so a regression that demoted a card on a correct answer would have passed unnoticed.
  record(
    'V2: no Known transition skips a Box or moves backwards',
    observed.every(
      (o, i) => i === 0 || (o.box - observed[i - 1].box <= 1 && o.box >= observed[i - 1].box),
    ),
    observed.map((o) => o.box).join('->'),
  );
}

// ============================================================ 6. ENGINE_VERSION PARTITION
{
  const rows = (
    await pool.query(
      'select client_event_id, engine_version from review_events order by client_event_id',
    )
  ).rows;
  const v2Written = new Set([
    'cp8-r2-v2-box1',
    'cp8-r2-v2-unknown',
    ...Array.from({ length: 10 }, (_, i) => `cp8-r2-trace-${i}`),
  ]);
  const wrongly2 = rows.filter((r) => r.engine_version === 2 && !v2Written.has(r.client_event_id));
  const missing2 = rows.filter((r) => r.engine_version !== 2 && v2Written.has(r.client_event_id));
  const bad = rows.filter((r) => r.engine_version !== null && r.engine_version !== 2);
  record(
    'engine_version = 2 appears ONLY on events written under V2',
    wrongly2.length === 0,
    `unexpected_v2=${wrongly2.map((r) => r.client_event_id).join(',') || 'none'}`,
  );
  record(
    'every event written under V2 is stamped 2',
    missing2.length === 0,
    `missing=${missing2.map((r) => r.client_event_id).join(',') || 'none'}`,
  );
  record('no event carries an out-of-range engine_version', bad.length === 0, `bad=${bad.length}`);
}

// ============================================================ 7. IDEMPOTENCY
{
  const beforeEvents = await countEvents();
  const beforeDigest = await eventDigest();
  const beforeSched = await scheduleDigest();
  const occurredAt = (
    await pool.query(
      "select occurred_at from review_events where client_event_id = 'cp8-r2-v2-box1'",
    )
  ).rows[0].occurred_at.toISOString();
  const r = await submit(L4, [item(BOX1, 'known', 'cp8-r2-v2-box1', occurredAt)], ENV_V2(), {
    cause: 'idempotent replay (expected: no write)',
  });
  const afterEvents = await countEvents();
  record(
    'replaying an identical event writes nothing new',
    afterEvents === beforeEvents && (await eventDigest()) === beforeDigest,
    `events ${beforeEvents} -> ${afterEvents} status=${r.status} outcome=${r.outcome}`,
  );
  record(
    'replay does not re-advance the schedule',
    (await scheduleDigest()) === beforeSched,
    `schedule digest ${(await scheduleDigest()) === beforeSched ? 'identical' : 'CHANGED'}`,
  );
}

const failures = finish('CP8_E2E');
await closePool();
process.exit(failures === 0 ? 0 : 1);
