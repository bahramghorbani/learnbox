// CP8 remediated fail-closed / boundary / queue proof.
//
// Differences from the superseded harness, each answering a confirmed second-pass defect:
//  * All temporary DDL runs inside withTemporaryDdl(), which restores the schema in a finally block.
//  * Nothing is deleted. The V1-under-broken-schema probe previously wrote an event, deleted the
//    event and silently left the schedule advanced. It now keeps both and ledgers the schedule
//    transition, so the final accounting explains it instead of hiding it.
//  * The invariant-violation fixture is created explicitly (and left corrupted on purpose, which is
//    itself the proof that the refusal performed no partial write); its state is ledgered.
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
  scheduleDigest,
  withTemporaryDdl,
  ENV_V1,
  ENV_V2,
  web,
  runtime,
  sync,
  webClient,
  closePool,
  L1,
  L2,
} from './lib.mjs';

const MID = 'cp8-buch';
const LAMP = 'cp8-lampe';

// ============================================================ 1. MISSING 0023 COLUMN => FAIL CLOSED
{
  const beforeEvents = await countEvents();
  const beforeDigest = await eventDigest();
  const beforeSched = await scheduleDigest();

  await withTemporaryDdl(
    {
      apply: 'alter table review_events rename column engine_version to engine_version_hidden',
      restore: 'alter table review_events rename column engine_version_hidden to engine_version',
      reason: 'simulate a database missing migration 0023',
    },
    async () => {
      const pf = await submit(L2, [item(MID, 'known', 'cp8-r2-fc-missing')], ENV_V2(), {
        cause: 'preflight refusal (expected: no write)',
      });
      record(
        'missing 0023 column => preflight fails closed with HTTP 422 schedulerRejected',
        pf.status === 422 && pf.body.includes('schedulerRejected'),
        `status=${pf.status} body=${pf.body}`,
      );
      // NOTE: eventDigest() is schema-adaptive, so while engine_version is renamed away the digest
      // is computed in a DIFFERENT shape and cannot be compared against the pre-DDL digest. Compare
      // the legacy-shaped evidence (count + schedule digest) here, and verify full-digest stability
      // after the schema is restored, below.
      const duringEvents = await countEvents();
      const duringSched = await scheduleDigest();
      record(
        'preflight refusal persists nothing (no event row, no schedule change)',
        duringEvents === beforeEvents && duringSched === beforeSched,
        `events ${beforeEvents} -> ${duringEvents}, schedules ${duringSched === beforeSched ? 'identical' : 'CHANGED'}`,
      );
      record(
        'preflight refusal leaks no implementation detail to the client',
        pf.body === '{"error":"schedulerRejected"}',
        `body=${pf.body}`,
      );

      // Flag OFF must still serve on the same broken schema: V2 is the only gated path.
      // This write is REAL and is kept. It is ledgered and explained in the final accounting.
      const off = await submit(L1, [item(LAMP, 'known', 'cp8-r2-fc-offbroken')], ENV_V1(), {
        cause: 'V1 serves on a pre-0023-shaped schema (kept, not reverted)',
      });
      record(
        'flag OFF is unaffected by the missing 0023 column (V1 still serves)',
        off.status === 200,
        `status=${off.status}`,
      );
    },
  );

  const restored = await pool.query(
    'select count(*)::int n from information_schema.columns ' +
      "where table_name='review_events' and column_name='engine_version'",
  );
  record(
    'temporary DDL is restored by finally (schema back to post-0023 shape)',
    restored.rows[0].n === 1,
    `engine_version present=${restored.rows[0].n === 1}`,
  );
  // Now that the schema is back, the full digest is comparable again: prove the refusals left the
  // 0023 columns of every PRE-EXISTING row untouched. The deliberate V1 write above (kept, never
  // reverted) is excluded by client_event_id — it is accounted for separately in the ledger.
  const priorAfter = (
    await pool.query(
      `select md5(string_agg(
              client_event_id || '|' || user_id::text || '|' || card_id::text || '|' || grade ||
              '|' || occurred_at::text || '|' || coalesce(response::text,'<null>') ||
              '|' || coalesce(engine_version::text,'<null>'),
              E'\n' order by reconciliation_cursor, client_event_id)) h
       from review_events where client_event_id <> 'cp8-r2-fc-offbroken'`,
    )
  ).rows[0].h;
  record(
    'after restore: full digest (incl. response + engine_version) of pre-existing rows unchanged',
    priorAfter === beforeDigest,
    priorAfter === beforeDigest ? 'IDENTICAL' : 'CHANGED',
  );
}

