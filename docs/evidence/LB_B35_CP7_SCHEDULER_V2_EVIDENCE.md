# LB-B35 CP7 — Scheduler V2 (GR-1.8 + ENG-DROP) implementation evidence

Status: **implemented behind `LEARNBOX_SCHEDULER_V2` (default OFF); awaiting the CP7 implementation review gate. NOT merged.**
Nothing here touches Production: no migration 0023 on Production, no Production flag, no Admin or Store work.

Owner decisions implemented (2026-10-01): Option 2 GR-1.8; ENG-DROP; Box transition is an explicit scheduler invariant; legacy grades are
binary under V2 (`forgot`→unknown, `hard`/`remembered`/`mastered`→known); `card_schedules.state` written but never an input; recall
probe NOT implemented; V2 fails closed without the 0023 schema; flag off is bit-identical to V1.

## 1. What was built

- `packages/learning-engine/src/scheduler-v2.ts` — pure `scheduleBinaryReview`, the single output gate `finalizeBinarySchedule`, the
  invariant check `assertBoxTransition` (throws `SchedulerInvariantError`) and `stateAfterBinaryReview`.
- `apps/api/src/reviews/scheduler-v2-preflight.ts` — read-only schema preflight. Checks `review_events.engine_version` exists and is
  `smallint`, `review_events.response` exists, and the CHECK `review_events_engine_version_valid` admits `2`. A failed preflight is never
  cached; a successful one is memoised. Anything it cannot positively recognise is treated as not accepting.
- `mobile-review-batch.service.ts` — optional `{schedulerV2, schedulerV2Preflight}`. Unset or false takes the v1.2.1 path unchanged. True
  runs the preflight before every batch, schedules with V2, and stamps `engine_version = 2`. A V2 service cannot be constructed without a
  preflight.
- `postgres-review-event.store.ts` — `engine_version` is named in the INSERT only when set, so the flag-off SQL text is unchanged.
- Web and mobile review runtimes read `LEARNBOX_SCHEDULER_V2` (exact string `true` only). `compose.yaml` and `app.env.example` pass it
  through, default `false`.

Rule set (all from the owner decisions): Known from Box 1 → Box 2 (stability at least 1 day). Known from Box 2–4 → ×1.8 and never more than
one Box up. Known in Box 5 → ×3, capped at 180 days; a stored value above the cap is pulled back to 180, never grown. Unknown from
Box 2–5 → exactly one Box down, placed inside that Box; Unknown in Box 1 → Box 1. `difficulty` and `lapses` keep the V1 arithmetic as
compatibility columns and are never read to schedule.

## 2. Evidence

All results below are from real runs on this branch. The Postgres suites ran against `postgres:17-alpine` in a throwaway container.

### 2.1 State-space sweep (real function, not the simulator)

4,546 distinct stability points from 0.0014 d to 4,000 d, every Box populated (Box 1: 2,472; 2: 422; 3: 327; 4: 422; 5: 903), every Box edge
(1, 3, 7, 21) at −1e-3 … +1e-3 including ±1e-9 and ±1e-12, and the cap region (179.999, 180, 180.0001, 540, 4,000). Each point is evaluated for
Known and Unknown: **9,092 transitions**, each checked against an independently written reference model and the invariants (Unknown: exactly
one Box down, Box 1 stays; Known: never lowers, at most +1, Box 1 always graduates, Box 5 stays and ≤180 d; stability finite and
positive; due strictly after now). The test asserts the point count, every Box and every edge are covered.

### 2.2 GR-1.8 pinned Known progression

The 14-Known trace from a new card equals the committed CP6 trace: `B2(1d) B2(1.8d) B3(3.2d) B3(5.8d) B4(10d) B4(19d) B5(34d) B5(102d)
B5(180d)…`. Maximum consecutive Known without a visible Box change is 1, and Box 5 is reached on the 7th Known.

### 2.3 Other scheduler obligations

Repeated Unknown from Box 5 walks 4,3,2,1,1,1…; alternating Known/Unknown from Box 1; recovery after Unknown; 1,000 deterministic seeded
sequences of 40 answers against the independent reference; 180-day cap including a legacy 540-day value; Unknown at and beyond the cap (21,
38, 63, 180, 180.0001, 400, 4,000) lands in Box 4; legacy grades are indistinguishable from their binary projection; changing
`state`/`difficulty`/`lapses`/`dueAt` over the sweep cannot change stability or interval (lateness likewise); `state` written exactly as
decided; 12 invalid transitions each throw `SchedulerInvariantError`; the single output gate returns no schedule for an invalid proposal.

### 2.4 Mutation evidence

