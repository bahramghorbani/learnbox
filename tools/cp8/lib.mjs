// CP8 remediated harness — shared library.
//
// Design rules this file enforces, each one answering a confirmed second-pass defect:
//
//  * MUTATION LEDGER. Every synthetic write the harness performs is appended to one ledger file as a
//    structured record. Schedule mutations record {before, after} so accounting can verify an
//    unbroken chain from the seeded value to the final database value. A schedule change with no
//    ledger entry, or a chain gap, is reported as UNEXPLAINED rather than normalised away.
//  * NO SILENT REVERTS. Nothing deletes a review event or rewinds a schedule to make counts tidy.
//    If a test writes, the write stays and is explained.
//  * DDL SAFETY. withTemporaryDdl() restores the schema in a finally block, so a failed assertion
//    cannot leave the isolated staging schema misleading for later assertions.
//  * REAL PATH. Requests go through the real web route handler, real runtime wiring, real service,
//    real engine and real Postgres over TLS. The only stub is an injected `submit` used solely to
//    simulate a transient infrastructure fault, which is a boundary-mapping test by construction.
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(repo, 'apps/website/package.json'));
export const pg = require('pg');

export const DSN = process.env.STAGING_DATABASE_URL;
if (!DSN) throw new Error('STAGING_DATABASE_URL is required');
export const LEDGER = process.env.CP8_LEDGER ?? '/tmp/cp8/ledger.jsonl';
export const RUN = process.env.CP8_RUN_ID ?? 'run';

// Binary review is part of the activated configuration under test (web binary answers).
process.env.LEARNBOX_BINARY_REVIEW = 'true';
process.env.NODE_ENV = 'production';

export const pool = new pg.Pool({ connectionString: DSN });

export const web = await import(join(repo, 'apps/website/dist-cp8/learner-review-web-http.js'));
export const runtime = await import(
  join(repo, 'apps/website/dist-cp8/learner-review-web-runtime.js')
);
export const sync = await import(join(repo, 'apps/website/dist-cp8/learner-review-web-sync.js'));
export const webClient = await import(
  join(repo, 'apps/website/dist-cp8/learner-review-web-client.js')
);
export const engine = await import(join(repo, 'packages/learning-engine/dist/index.js'));

export const boxOf = (s) => engine.boxFromStabilityDays(Number(s));

// ---------------------------------------------------------------- learners / cards (match seed.mjs)
export const L1 = '11111111-1111-4111-8111-111111111111';
export const L2 = '22222222-2222-4222-8222-222222222222';
export const L3 = '33333333-3333-4333-8333-333333333333';
export const L4 = '44444444-4444-4444-8444-444444444444';

// ---------------------------------------------------------------- environments
const baseEnv = () => ({
  WEB_LEARNER_STATE_ENABLED: 'true',
  DATABASE_URL: DSN,
  LEARNBOX_SESSION_SECRET: 'x'.repeat(48),
  NODE_ENV: 'production',
});
export const ENV_V1 = () => baseEnv();
export const ENV_V2 = () => ({ ...baseEnv(), LEARNBOX_SCHEDULER_V2: 'true' });

// ---------------------------------------------------------------- ledger
export function ledger(entry) {
  appendFileSync(
    LEDGER,
    JSON.stringify({ run: RUN, at: new Date().toISOString(), ...entry }) + '\n',
  );
}
export function readLedger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- assertions
const results = [];
export function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`);
}
export function finish(label) {
  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${label}_TOTAL=${results.length} PASSED=${results.length - failed.length} FAILED=${failed.length}`,
  );
  return failed.length;
}

// ---------------------------------------------------------------- database helpers
export const scheduleOf = async (userId, contentId) =>
  (
    await pool.query(
      `select cs.stability_days, cs.state::text as state, cs.due_at, cs.difficulty, cs.lapses
         from card_schedules cs join cards c on c.id = cs.card_id
        where cs.user_id = $1 and c.content_id = $2`,
      [userId, contentId],
    )
  ).rows[0];

export const countEvents = async () =>
  (await pool.query('select count(*)::int n from review_events')).rows[0].n;

// Digest over EVERY column that scheduling correctness depends on, including the CP4/0023 fields.
//
// Schema-adaptive by necessity: this digest runs BEFORE 0023 (when response/engine_version do not
// exist) and DURING temporary DDL (when a column is deliberately renamed away). A hard-coded column
// list crashes in exactly those states, which is how a stale fingerprint slipped into the previous
// package. Missing columns are rendered as the literal '<absent>' so the digest is always defined,
// and `eventDigestShape()` reports which form was used so a comparison can never silently compare
// two different instruments.
const eventColumns = async () =>
  new Set(
    (
      await pool.query(
        `select column_name from information_schema.columns
          where table_name = 'review_events'
            and column_name in ('response', 'engine_version')`,
      )
    ).rows.map((r) => r.column_name),
  );

export const eventDigestShape = async () => {
  const cols = await eventColumns();
  return (
    `response=${cols.has('response') ? 'present' : 'absent'},` +
    `engine_version=${cols.has('engine_version') ? 'present' : 'absent'}`
  );
};