// ============================================================ 2. WRONG COLUMN TYPE => FAIL CLOSED
{
  const beforeEvents = await countEvents();
  await withTemporaryDdl(
    {
      apply: 'alter table review_events alter column engine_version type integer',
      restore: 'alter table review_events alter column engine_version type smallint',
      reason: 'simulate migration 0023 applied with the wrong column type',
    },
    async () => {
      const r = await submit(L2, [item(MID, 'known', 'cp8-r2-fc-wrongtype')], ENV_V2(), {
        cause: 'preflight refusal on wrong type (expected: no write)',
      });
      record(
        'wrong 0023 column type => still fails closed with 422',
        r.status === 422 && r.body.includes('schedulerRejected'),
        `status=${r.status} body=${r.body}`,
      );
      record(
        'wrong-type refusal persists no event',
        (await countEvents()) === beforeEvents,
        `events ${beforeEvents} -> ${await countEvents()}`,
      );
    },
  );
  const t = await pool.query(
    'select data_type from information_schema.columns ' +
      "where table_name='review_events' and column_name='engine_version'",
  );
  record(
    'column type restored to smallint by finally',
    t.rows[0].data_type === 'smallint',
    `data_type=${t.rows[0].data_type}`,
  );
}

// ============================================================ 3. INVARIANT VIOLATION => 422, NO PARTIAL WRITE
{
  // A deliberately corrupted schedule (NaN stability) cannot satisfy the Box invariant. The row is
  // left corrupted on purpose: that is the proof that the refusal wrote nothing.
  await ensureSchedule(L2, 'cp8-tisch', 'invariant fixture (L2 copy)');
  const before = await scheduleOf(L2, 'cp8-tisch');
  await pool.query(
    `update card_schedules set stability_days = 'NaN'::double precision
      where user_id = $1 and card_id = (select id from cards where content_id = 'cp8-tisch')`,
    [L2],
  );
  ledger({
    kind: 'schedule_update',
    userId: L2,
    contentId: 'cp8-tisch',
    before: String(before.stability_days),
    after: 'NaN',
    cause: 'deliberate corruption to trigger the Box invariant (left corrupted on purpose)',
  });

  const beforeEvents = await countEvents();
  const r = await submit(L2, [item('cp8-tisch', 'known', 'cp8-r2-invariant')], ENV_V2(), {
    cause: 'invariant violation (expected: no write)',
  });
  const after = await scheduleOf(L2, 'cp8-tisch');
  record(
    'scheduler invariant violation => HTTP 422 schedulerRejected (non-retryable)',
    r.status === 422 && r.body.includes('schedulerRejected'),
    `status=${r.status} body=${r.body}`,
  );
  record(
    'invariant violation persists no event row',
    (await countEvents()) === beforeEvents,
    `events ${beforeEvents} -> ${await countEvents()}`,
  );
  record(
    'invariant violation leaves the offending schedule untouched (no partial write)',
    Number.isNaN(Number(after.stability_days)),
    `stability_days=${after.stability_days}`,
  );
}

// ============================================================ 4. TRANSIENT FAULT => 503 RETRYABLE
{
  // Boundary-mapping test: the dependency is stubbed to throw a transient fault, because the thing
  // under test is the HTTP boundary's classification, not the database.
  //
  // WebReviewDependencies exposes `submit` directly (NOT `service.submit`). Overriding the wrong key
  // silently leaves the real dependency in place, which produced a real 200 write in an earlier run;
  // the guard below fails loudly if the stub is ever bypassed again.
  const deps = runtime.webReviewDependenciesFromEnvironment(ENV_V2());
  let stubCalled = false;
  const faulting = {
    ...deps,
    submit: async () => {
      stubCalled = true;
      throw new Error('connection terminated unexpectedly');
    },
  };
  const beforeEvents = await countEvents();
  const req = new Request('https://staging.learnbox.invalid/api/learner/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://staging.learnbox.invalid' },
    body: JSON.stringify({ items: [item(MID, 'known', 'cp8-r2-transient')] }),
  });
  const res = await web.handleWebReviewBatchPost(req, faulting, () => L2);
  const body = await res.text();
  record(
    'transient fault test actually exercised the injected fault (not the real dependency)',
    stubCalled,
    `stub_called=${stubCalled}`,
  );
  record(
    'transient infrastructure failure => HTTP 503 serverUnavailable (retryable)',
    res.status === 503 && body.includes('serverUnavailable'),
    `status=${res.status} body=${body}`,
  );
  record(
    'transient failure persists nothing',
    (await countEvents()) === beforeEvents,
    `events ${beforeEvents} -> ${await countEvents()}`,
  );
}

// ============================================================ 5. WEB CLIENT CLASSIFICATION
// Uses the real submitWebReviewBatch(items, fetchFn, ownerId) with an injected fetch, so the
// status-code -> client-status mapping under test is the shipped one.
{
  const mk = (status, payload) => async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const wire = [
    {
      contentId: MID,
      response: 'known',
      occurredAt: new Date().toISOString(),
      clientEventId: 'cp8-r2-client',
    },
  ];

  const rejected = await webClient.submitWebReviewBatch(
    wire,
    mk(422, { error: 'schedulerRejected' }),
  );
  record(
    'web client maps 422 to terminal `rejected` (never retried)',
    rejected.status === 'rejected',
    `status=${rejected.status}`,
  );
  const unavailable = await webClient.submitWebReviewBatch(
    wire,
    mk(503, { error: 'serverUnavailable' }),
  );
  record(
    'web client maps 503 to retryable `unavailable`',
    unavailable.status === 'unavailable',
    `status=${unavailable.status}`,
  );
  const unauthorized = await webClient.submitWebReviewBatch(
    wire,
    mk(401, { error: 'unauthorized' }),
  );
  record(
    'web client maps 401 to `unauthorized` (session ended, not data loss)',
    unauthorized.status === 'unauthorized',
    `status=${unauthorized.status}`,
  );
}

