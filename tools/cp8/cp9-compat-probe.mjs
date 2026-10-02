// CP9 planning probe v2 — ISOLATED STAGING ONLY, read-mostly. NOT a Production action.
//
// Question: can the CURRENT main build serve the real web review path against a PRE-0023
// (v1.2.1-shaped) database with every CP4/CP5/CP7 flag OFF? That is the "can Production run the
// new image before the migration" compatibility question.
//
// CORRECTION over v1: `binaryResponses` is read from process.env.LEARNBOX_BINARY_REVIEW inside
// learner-review-web-http.ts, NOT from the injected env object — and lib.mjs forces that variable
// to 'true' at import time. v1 therefore ran every case with binary review ON, so its flags-off
// and N1 numbers were meaningless. Here process.env is set explicitly per case.
import { pool, record, finish, submit, item, countEvents, ENV_V1 } from './lib.mjs';
import { randomUUID } from 'node:crypto';

console.log('probe=cp9-pre0023-compat-v2');

const cols = (
  await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns
    WHERE (table_name='review_events' AND column_name IN ('response','engine_version'))
       OR (table_name='users' AND column_name='timezone')`)
).rows[0].n;
const tbls = (
  await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_name IN ('learner_daily_plans','review_event_rejections')`)
).rows[0].n;
record('schema is pre-0023 (0023 columns absent)', cols === 0, `found=${cols}`);
record('schema is pre-0023 (0023 tables absent)', tbls === 0, `found=${tbls}`);

// `contentId` on the wire is the card's content_id SLUG, not the card_schedules.card_id UUID.
const u = await pool.query(
  `SELECT cs.user_id, c.content_id
     FROM card_schedules cs JOIN cards c ON c.id = cs.card_id
    LIMIT 1`,
);
const userId = u.rows[0]?.user_id;
const cardId = u.rows[0]?.content_id;
console.log(`subject user=${userId ? 'present' : 'MISSING'} contentId=${cardId ?? 'MISSING'}`);

// A legacy (v1.2.1-shaped) grade item: what a real pre-0023 web client sends.
const legacyItem = (id) => ({
  clientEventId: id,
  contentId: cardId,
  grade: 'remembered',
  occurredAt: new Date().toISOString(),
});

async function runCase(label, { binary, v2 }, mkItem) {
  process.env.LEARNBOX_BINARY_REVIEW = binary ? 'true' : 'false';
  const before = await countEvents();
  let status = null;
  let threw = null;
  let payload = null;
  try {
    const r = await submit(userId, [mkItem(randomUUID())], {
      ...ENV_V1(),
      ...(v2 ? { LEARNBOX_SCHEDULER_V2: 'true' } : {}),
    });
    status = r?.status ?? null;
    payload = JSON.stringify(r?.payload ?? r?.body ?? null)?.slice(0, 200);
  } catch (e) {
    threw = `${e.constructor.name}:${String(e.message).slice(0, 120)}`;
  }
  const after = await countEvents();
  console.log(
    `CASE ${label}: binary=${binary} v2=${v2} status=${status} threw=${threw ?? 'none'} events ${before}->${after} payload=${payload}`,
  );
  return { before, after, status, threw };
}

// A. v1.2.1-equivalent configuration: every flag off, legacy grade item.
const a = await runCase('A flags-off legacy-grade', { binary: false, v2: false }, legacyItem);
record(
  'A: flags-off on pre-0023 accepts and persists a legacy review (new image is backward compatible)',
  a.threw === null && a.status === 200 && a.after === a.before + 1,
  `status=${a.status} ${a.before}->${a.after}`,
);

// B. N1: binary review ON against pre-0023 with a binary item.
const b = await runCase('B binary-ON binary-item (N1)', { binary: true, v2: false }, (id) =>
  item(cardId, 'known', id),
);
record('B (N1): nothing persisted', b.after === b.before, `${b.before}->${b.after}`);
record(
  'B (N1): not a success status',
  b.status !== 200,
  `status=${b.status} (recorded in CP8 as 503)`,
);

// C. Scheduler V2 ON against pre-0023 must fail closed with a deterministic 422.
const c = await runCase('C v2-ON (must fail closed)', { binary: true, v2: true }, (id) =>
  item(cardId, 'known', id),
);
record(
  'C: V2 on pre-0023 fails closed (422) and persists nothing',
  c.status === 422 && c.after === c.before,
  `status=${c.status} ${c.before}->${c.after}`,
);

process.env.LEARNBOX_BINARY_REVIEW = 'false';
process.exitCode = finish('CP9_PROBE_V2') === 0 ? 0 : 1;
await pool.end();
