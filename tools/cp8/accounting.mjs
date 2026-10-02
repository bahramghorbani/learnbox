// CP8 write accounting. Reconciles the mutation ledger against the actual final database state.
//
// This is deliberately adversarial toward the harness itself: it does not trust the ledger, it
// cross-checks it. Anything in the database that the ledger does not explain is reported as
// UNEXPLAINED, and nothing is deleted or normalised to make the numbers agree.
//
// Schedule chains are verified link-by-link: for each (user, card) the ledger must form an unbroken
// chain baseline -> ... -> final, where each entry's `before` equals the previous entry's `after`.
// That is what makes a silent "ghost" mutation (a schedule change nobody recorded) detectable.
import { pool, readLedger, closePool } from './lib.mjs';

const led = readLedger();
const fail = [];
const line = (s) => console.log(s);

// ---------------------------------------------------------------- events
const dbEvents = (
  await pool.query(
    `select client_event_id, engine_version, response
     from review_events order by client_event_id`,
  )
).rows;
const seeded = new Set(['cp8-legacy-1']);
const ledgerInserts = led.filter((e) => e.kind === 'event_insert').map((e) => e.clientEventId);
const ledgerSet = new Set(ledgerInserts);

const unexplainedEvents = dbEvents
  .map((r) => r.client_event_id)
  .filter((id) => !seeded.has(id) && !ledgerSet.has(id));
const missingEvents = ledgerInserts.filter((id) => !dbEvents.some((r) => r.client_event_id === id));

line(`events_in_db=${dbEvents.length}`);
line(`  seeded=${[...seeded].length}`);
line(`  ledgered_inserts=${ledgerInserts.length}`);
line(
  `  unexplained_events=${unexplainedEvents.length}${unexplainedEvents.length ? ' -> ' + unexplainedEvents.join(',') : ''}`,
);
line(
  `  ledgered_but_absent=${missingEvents.length}${missingEvents.length ? ' -> ' + missingEvents.join(',') : ''}`,
);
if (unexplainedEvents.length) fail.push('unexplained event rows present');
if (missingEvents.length) fail.push('ledger claims events that are not in the database');

const accounted = seeded.size + ledgerInserts.length;
line(
  `  accounting: ${seeded.size} seeded + ${ledgerInserts.length} harness = ${accounted} (db has ${dbEvents.length})`,
);
if (accounted !== dbEvents.length)
  fail.push(`event count mismatch: accounted ${accounted} vs db ${dbEvents.length}`);

// Deletions must be stated explicitly rather than claimed to be absent.
const deletions = led.filter((e) => e.kind === 'event_delete');
line(
  `  explicit_event_deletions=${deletions.length}${deletions.length ? ' -> ' + deletions.map((d) => d.clientEventId).join(',') : ' (none: the harness deletes nothing)'}`,
);

// ---------------------------------------------------------------- engine_version provenance
// NF-4: attribution uses the engineVersion FACT ledgered by submit() (derived from the flag in the
// env actually used), not a clientEventId naming regex. The old regex would misclassify any future
// test whose id merely contained "v2"/"trace"/"sweep", in either direction.
const v2Rows = dbEvents.filter((r) => r.engine_version === 2).map((r) => r.client_event_id);
const inserts = led.filter((e) => e.kind === 'event_insert');
const untagged = inserts.filter((e) => e.engineVersion === undefined);
if (untagged.length) fail.push(`${untagged.length} ledgered insert(s) carry no engineVersion tag`);
line(`ledgered_inserts_tagged=${inserts.length - untagged.length}/${inserts.length}`);
const ledgerV2 = new Set(inserts.filter((e) => e.engineVersion === 2).map((e) => e.clientEventId));
const ledgerV1 = new Set(inserts.filter((e) => e.engineVersion === 1).map((e) => e.clientEventId));
const v2NotExplained = v2Rows.filter((id) => !ledgerV2.has(id));
// Both directions: a row the ledger calls V2 but the DB did not stamp is just as much a defect.
const v2Missing = [...ledgerV2].filter((id) => !v2Rows.includes(id));
// And nothing written under V1 may carry a V2 stamp.
const v1Mis = dbEvents
  .filter((r) => r.engine_version === 2 && ledgerV1.has(r.client_event_id))
  .map((r) => r.client_event_id);
line(
  `engine_version2_rows=${v2Rows.length} unexplained=${v2NotExplained.length}${v2NotExplained.length ? ' -> ' + v2NotExplained.join(',') : ''}`,
);
line(
  `  ledgered_v2_without_db_stamp=${v2Missing.length}${v2Missing.length ? ' -> ' + v2Missing.join(',') : ''}`,
);
line(
  `  v1_writes_wrongly_stamped_v2=${v1Mis.length}${v1Mis.length ? ' -> ' + v1Mis.join(',') : ''}`,
);
if (v2NotExplained.length)
  fail.push('engine_version=2 rows that the ledger does not attribute to a V2 write');
if (v2Missing.length)
  fail.push('ledger claims a V2 write but the DB row is not stamped engine_version=2');
if (v1Mis.length) fail.push('a V1 write produced an engine_version=2 row');