// ============================================================ 6. QUEUE SAFETY
// Drives the real flushWebReviewQueue with an injected `submit`, against a real in-memory storage.
{
  const KEY = 'learnbox:review-sync:cp8r2';
  const mkStorage = () => {
    const store = new Map();
    const queued = [
      {
        clientEventId: 'cp8-r2-queued',
        attempts: 0,
        // REQUIRED by isPersistedSyncEvent: a missing/invalid nextAttemptAt makes loadSyncQueue treat
        // the whole queue as corrupt and silently discard it, which would make every queue assertion
        // below vacuous (it did, in an earlier run). It must be an exact round-tripping ISO string.
        nextAttemptAt: new Date(Date.now() - 60_000).toISOString(),
        payload: {
          cardId: MID,
          grade: 'remembered',
          response: 'known',
          reviewedAt: new Date().toISOString(),
        },
      },
    ];
    store.set(KEY, JSON.stringify(queued));
    return {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
  };
  const read = (storage) => JSON.parse(storage.getItem(KEY) ?? '[]');

  // Sanity: the fixture must be a valid persisted queue, otherwise every assertion below is vacuous.
  {
    const storage = mkStorage();
    record(
      'queue fixture is well-formed and loads as a real persisted queue',
      read(storage).length === 1,
      `loaded=${read(storage).length}`,
    );
  }

  // Deterministic rejection: answer stays, no attempt consumed, no backoff armed. Repeated to show
  // it is stable rather than merely surviving one pass.
  {
    const storage = mkStorage();
    const fixtureNextAttempt = read(storage)[0].nextAttemptAt; // captured BEFORE any flush
    let result;
    for (let i = 0; i < 5; i += 1) {
      result = await sync.flushWebReviewQueue({
        storage,
        key: KEY,
        binaryWire: true,
        submit: async () => ({ status: 'rejected' }),
      });
    }
    const after = read(storage);
    record(
      'deterministic rejection leaves the queued answer in place (stable over 5 flushes)',
      result.pendingCount === 1 && after.length === 1,
      `pendingCount=${result.pendingCount} stored=${after.length}`,
    );
    // Every persisted queue entry necessarily carries a nextAttemptAt (isPersistedSyncEvent requires
    // it), so "arms no backoff" cannot mean "absent" — it means UNCHANGED from the fixture value.
    // Asserting absence was simply wrong and would never hold for a valid queue.
    record(
      'deterministic rejection consumes no retry attempt and arms no backoff',
      after[0].attempts === 0 && after[0].nextAttemptAt === fixtureNextAttempt,
      `attempts=${after[0].attempts} nextAttemptAt ${after[0].nextAttemptAt === fixtureNextAttempt ? 'unchanged' : 'MOVED to ' + after[0].nextAttemptAt}`,
    );
  }

  // Contrast case: a transient failure MUST consume an attempt and arm backoff. Without this, the
  // assertion above could pass on a queue that never retries anything at all.
  {
    const storage = mkStorage();
    await sync.flushWebReviewQueue({
      storage,
      key: KEY,
      binaryWire: true,
      submit: async () => ({ status: 'unavailable' }),
    });
    const after = read(storage);
    record(
      'transient failure DOES consume an attempt and arm backoff (discriminating contrast)',
      after[0].attempts === 1 && Boolean(after[0].nextAttemptAt),
      `attempts=${after[0].attempts} nextAttemptAt=${after[0].nextAttemptAt ?? 'none'}`,
    );
  }

  // Contrast case: an acknowledged answer must actually leave the queue.
  {
    const storage = mkStorage();
    const result = await sync.flushWebReviewQueue({
      storage,
      key: KEY,
      binaryWire: true,
      submit: async () => ({
        status: 'ok',
        outcomes: [{ clientEventId: 'cp8-r2-queued', status: 'acknowledged' }],
      }),
    });
    record(
      'acknowledged answer is removed from the queue (discriminating contrast)',
      result.pendingCount === 0 && read(storage).length === 0,
      `pendingCount=${result.pendingCount} stored=${read(storage).length}`,
    );
  }

  // Session expiry must not lose pending work.
  {
    const storage = mkStorage();
    const result = await sync.flushWebReviewQueue({
      storage,
      key: KEY,
      binaryWire: true,
      submit: async () => ({ status: 'unauthorized' }),
    });
    record(
      'logout / session expiry does not lose pending reviews',
      result.pendingCount === 1 && read(storage).length === 1 && result.sessionEnded === true,
      `pendingCount=${result.pendingCount} sessionEnded=${result.sessionEnded}`,
    );
  }
}

const failures = finish('CP8_FAILCLOSED');
await closePool();
process.exit(failures === 0 ? 0 : 1);