`tools/cp7/mutation-harness.py` applies 35 single defects and runs the relevant suite (raw output: `docs/evidence/cp7/mutation-run.txt`):
**35 of 35 killed, 0 survivors, 0 skips.** Scheduler mutants include the ENG-CLAMP regression (7 tests fail), Unknown floor removed,
graduation removed, factor and cap changes, margin 1e-9 → 0, assertion disabled, legacy `hard` mis-projected, state/lateness leaking into
scheduling, flag-off using V2, preflight skipped, stamp dropped or leaking, V2 constructible without preflight, wrong type/missing
column/missing constraint tolerated, failed preflight cached, and the flag accepting `TRUE`/`1`.

Eight further mutants guard the §2.9 failure semantics, so a regression to the pre-fix behaviour cannot pass the suite:

| Mutation                                                     | Killed by                                    |
| ------------------------------------------------------------ | -------------------------------------------- |
| Deterministic errors collapse back to `serverUnavailable`    | service-boundary code/`retryable` assertions |
| `cause` discarded                                            | the operator-diagnostic assertion            |
| `schedulerRejected` marked retryable                         | the per-code retryability test               |
| Invariant violations no longer deterministic                 | the invariant service-boundary test          |
| Client-facing message interpolates the raw error             | the no-internals-leaked assertion            |
| HTTP boundary answers 503 instead of 422                     | the HTTP-boundary status tests               |
| Client maps 422 back to `unavailable`                        | the client status-mapping tests              |
| Sync retries a deterministic rejection (the original defect) | the attempts/backoff preservation tests      |

### 2.5 Real Postgres (20 tests, `apps/website/test/cp7-scheduler-v2-db.test.ts`)

History append-only: every column of every pre-existing event is unchanged after V2 writes. Activation: constructing the V2 stack and running
the preflight leaves every schedule and event row byte-identical; an existing Box-1 card moves to Box 2 only on its next Known. Unknown from
16 stored values (0.0104 … 4,000 d) drops exactly one Box through Postgres. A value 1e-8 under the 21-day edge round-trips through `double
precision` in its Box. An invariant violation refuses the batch with no event and no schedule change. Idempotent replay neither re-schedules
nor re-stamps. Legacy four-grade events schedule as their projection under V2 and store `response NULL`, `engine_version 2`.

### 2.6 Flag-off equivalence to V1

`scheduleReview` over 12,000 deterministic inputs hashes to `5cd3080ab280b3ea65bebf07866f0b4303fb7c5b216a35b75f8aca5fe5cb36a2`, generated
from a build of pristine `origin/main` (before CP7) and verified identical on Node 22 and Node 26 and on the CP7 branch. The service path over 10,000 further inputs (both flag-off
spellings) writes exactly `scheduleReview(stored, grade, now)` with no engine stamp. On a database **without** 0023, flag unset/false/empty
works through the real web and mobile entry points and stores no engine column. The INSERT text is asserted to contain neither `engine_version`
nor `response` when unset.

### 2.7 Migration and preflight

On a migrated database the preflight passes. Without 0023 the preflight error names the missing column and the fix (“Apply migration 0023…
never falls back to V1 silently”). Incompatible shapes are refused: dropped constraint, a constraint that excludes 2, wrong column type. With
the flag true and no 0023, both the web and the mobile entry points refuse the review and persist nothing. A failed preflight is retried on the
next call, so applying 0023 re-enables V2 without a restart. The constraint reader was written against the real Postgres normalisation
(`(engine_version >= 1) AND (engine_version <= 100)`) after a first version rejected the real schema (see §3).

**Where that operator message is actually visible (corrected).** An earlier revision of this document claimed “a clear operator error” without
naming the boundary, which overstated it: the service originally flattened every non-idempotency failure into
`serverUnavailable` / “Review batch interrupted.” and discarded the cause, so the preflight text reached neither the operator log nor the
client. That is fixed in this checkpoint (see §2.9); the precise scope of each message is now:

- **Preflight function** — full diagnostic: the missing/incompatible column, the “apply 0023” instruction, and the no-silent-fallback statement.
- **Server log** — `[reviews] schedulerRejected SchedulerV2PreflightError: <full text>`, via an injectable sink.
- **`MobileReviewBatchError.cause`** — the original error object, unmodified, for any server-side handler.
- **HTTP response** — only `{"error":"schedulerRejected"}` with status 422. No column name, migration number, flag name or stack ever crosses
  the boundary; asserted by negative tests.

### 2.8 Rollback rehearsal

Seven Knowns under V2 reach Box 5; the same seven under V1 leave a smaller stability. After flipping the flag off, the next answer runs V1
from the stored larger stability (×1.8 exactly), the Box does not drop at the switch, and earlier V2 events keep their stamp unchanged. An
Unknown under V1 afterwards is valid; re-enabling V2 continues from what is stored. Documented consequence: cards advanced under V2 keep a
larger stability after rollback and are reviewed later than V1 alone would have scheduled; there is no automatic demotion.

### 2.9 Deterministic failure semantics (preflight and invariant) vs transient

Scheduler V2 has two deterministic failure modes — a schema preflight refusal and a Box-transition invariant violation. Both are raised before
any write. They are now distinguished from a transient outage end to end, because retrying either can never succeed until an operator acts:

