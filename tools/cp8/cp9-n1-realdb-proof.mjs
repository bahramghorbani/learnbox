#!/usr/bin/env node
/**
 * LB-B35 CP9 (N1) real-database proof: LEARNBOX_BINARY_REVIEW=true against a genuinely pre-0023
 * schema must be refused DETERMINISTICALLY (422 schedulerRejected, non-retryable) with NOTHING
 * persisted -- not the retryable 503 that CP8 recorded as N1.
 *
 * Read-mostly: the only writes attempted are the ones that must be refused. Guarded to port 55443.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
// Resolve the repo root from this script's own location (tools/cp8/ -> repo root) so the proof is
// reproducible on any checkout. CP9 ran it from an absolute path on the authoring machine; the
// resolution target is identical.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { Pool } = require(path.join(REPO_ROOT, 'node_modules/.pnpm/pg@8.22.0/node_modules/pg'));

const DSN = process.env.CP9_DSN ?? process.env.STAGING_DATABASE_URL;
if (!DSN || !DSN.includes('55443')) {
  console.error('REFUSED: DSN must point at the disposable staging DB on port 55443.');
  process.exit(2);
}

const pool = new Pool({ connectionString: DSN });
const fail = [];
const ok = [];
const check = (name, cond, detail = '') =>
  (cond ? ok : fail).push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);

// Note: the deterministic error is asserted by `.name` below, so the error class itself is
// intentionally not imported (importing it unused fails repo lint).
const { verifyBinaryReviewSchema, createBinaryReviewPreflight } = await import(
  path.join(REPO_ROOT, 'apps/api/dist/reviews/binary-review-preflight.js')
);
const { PostgresReviewEventStore } = await import(
  path.join(REPO_ROOT, 'apps/api/dist/reviews/postgres-review-event.store.js')
);

// 0. Confirm the database really lacks 0023, otherwise this proof is vacuous.
const col = await pool.query(
  `SELECT 1 FROM information_schema.columns
    WHERE table_name='review_events' AND column_name='response'`,
);
check('database is genuinely pre-0023 (no review_events.response)', col.rowCount === 0);

// 1. The preflight must reject, naming the column and the migration.
let preflightError = null;
try {
  await verifyBinaryReviewSchema(pool);
} catch (error) {
  preflightError = error;
}
check('preflight rejects a real pre-0023 database', preflightError !== null);
check(
  'error is BinaryReviewPreflightError (deterministic name the boundary maps to 422)',
  preflightError?.name === 'BinaryReviewPreflightError',
);
check(
  'message names review_events.response',
  /review_events\.response is missing/.test(preflightError?.message ?? ''),
);
check(
  'message names migration 0023 so the operator knows the fix',
  /0023_learning_persistence/.test(preflightError?.message ?? ''),
);

// 2. A failed preflight must NOT be cached (applying 0023 must not need a restart).
const memo = createBinaryReviewPreflight(pool);
const first = await memo().then(
  () => null,
  (e) => e,
);
const second = await memo().then(
  () => null,
  (e) => e,
);
check('failed preflight is re-evaluated, never cached', first !== null && second !== null);

// 3. The store must refuse a binary write before any row is inserted.
const before = await pool.query('SELECT count(*)::int AS n FROM review_events');
const store = new PostgresReviewEventStore(pool, createBinaryReviewPreflight(pool));
let writeError = null;
try {
  await store.writeAtomically(
    {
      userId: '11111111-1111-4111-8111-111111111111',
      cardId: '22222222-2222-4222-8222-222222222222',
      grade: 'remembered',
      response: 'known',
      occurredAt: new Date(),
      clientEventId: 'cp9-n1-proof-' + Date.now(),
    },
    { state: 'review', stabilityDays: 1, difficulty: 5, lapses: 0, dueAt: new Date() },
  );
} catch (error) {
  writeError = error;
}
const after = await pool.query('SELECT count(*)::int AS n FROM review_events');
check('binary write is refused', writeError?.name === 'BinaryReviewPreflightError');
check(
  'NOTHING was persisted (review_events count unchanged)',
  before.rows[0].n === after.rows[0].n,
  `${before.rows[0].n} -> ${after.rows[0].n}`,
);

// 4. Flags off (no response) must still work on this pre-0023 database: v1.2.1 behaviour preserved.
const legacyStore = new PostgresReviewEventStore(pool, createBinaryReviewPreflight(pool));
let legacyReached = false;
try {
  await legacyStore.writeAtomically(
    {
      userId: '11111111-1111-4111-8111-111111111111',
      cardId: '22222222-2222-4222-8222-222222222222',
      grade: 'remembered',
      occurredAt: new Date(),
      clientEventId: 'cp9-n1-legacy-' + Date.now(),
    },
    { state: 'review', stabilityDays: 1, difficulty: 5, lapses: 0, dueAt: new Date() },
  );
  legacyReached = true;
} catch (error) {
  // A foreign-key/No-card error is fine: it proves we got PAST the preflight into real SQL.
  legacyReached = error?.name !== 'BinaryReviewPreflightError';
}
check('flag-off write is NOT blocked by the preflight (v1.2.1 path intact)', legacyReached);

await pool.end();
console.log([...ok, ...fail].join('\n'));
console.log(`\nCP9-N1-REALDB: ${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length === 0 ? 0 : 1);