// ---------------------------------------------------------------- schedules (chain verification)
const dbSched = (
  await pool.query(
    `select cs.user_id::text u, c.content_id cid, cs.stability_days s
     from card_schedules cs join cards c on c.id = cs.card_id
    order by cs.user_id, c.content_id`,
  )
).rows;

// Baselines written by seed.mjs.
const SEEDED = {
  '11111111-1111-4111-8111-111111111111|cp8-haus': 1.0,
  '22222222-2222-4222-8222-222222222222|cp8-buch': 1.8,
  '33333333-3333-4333-8333-333333333333|cp8-tisch': 34.012,
  '44444444-4444-4444-8444-444444444444|cp8-stuhl': 0.0416666667,
  '11111111-1111-4111-8111-111111111111|cp8-lampe': 0.0416666667,
};

const chains = new Map();
for (const e of led) {
  if (e.kind !== 'schedule_update' && e.kind !== 'schedule_insert') continue;
  const key = `${e.userId}|${e.contentId}`;
  if (!chains.has(key)) chains.set(key, []);
  chains.get(key).push(e);
}

let chainBreaks = 0;
let ghosts = 0;
line(`schedules_in_db=${dbSched.length}`);
for (const row of dbSched) {
  const key = `${row.u}|${row.cid}`;
  const chain = chains.get(key) ?? [];
  const seedVal = SEEDED[key];
  const finalVal = Number(row.s);

  if (chain.length === 0) {
    // No harness mutation: the row must still equal its seeded value.
    if (seedVal === undefined) {
      line(`  GHOST ${key}: row exists with no seed and no ledger entry (stability=${row.s})`);
      ghosts += 1;
    } else if (Math.abs(seedVal - finalVal) > 1e-9) {
      line(`  GHOST ${key}: seeded ${seedVal} but db has ${finalVal} with no ledger entry`);
      ghosts += 1;
    } else {
      line(`  ok ${key}: untouched at seeded value ${finalVal}`);
    }
    continue;
  }

  // Verify the chain links up: start -> ... -> final.
  const start = chain[0].before === null ? null : Number(chain[0].before);
  let broken = false;
  for (let i = 1; i < chain.length; i += 1) {
    const prevAfter = chain[i - 1].after === null ? null : Number(chain[i - 1].after);
    const thisBefore = chain[i].before === null ? null : Number(chain[i].before);
    const bothNaN = Number.isNaN(prevAfter) && Number.isNaN(thisBefore);
    const equal =
      bothNaN ||
      (prevAfter === null && thisBefore === null) ||
      (prevAfter !== null && thisBefore !== null && Math.abs(prevAfter - thisBefore) < 1e-9);
    if (!equal) {
      line(
        `  CHAIN BREAK ${key}: step ${i} expected before=${prevAfter} but ledger says ${thisBefore}`,
      );
      broken = true;
    }
  }
  const chainEnd = chain.at(-1).after === null ? null : Number(chain.at(-1).after);
  const endsAtDb =
    (Number.isNaN(chainEnd) && Number.isNaN(finalVal)) ||
    (chainEnd !== null && Math.abs(chainEnd - finalVal) < 1e-9);
  if (!endsAtDb) {
    line(`  CHAIN BREAK ${key}: ledger ends at ${chainEnd} but db holds ${finalVal}`);
    broken = true;
  }
  if (seedVal !== undefined && start !== null && Math.abs(start - seedVal) > 1e-9) {
    line(`  CHAIN BREAK ${key}: chain starts at ${start} but seed wrote ${seedVal}`);
    broken = true;
  }
  if (broken) chainBreaks += 1;
  else line(`  ok ${key}: ${chain.length} ledgered mutation(s), ${start ?? 'new'} -> ${finalVal}`);
}
if (ghosts) fail.push(`${ghosts} ghost schedule state(s) with no ledger entry`);
if (chainBreaks) fail.push(`${chainBreaks} schedule chain(s) do not reconcile`);

// ---------------------------------------------------------------- DDL
const ddlApply = led.filter((e) => e.kind === 'ddl_apply').length;
const ddlRestore = led.filter((e) => e.kind === 'ddl_restore').length;
line(`ddl_apply=${ddlApply} ddl_restore=${ddlRestore}`);
if (ddlApply !== ddlRestore) fail.push('a temporary DDL change was not restored');

const liveSurface = (
  await pool.query(
    `select coalesce(string_agg(column_name || ':' || data_type, ',' order by column_name), 'NONE') s
     from information_schema.columns
    where table_name = 'review_events' and column_name in ('response', 'engine_version')`,
  )
).rows[0].s;
line(`final_schema_surface=${liveSurface}`);
if (!liveSurface.includes('engine_version:smallint') || !liveSurface.includes('response:text')) {
  fail.push('final schema is not in the expected post-0023 shape');
}

// ---------------------------------------------------------------- verdict
line('');
line(`ACCOUNTING_FAILURES=${fail.length}`);
for (const f of fail) line(`  - ${f}`);
line(`ACCOUNTING_VERDICT=${fail.length === 0 ? 'EVERY_WRITE_ACCOUNTED' : 'UNRECONCILED'}`);

await closePool();
process.exit(fail.length === 0 ? 0 : 1);