export const eventDigest = async () => {
  const cols = await eventColumns();
  const response = cols.has('response') ? "coalesce(response::text,'<null>')" : "'<absent>'";
  const engine = cols.has('engine_version')
    ? "coalesce(engine_version::text,'<null>')"
    : "'<absent>'";
  return (
    await pool.query(
      `select md5(string_agg(
                client_event_id || '|' || user_id::text || '|' || card_id::text || '|' || grade ||
                '|' || occurred_at::text || '|' || ${response} || '|' || ${engine},
                E'\n' order by reconciliation_cursor, client_event_id)) h
         from review_events`,
    )
  ).rows[0].h;
};

export const scheduleDigest = async () =>
  (
    await pool.query(
      `select md5(string_agg(
                user_id::text || '|' || card_id::text || '|' || state::text || '|' ||
                stability_days::text || '|' || difficulty::text || '|' || lapses::text || '|' ||
                due_at::text || '|' || coalesce(last_reviewed_at::text,'<null>'),
                E'\n' order by user_id, card_id)) h
         from card_schedules`,
    )
  ).rows[0].h;

// ---------------------------------------------------------------- real HTTP path
const requestFor = (body) =>
  new Request('https://staging.learnbox.invalid/api/learner/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://staging.learnbox.invalid',
      host: 'staging.learnbox.invalid',
      'x-forwarded-proto': 'https',
    },
    body: JSON.stringify(body),
  });

export const item = (
  contentId,
  response,
  clientEventId,
  occurredAt = new Date().toISOString(),
) => ({
  clientEventId,
  contentId,
  response,
  occurredAt,
});

/**
 * Submits through the real route handler. When the call persists a review, the schedule transition is
 * recorded in the ledger with its before/after stability so accounting can chain it.
 */
export async function submit(userId, items, env = ENV_V2(), opts = {}) {
  // NF-4: the engine under which this call runs is a FACT we know here (the flag in `env`), so it is
  // ledgered explicitly. Accounting must not have to guess it from clientEventId naming conventions.
  const engineVersion = String(env.LEARNBOX_SCHEDULER_V2) === 'true' ? 2 : 1;
  const deps = opts.deps ?? runtime.webReviewDependenciesFromEnvironment(env);
  const watched = opts.watch ?? items.map((i) => i.contentId);
  const before = {};
  for (const cid of watched) before[cid] = await scheduleOf(userId, cid);

  const res = await web.handleWebReviewBatchPost(requestFor({ items }), deps, () => userId);
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }

  for (const cid of watched) {
    const after = await scheduleOf(userId, cid);
    const b = before[cid];
    const changed = JSON.stringify(b ?? null) !== JSON.stringify(after ?? null);
    if (changed) {
      ledger({
        kind: b ? 'schedule_update' : 'schedule_insert',
        userId,
        contentId: cid,
        before: b ? String(b.stability_days) : null,
        after: after ? String(after.stability_days) : null,
        cause: opts.cause ?? `submit ${items.map((i) => i.clientEventId).join(',')}`,
      });
    }
  }
  const outcomes = payload?.outcomes ?? [];
  for (const [idx, o] of outcomes.entries()) {
    if (o.status === 'acknowledged' && o.idempotent === false) {
      ledger({
        kind: 'event_insert',
        clientEventId: o.clientEventId ?? items[idx]?.clientEventId,
        userId,
        engineVersion,
        cause: opts.cause ?? 'submit',
      });
    }
  }
  return {
    status: res.status,
    payload,
    body: JSON.stringify(payload),
    outcome: outcomes[0]?.status,
  };
}

/** Direct schedule write used by the boundary sweep. Always ledgered. */
export async function setStability(userId, contentId, value, cause) {
  const before = await scheduleOf(userId, contentId);
  const r = await pool.query(
    `update card_schedules set stability_days = $3
      where user_id = $1 and card_id = (select id from cards where content_id = $2)`,
    [userId, contentId, value],
  );
  if (r.rowCount !== 1) throw new Error(`setStability precondition failed for ${contentId}`);
  const after = await scheduleOf(userId, contentId);
  ledger({
    kind: 'schedule_update',
    userId,
    contentId,
    before: before ? String(before.stability_days) : null,
    after: String(after.stability_days),
    cause,
  });
  return after;
}

/** Creates the lazily-created schedule row up front so before/after comparisons are real. */
export async function ensureSchedule(userId, contentId, cause) {
  const existing = await scheduleOf(userId, contentId);
  if (existing) return existing;
  await pool.query(
    `insert into card_schedules (user_id, card_id) select $1, id from cards where content_id = $2
     on conflict do nothing`,
    [userId, contentId],
  );
  const after = await scheduleOf(userId, contentId);
  if (!after) throw new Error(`ensureSchedule failed for ${contentId}`);
  ledger({
    kind: 'schedule_insert',
    userId,
    contentId,
    before: null,
    after: String(after.stability_days),
    cause,
  });
  return after;
}

/**
 * Applies temporary DDL and ALWAYS restores it, even if the body throws. Both statements are
 * ledgered so the final report can state that the schema was returned to its post-0023 shape.
 */
export async function withTemporaryDdl({ apply, restore, reason }, body) {
  ledger({ kind: 'ddl_apply', sql: apply, reason });
  await pool.query(apply);
  try {
    return await body();
  } finally {
    await pool.query(restore);
    ledger({ kind: 'ddl_restore', sql: restore, reason });
  }
}

export async function closePool() {
  await pool.end();
}
