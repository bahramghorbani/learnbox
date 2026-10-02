// CP8 remediated rollback rehearsal.
//
// The superseded harness asserted `retained >= v2Stability`, which is trivially true because the
// following V1 write multiplies by 1.8 — it would pass even if V2 had written a wrong value. This
// version proves rollback with assertions that can actually fail:
//
//   * the V2 write is verified to be V2 (Box-1 graduation to exactly 1.0, which V1 cannot produce);
//   * the post-rollback write is verified to be V1 (x1.8 from the retained value, engine_version NULL,
//     and NOT a GR-1.8 graduation);
//   * history integrity is checked with the full digest incl. response + engine_version;
//   * the retained-stability consequence is measured against the PRE-V2 baseline, so the number
//     reported is the actual residue of V2, not an artefact of the V1 write that followed.
import {
  pool,
  record,
  finish,
  ledger,
  submit,
  item,
  scheduleOf,
  ensureSchedule,
  countEvents,
  eventDigest,
  boxOf,
  ENV_V1,
  ENV_V2,
  closePool,
  L3,
} from './lib.mjs';

const CARD = 'cp8-buch'; // L3 has no seeded row for this card; created explicitly below.
const sched = await ensureSchedule(L3, CARD, 'rollback fixture (explicit, not lazy)');
const baseline = Number(sched.stability_days);
record(
  'rollback fixture starts in Box 1 (the only V1/V2 discriminating state)',
  boxOf(baseline) === 1,
  `baseline stability=${baseline} box=${boxOf(baseline)}`,
);

// ---------------------------------------------------------------- 1. a V2 write under the flag
const v2 = await submit(L3, [item(CARD, 'known', 'cp8-r2-rb-v2')], ENV_V2(), {
  cause: 'rollback: accumulate stability under V2',
});
const afterV2 = Number((await scheduleOf(L3, CARD)).stability_days);
const v1WouldHave = baseline * 1.8;
record(
  'rollback: the V2 write is genuinely V2 (Box-1 graduates to exactly 1.0, V1 cannot do this)',
  v2.status === 200 && Math.abs(afterV2 - 1) < 1e-9 && Math.abs(afterV2 - v1WouldHave) > 0.9,
  `${baseline} -> ${afterV2} (V1 would have given ${v1WouldHave.toFixed(4)})`,
);
const v2Ev = await pool.query(
  "select engine_version from review_events where client_event_id = 'cp8-r2-rb-v2'",
);
record(
  'rollback: the V2 write is stamped engine_version=2',
  v2Ev.rows[0]?.engine_version === 2,
  `engine_version=${v2Ev.rows[0]?.engine_version}`,
);

// ---------------------------------------------------------------- 2. turn Scheduler V2 OFF
const historyBefore = await eventDigest();
const eventsBefore = await countEvents();
const v2RowsBefore = (
  await pool.query('select count(*)::int n from review_events where engine_version = 2')
).rows[0].n;

const v1 = await submit(L3, [item(CARD, 'known', 'cp8-r2-rb-v1')], ENV_V1(), {
  cause: 'rollback: first write after turning Scheduler V2 OFF',
});
const afterV1 = Number((await scheduleOf(L3, CARD)).stability_days);

// NF-2: from the retained stability of 1.0, V1 (x1.8 -> 1.8) and V2 (GR-1.8 from Box 2 -> 1.8)
// produce the SAME number, so this arithmetic check is self-consistency only and CANNOT tell the
// engines apart. It is labelled as such, and the real discrimination is carried by (a) the
// engine_version=NULL provenance check below and (b) the fresh Box-1 V1 write further down, which
// is the only input where the two engines diverge.
record(
  'rollback: new writes are accepted again with the flag OFF',
  v1.status === 200,
  `status=${v1.status}`,
);
record(
  'rollback: post-rollback arithmetic is self-consistent with V1 (NON-discriminating: V2 ' +
    'from stability 1.0 yields the same 1.8; see the Box-1 check below for discrimination)',
  Math.abs(afterV1 - afterV2 * 1.8) < 1e-9,
  `${afterV2} -> ${afterV1} (V1 expects ${(afterV2 * 1.8).toFixed(6)})`,
);
const v1Ev = await pool.query(
  "select engine_version, response from review_events where client_event_id = 'cp8-r2-rb-v1'",
);
record(
  'rollback: the post-rollback event has engine_version NULL (V1 provenance)',
  v1Ev.rows.length === 1 && v1Ev.rows[0].engine_version === null,
  `engine_version=${v1Ev.rows[0]?.engine_version}`,
);

