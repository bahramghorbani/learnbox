#!/usr/bin/env node
/**
 * LB-B35 CP9 Stage 6 — binary review E2E against a POST-0023 schema.
 * Isolated staging DB only (port 55443 guard). Exercises the real compiled store
 * (same code as the deployed artifact) with LEARNBOX_BINARY_REVIEW semantics ON.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { Pool } = require(`${ROOT}/node_modules/.pnpm/pg@8.22.0/node_modules/pg`);

const DSN = process.env.CP9_DSN;
if (!DSN || !DSN.includes('55443')) {
  console.error('REFUSED: DSN must point at the disposable staging DB on port 55443.');
  process.exit(2);
}

const pool = new Pool({ connectionString: DSN });
const ok = [],
  fail = [];
const check = (n, c, d = '') => (
  (c ? ok : fail).push(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' :: ' + d : ''}`),
  c
);

const { createBinaryReviewPreflight, BinaryReviewPreflightError } = await import(
  `${ROOT}/apps/api/dist/reviews/binary-review-preflight.js`
);
const { PostgresReviewEventStore } = await import(
  `${ROOT}/apps/api/dist/reviews/postgres-review-event.store.js`
);

// ---- 0. schema must be POST-0023 for this proof to mean anything ----
const col = await pool.query(
  `SELECT data_type FROM information_schema.columns WHERE table_name='review_events' AND column_name='response'`,
);
check(
  'staging schema is post-0023 (review_events.response present)',
  col.rowCount === 1,
  col.rows[0]?.data_type,
);

// ---- fixtures: an isolated synthetic user, clearly marked ----
const u = await pool.query(
  `INSERT INTO users (id, phone_e164, first_name) VALUES (gen_random_uuid(), $1, 'CP9-STAGE6-SYNTHETIC') RETURNING id`,
  ['+99900000' + String(Date.now()).slice(-4)],
);
const USER = u.rows[0].id;
const c1 = await pool.query(`SELECT id FROM cards ORDER BY id LIMIT 2`);
if (c1.rowCount < 2) {
  console.error('need >=2 cards in staging');
  process.exit(3);
}
const [CARD_A, CARD_B] = c1.rows.map((r) => r.id);
await pool.query(
  `INSERT INTO card_schedules (user_id, card_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`,
  [USER, CARD_A, CARD_B],
);

const preflight = createBinaryReviewPreflight(pool, { LEARNBOX_BINARY_REVIEW: 'true' });
const store = new PostgresReviewEventStore(pool, preflight);
const { scheduleReview } = await import(`${ROOT}/packages/learning-engine/dist/index.js`);
const baseSchedule = () => ({
  state: 'learning',
  stabilityDays: 0.00694,
  difficulty: 5,
  lapses: 0,
  dueAt: new Date(),
});
// write via the REAL store API: writeAtomically(input, nextSchedule)
const sent = new Map();
const write = async (cardId, grade, response, clientEventId) => {
  const now = new Date();
  const next = scheduleReview(baseSchedule(), grade, now);
  const input = { userId: USER, cardId, grade, occurredAt: now, clientEventId };
  if (response !== undefined) input.response = response;
  sent.set(clientEventId, { input, next });
  return store.writeAtomically(input, next);
};
// exact replay: same clientEventId AND same payload -> must be a no-op, not a conflict
const replay = async (clientEventId) => {
  const p = sent.get(clientEventId);
  return store.writeAtomically(p.input, p.next);
};

// ---- 1. preflight must PASS on a post-0023 schema (no throw) ----
let preflightOk = true,
  preflightErr = '';
try {
  await preflight();
} catch (e) {
  preflightOk = false;
  preflightErr = e.message;
}
check('preflight passes on post-0023 schema', preflightOk, preflightErr);

// ---- 2. binary KNOWN accepted and persisted with response set ----
const ev1 = 'cp9s6-known-' + Date.now();
await write(CARD_A, 'mastered', 'known', ev1);
const r1 = await pool.query(
  `SELECT grade, response FROM review_events WHERE user_id=$1 AND client_event_id=$2`,
  [USER, ev1],
);
check('binary KNOWN persisted exactly once', r1.rowCount === 1);
check('KNOWN stored response=known', r1.rows[0]?.response === 'known', JSON.stringify(r1.rows[0]));

// ---- 3. binary UNKNOWN accepted and persisted ----
const ev2 = 'cp9s6-unknown-' + Date.now();
await write(CARD_B, 'forgot', 'unknown', ev2);
const r2 = await pool.query(
  `SELECT grade, response FROM review_events WHERE user_id=$1 AND client_event_id=$2`,
  [USER, ev2],
);
check('binary UNKNOWN persisted exactly once', r2.rowCount === 1);
check(
  'UNKNOWN stored response=unknown',
  r2.rows[0]?.response === 'unknown',
  JSON.stringify(r2.rows[0]),
);

// ---- 4. IDEMPOTENCY: replaying the same clientEventId must not duplicate ----
await replay(ev1);
const dup = await pool.query(
  `SELECT count(*)::int n FROM review_events WHERE user_id=$1 AND client_event_id=$2`,
  [USER, ev1],
);
check('idempotent replay does not duplicate', dup.rows[0].n === 1, 'rows=' + dup.rows[0].n);

// ---- 4b. ANTI-TAMPER: same clientEventId with a DIFFERENT payload must be refused ----
// The refusal is asserted by error `.name` below, so the class itself is intentionally not bound
// (an unused binding fails repo lint). The import is kept for its module-load side effect parity.
await import(`${ROOT}/apps/api/dist/reviews/postgres-review-event.store.js`);
let tamperRefused = false,
  tamperKind = 'none';
try {
  const p = sent.get(ev1);
  await store.writeAtomically({ ...p.input, grade: 'forgot', response: 'unknown' }, p.next);
} catch (e) {
  tamperRefused = true;
  tamperKind = e.constructor.name;
}
check(
  'replay with a different payload is refused (idempotency conflict)',
  tamperRefused && tamperKind === 'ReviewIdempotencyConflictError',
  tamperKind,
);
const stillOne = await pool.query(
  `SELECT count(*)::int n, max(response) r FROM review_events WHERE user_id=$1 AND client_event_id=$2`,
  [USER, ev1],
);
check(
  'conflicting replay did not overwrite the stored response',
  stillOne.rows[0].n === 1 && stillOne.rows[0].r === 'known',
  JSON.stringify(stillOne.rows[0]),
);

// ---- 5. schedule attributable to the scripted account ----
const sch = await pool.query(
  `SELECT card_id, stability_days, due_at FROM card_schedules WHERE user_id=$1 ORDER BY card_id`,
  [USER],
);
check('schedules exist for scripted account only', sch.rowCount === 2, 'rows=' + sch.rowCount);

// ---- 6. legacy rows NOT rewritten: pre-existing events keep response NULL ----
const legacy = await pool.query(
  `SELECT count(*)::int n FROM review_events e JOIN users u ON u.id = e.user_id
    WHERE e.user_id <> $1 AND e.response IS NOT NULL AND u.first_name <> 'CP9-STAGE6-SYNTHETIC'`,
  [USER],
);
check('no legacy row gained a response value', legacy.rows[0].n === 0, 'n=' + legacy.rows[0].n);

// ---- 7. non-binary (v1.2.1) path still works with response omitted ----
const ev3 = 'cp9s6-legacy-' + Date.now();
await write(CARD_A, 'hard', undefined, ev3);
const r3 = await pool.query(
  `SELECT grade, response FROM review_events WHERE user_id=$1 AND client_event_id=$2`,
  [USER, ev3],
);
check('v1.2.1 grade-only path still accepted', r3.rowCount === 1);
check(
  'grade-only row has response NULL (no silent default)',
  r3.rows[0]?.response === null,
  JSON.stringify(r3.rows[0]),
);

// ---- 8. DETERMINISTIC rejection is non-retryable: preflight on a pre-0023 shape ----
const fakePool = { query: async () => ({ rowCount: 0, rows: [] }) };
const badPreflight = createBinaryReviewPreflight(fakePool, { LEARNBOX_BINARY_REVIEW: 'true' });
let detOk = false,
  detName = '';
try {
  await badPreflight();
} catch (e) {
  detOk = e instanceof BinaryReviewPreflightError;
  detName = e.constructor.name;
}
check('missing-schema yields deterministic BinaryReviewPreflightError', detOk, detName);

// ---- 9. TRANSIENT failure must NOT be a deterministic rejection (stays retryable) ----
const flakyPool = {
  query: async () => {
    const e = new Error('connection terminated unexpectedly');
    e.code = '57P01';
    throw e;
  },
};
const flakyPreflight = createBinaryReviewPreflight(flakyPool, { LEARNBOX_BINARY_REVIEW: 'true' });
let transientKind = 'none';
try {
  await flakyPreflight();
} catch (e) {
  transientKind =
    e instanceof BinaryReviewPreflightError
      ? 'deterministic'
      : 'transient:' + (e.code ?? e.constructor.name);
}
check(
  'transient DB error is NOT misreported as deterministic',
  transientKind.startsWith('transient'),
  transientKind,
);

// ---- 10. flag OFF => response rejected at the wire parser (v1.2.1 shape) ----
const wire = await import(`${ROOT}/apps/api/dist/reviews/mobile-review-batch.request.js`);
check(
  'wire parser export resolves (no vacuous pass)',
  typeof wire.parseMobileReviewBatchRequest === 'function',
  typeof wire.parseMobileReviewBatchRequest,
);
// REAL wire shape: { items: [{ clientEventId, contentId, <grade|response>, occurredAt }] }
const binaryPayload = () => ({
  items: [
    {
      clientEventId: 'wire-' + Date.now(),
      contentId: CARD_A,
      response: 'known',
      occurredAt: new Date().toISOString(),
    },
  ],
});
const legacyPayload = () => ({
  items: [
    {
      clientEventId: 'wire-' + Date.now(),
      contentId: CARD_A,
      grade: 'mastered',
      occurredAt: new Date().toISOString(),
    },
  ],
});

// control: a VALID legacy payload must parse under both settings (proves the harness shape is right,
// so a rejection below is about the flag and not about a malformed fixture)
let legacyOk = false,
  legacyMsg = '';
try {
  wire.parseMobileReviewBatchRequest(legacyPayload(), USER, { binaryResponses: false });
  legacyOk = true;
} catch (e) {
  legacyMsg = e.message;
}
check(
  'CONTROL: valid legacy grade payload parses (fixture shape is correct)',
  legacyOk,
  legacyMsg.slice(0, 90),
);

// flag OFF => a binary `response` must be refused, with the ITEM-level error (not the envelope error)
let offRejected = false,
  offMsg = '';
try {
  wire.parseMobileReviewBatchRequest(binaryPayload(), USER, { binaryResponses: false });
} catch (e) {
  offRejected = true;
  offMsg = e.message;
}
check(
  'with binaryResponses OFF a response item is rejected',
  offRejected && /review item has an invalid shape/i.test(offMsg),
  offMsg.slice(0, 90),
);

// flag ON => the same payload is accepted AND maps to a shadow grade
let onAccepted = false,
  onMsg = '',
  parsed = null;
try {
  parsed = wire.parseMobileReviewBatchRequest(binaryPayload(), USER, { binaryResponses: true });
  onAccepted = true;
} catch (e) {
  onMsg = e.message;
}
check('with binaryResponses ON the same payload is accepted', onAccepted, onMsg.slice(0, 90));
check(
  'accepted binary item retains response + shadow grade',
  onAccepted && parsed.items[0].response === 'known' && typeof parsed.items[0].grade === 'string',
  JSON.stringify(parsed?.items?.[0] ?? null),
);

// ---- write ledger for this run ----
const mine = await pool.query(`SELECT count(*)::int n FROM review_events WHERE user_id=$1`, [USER]);
console.log('\n--- SCRIPTED WRITE LEDGER (staging) ---');
console.log('synthetic_user=' + USER);
console.log('review_events_written=' + mine.rows[0].n + ' (expect 3: known, unknown, grade-only)');
console.log('card_schedules_rows=' + sch.rowCount);

// ---- cleanup: remove ONLY the synthetic account's rows ----
await pool.query(`DELETE FROM review_events WHERE user_id=$1`, [USER]);
await pool.query(`DELETE FROM card_schedules WHERE user_id=$1`, [USER]);
await pool.query(`DELETE FROM users WHERE id=$1`, [USER]);
const left = await pool.query(`SELECT count(*)::int n FROM review_events WHERE user_id=$1`, [USER]);
check('synthetic rows fully cleaned up', left.rows[0].n === 0);

console.log('\n--- RESULTS ---');
for (const l of ok) console.log(l);
for (const l of fail) console.log(l);
console.log(`\nTOTAL ${ok.length}/${ok.length + fail.length} PASS`);
await pool.end();
process.exit(fail.length ? 1 : 0);