| Failure               | Service code        | `retryable` | HTTP | Client status | Queue effect                                                   |
| --------------------- | ------------------- | ----------- | ---- | ------------- | -------------------------------------------------------------- |
| Preflight refusal     | `schedulerRejected` | `false`     | 422  | `rejected`    | event preserved, **no** attempt consumed, **no** backoff armed |
| Invariant violation   | `schedulerRejected` | `false`     | 422  | `rejected`    | same                                                           |
| Transient store fault | `serverUnavailable` | `true`      | 503  | `unavailable` | attempt incremented, exponential backoff                       |

The original error is preserved as `cause` and logged server-side. The pre-fix client behaviour requeued **every** non-`ok` result through
`retryAfter`, so a deterministic refusal would have retried on an exponential backoff indefinitely (capped at 5 minutes) and burned attempts
toward quarantine; a rejection now leaves `attempts` and `nextAttemptAt` byte-identical, proven over five consecutive rejections.

Safety properties are unchanged and re-asserted at the service boundary: nothing is persisted on either failure, there is no partial write
(`writeAtomically` and `ensureApprovedSchedule` are never reached), and there is still no silent fallback to V1.

## 3. Defects found and changed assumptions

1. **Preflight rejected the real 0023 schema** (my bug, caught by the Postgres suite before any push): it parsed `BETWEEN 1 AND n`, but
   Postgres stores the constraint as `(engine_version >= 1) AND (engine_version <= 100)`. Fixed; both spellings are now read, anything
   unrecognised fails closed, and the reader has its own unit tests.
2. **Scheduler V2 failure semantics were undiagnosable and wrongly retryable** (found by a second-pass review of the first green head, fixed
   in this checkpoint). `MobileReviewBatchService.submit` flattened every non-idempotency failure into
   `MobileReviewBatchError('serverUnavailable', 'Review batch interrupted.')` and dropped the original error, and the class had no `cause`
   field. Consequences: the preflight's “apply migration 0023” text reached neither the operator log nor any caller, and a deterministic
   refusal was indistinguishable from a transient outage — the web sync requeued it through `retryAfter`, retrying bytes that could never be
   accepted on an exponential backoff indefinitely and burning attempts toward quarantine. The fail-closed property itself was never broken
   (nothing was persisted, no silent V1 fallback), so this was a diagnosability and retry-semantics defect, not a safety one. Fixed per §2.9;
   the §2.7 wording that called this “a clear operator error” was corrected because it described the preflight function rather than the
   externally relevant boundary.

3. **Two mutants survived the first harness run** (runtime assertion disabled; Known may skip a Box). Cause: the clamp makes the assertion
   unreachable from `scheduleBinaryReview` at factor 1.8, so no test could reach it. Fixed by extracting the single output gate
   `finalizeBinarySchedule` and testing it with invalid proposals; the wrong-type and constraint preflight mutants likewise got direct tests.
   The final run has 0 survivors.
4. **The gate did not reject a NaN proposal** (found by the new gate test): `boxFromStabilityDays` throws a `RangeError` for NaN rather than a
   `SchedulerInvariantError`. The gate now checks finite-and-positive first.
5. **CI-only failure, Node-version dependence in my own test (first push, `quality`):** the flag-off digest test generated its inputs with
   `10 ** x`, which V8 rounds differently on Node 22 (CI) and the newer local Node, so the generated inputs, and so the pinned digest, differed
   per runtime. Local `pnpm check` could not see it. I reproduced it with a Node 22 container, replaced the generator with an integer LCG and
   exact IEEE operations only, regenerated the digest from pristine `main`, and confirmed it equal on Node 22, Node 26 and the branch. The
   sweep grid no longer uses `**` either (4,546 points unchanged). V1 itself was never at fault: its output is identical across runtimes.
6. **Sweep size**: the first sweep had 3,646 points; the owner-required 4,000 was met by raising the grid, and the test asserts the count.
7. **Assumption changed:** the plan treated the 10,000-input equivalence as a single engine test. It is now both an engine-level digest
   (12,000) and a service-level equivalence (10,000), because the flag lives in the service.

Not done by design: recall probe (deferred), `state` retirement, Production anything, mobile UX.

## 4. Activation and rollback plan (unchanged from the CP7 plan, nothing executed)

Activation requires, in order and each with owner approval: staging restore of a production-shaped dump, migration 0023 on staging, deploy this
commit with the flag off and confirm V1 behavior, then flag on with the DB suite, a browser pass and a rollback rehearsal; then a separate
Production gate (fresh backup and restore check, 0023, exact artifact provenance, flags one at a time with the scheduler flag last and alone,
integrity checks after each). Rollback is `LEARNBOX_SCHEDULER_V2=false` and a restart: no migration revert, no data change, with the
documented larger-stability consequence above.