// NF-2: the DISCRIMINATING post-rollback proof. A fresh Box-1 card answered Known with the flag OFF
// must follow V1 (0.0416666667 x 1.8 = 0.075, still Box 1). If rollback had failed to deactivate V2,
// this card would graduate to exactly 1.0 and land in Box 2 — so this assertion can actually fail.
const FRESH = 'cp8-lampe';
const freshBefore = Number(
  (await ensureSchedule(L3, FRESH, 'rollback: fresh Box-1 fixture for the discriminating V1 check'))
    .stability_days,
);
record(
  'rollback: fresh fixture starts in Box 1 (discriminating state)',
  boxOf(freshBefore) === 1,
  `stability=${freshBefore} box=${boxOf(freshBefore)}`,
);
await submit(L3, [item(FRESH, 'known', 'cp8-r2-rb-fresh-v1')], ENV_V1(), {
  cause: 'rollback: discriminating V1 write on a fresh Box-1 card',
});
const freshAfter = Number((await scheduleOf(L3, FRESH)).stability_days);
record(
  'rollback: DISCRIMINATING — fresh Box-1 card follows V1 (x1.8) and does NOT graduate',
  Math.abs(freshAfter - freshBefore * 1.8) < 1e-9 &&
    Math.abs(freshAfter - 1) > 0.9 &&
    boxOf(freshAfter) === 1,
  `${freshBefore} -> ${freshAfter} (V1 expects ${(freshBefore * 1.8).toFixed(10)}, ` +
    `V2 would give 1.0 and Box 2); box=${boxOf(freshAfter)}`,
);
const freshEv = await pool.query(
  "select engine_version from review_events where client_event_id = 'cp8-r2-rb-fresh-v1'",
);
record(
  'rollback: the discriminating post-rollback event is also stamped V1 (engine_version NULL)',
  freshEv.rows.length === 1 && freshEv.rows[0].engine_version === null,
  `engine_version=${freshEv.rows[0]?.engine_version}`,
);

// ---------------------------------------------------------------- 3. history is not rewritten
const v2RowsAfter = (
  await pool.query('select count(*)::int n from review_events where engine_version = 2')
).rows[0].n;
record(
  'rollback: no existing event row is rewritten (V2-stamped row count unchanged)',
  v2RowsAfter === v2RowsBefore,
  `engine_version=2 rows ${v2RowsBefore} -> ${v2RowsAfter}`,
);
// Two post-rollback V1 writes exist: the retained-stability one and the DISCRIMINATING fresh Box-1
// one added for NF-2. Both are appends; nothing is deleted or rewritten.
const POST_ROLLBACK_EVENTS = ['cp8-r2-rb-v1', 'cp8-r2-rb-fresh-v1'];
record(
  'rollback: exactly the two post-rollback events were appended, nothing deleted',
  (await countEvents()) === eventsBefore + POST_ROLLBACK_EVENTS.length,
  `events ${eventsBefore} -> ${await countEvents()} (+${POST_ROLLBACK_EVENTS.length} appended)`,
);

// The prior-history digest must be unchanged. Recomputed over all rows EXCEPT the new one, using
// the full digest definition (incl. response + engine_version).
const priorAfter = (
  await pool.query(
    `select md5(string_agg(
            client_event_id || '|' || user_id::text || '|' || card_id::text || '|' || grade ||
            '|' || occurred_at::text || '|' || coalesce(response::text,'<null>') ||
            '|' || coalesce(engine_version::text,'<null>'),
            E'\n' order by reconciliation_cursor, client_event_id)) h
     from review_events where client_event_id <> all($1::text[])`,
    [POST_ROLLBACK_EVENTS],
  )
).rows[0].h;
record(
  'rollback: prior history (incl. response + engine_version) is byte-identical',
  priorAfter === historyBefore,
  priorAfter === historyBefore ? 'IDENTICAL' : 'CHANGED',
);

// ---------------------------------------------------------------- 4. the measured consequence
// Measured against the PRE-V2 baseline: this is the residue V2 leaves behind after rollback.
const v1OnlyPath = baseline * 1.8 * 1.8; // what the card would hold had V2 never been enabled
record(
  'rollback: MEASURED — stability accumulated under V2 is retained after rollback',
  afterV1 > v1OnlyPath + 1e-9,
  `actual=${afterV1.toFixed(6)} vs V1-only path=${v1OnlyPath.toFixed(6)} ` +
    `(residue=+${(afterV1 - v1OnlyPath).toFixed(6)} days, box ${boxOf(v1OnlyPath)} -> ${boxOf(afterV1)})`,
);
ledger({
  kind: 'note',
  cause: `rollback residue: card holds ${afterV1} days vs ${v1OnlyPath} on a V1-only path`,
});

const failures = finish('CP8_ROLLBACK');
await closePool();
process.exit(failures === 0 ? 0 : 1);
