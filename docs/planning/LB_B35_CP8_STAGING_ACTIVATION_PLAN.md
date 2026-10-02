# LB-B35 CP8 — Scheduler V2 staging activation (web only)

**Status:** plan written before any change. CP8 is an **evidence checkpoint**, not a Production rollout.

**Candidate under test:** `main` at `f1a85fd5cf7e1ea9dbbc017da7fee0d2ccefc643` (tree
`a72126c490691752d1ef5e932c01e836f3617c15`), verified clean before provisioning. CP7 code merge was
`713a9a941481965f74f905c9bee4226de442e0a5`; docs closure `f1a85fd5…` is the current head.

## 1. Hard boundaries

Production is untouched for the whole checkpoint: no `0023` on Production, no Production flag change, no
Scheduler V2 activation there, no Admin exposure, no Store work. CP8 also does **not** retire
`card_schedules.state`, redesign unrelated code, or broaden scheduler policy. The Dart/native client is
explicitly **out of activation scope**: the recorded HTTP-422 compatibility requirement remains a blocker
before any native activation, and CP8 may not claim Scheduler V2 is ready for native/mobile.

**Pre-flight Production assertion (re-done correctly in CP8).** An earlier probe checked
`card_schedules.engine_version`, which `0023` never creates — that was the wrong object and the resulting
"0023 not applied" claim was accidentally right for the wrong reason. CP8 asserts the real `0023` surface on
Production: `review_events.response`, `review_events.engine_version`, `users.timezone`, tables
`learner_daily_plans` / `review_event_rejections`, constraints `review_events_engine_version_valid`,
`review_events_response_valid`, `users_timezone_shape`. Verified result: **every one absent** on Production.

## 2. Architecture facts that shape the proof

These were read out of the repository, not assumed, and they change what "existing schedules are not
rewritten" can mean:

1. **There is no `box` column.** `card_schedules` stores `stability_days` (plus `state`, `due_at`, …) and Box
   is _derived_ (`boxFromStabilityDays`). So activation cannot "rewrite Box"; the proof obligation is that
   the stored `stability_days` / `due_at` of untouched cards do not change, and that derived Box is stable.
2. **`0023` is additive and does not touch `card_schedules` at all.** It adds `users.timezone`,
   `review_events.response`, `review_events.engine_version`, two new tables, three CHECK constraints and
   least-privilege grants. Every statement is idempotent. So "applying 0023 alone changes nothing" is
   testable as: zero row deltas, identical content fingerprints, and new columns all NULL.
3. **The preflight gates on `review_events`, not `card_schedules`** — `engine_version` must exist and be
   `smallint`, `response` must exist, and `review_events_engine_version_valid` must accept the stamp `2`.
   This is the exact surface the fail-closed negative tests must break.
4. **`engine_version` is written only when the flag is on** (`...(useV2 ? { engineVersion } : {})`), so
   "`engine_version = 2` only for V2 events" is a property of the write path, provable by SQL partition.

## 3. Staging environment

Production-shaped and fully isolated: the repository's own `infrastructure/production/app` image build from
the candidate SHA, a dedicated Postgres 17 container, its own network, its own port, and a database restored
to a **Production-shaped schema built from the repository migration path `0001 → 0022`** (i.e. the exact
pre-`0023` state Production is in today). No Production credential, host or DSN is used anywhere; no
Production data is copied. Fixtures are synthetic learners and cards created locally.

Rationale for schema-from-migrations rather than a Production dump: CP8 must prove migration behaviour and
scheduling correctness, which synthetic rows exercise fully, and copying real learner history into a staging
container would be an unnecessary data-handling exposure. The limitation is recorded in the evidence.

## 4. Sequence (each step gated on the previous one)

1. **Baseline + fingerprint, pre-`0023`.** Build schema `0001→0022`, seed synthetic learners/cards/history,
   then fingerprint: per-table row counts, and content digests over `review_events` and `card_schedules`
   ordered deterministically. Assert the preflight surface is absent, exactly like Production.
2. **Flag-OFF on the pre-`0023` schema.** Prove the app works with no `0023` (V1 path untouched) — this is
   the state Production is in.
3. **Apply `0023` via the repository migration path.** Record before/after. Assert: no row deltas, identical
   content digests, new columns present and 100% NULL, constraints present, and idempotency (second apply is
   a no-op).
4. **Flag-OFF after `0023` — V1 equivalence.** Same inputs, assert identical scheduling outcomes to step 2
   and `engine_version IS NULL` for every new event.
5. **Enable `LEARNBOX_SCHEDULER_V2=true` for web only.** Re-fingerprint immediately **before any review** to
   prove activation alone rewrites nothing.
6. **End-to-end proof through the real web/API/database path** (every item from the owner's list):
   known→known, unknown→unknown, legacy shadow grade correctness, `engine_version=2` only for V2 events,
   no schedule rewrite on activation, a Box-1 card advancing per GR-1.8 only after its next future Known,
   the explicit Box invariant on Known, Unknown dropping exactly one Box, Box 5 behaviour and the 180-day
   cap, no transition exceeding permitted movement, invariant violation failing closed with no partial
   persistence, missing/invalid `0023` preflight failing closed, deterministic rejection as HTTP 422 and
   non-retryable in the web client, transient failure as HTTP 503 and retryable, review-event idempotency,
   unsynced web queue safety, and logout/session-expiry not losing pending reviews.
   The CP6/CP7 **pinned Known progression trace** is asserted end-to-end here, not only as a unit test.
7. **Rollback rehearsal.** Flag OFF → prove new writes return to V1 (`engine_version IS NULL`), prove no
   history was rewritten, and explicitly measure and document the known one-way consequence: **stability
   accumulated under V2 remains after rollback** (V2 rows are historical fact; nothing rewrites them).
8. **Write accounting.** Re-run fingerprints and account for every staging write with an explanation.
   Unexplained rows are investigated and reported — never deleted to make counts match.

## 5. Stop conditions

If staging exposes a real defect: stop, identify root cause, report before broadening any change. A failure
whose root cause is in the test harness is fixed in the harness and stated as such; a failure in product code
is a CP8 defect and goes to the owner before any fix is merged.

## 6. Model selection

CP8 is HIGH RISK (migration `0023`, Scheduler V2, real scheduling writes). Design, defect analysis and the
final review run on the strongest **verified usable** model. `claude-opus-5` is that model; stronger listed
models are re-probed once at this checkpoint and only adopted if a live probe succeeds. An independent
second-pass review on the exact candidate SHA and evidence is required before declaring CP8 complete.
