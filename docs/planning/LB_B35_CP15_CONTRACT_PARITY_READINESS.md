# LB-B35 CP15 — Scheduler V2 Contract & Client-Parity Readiness

**Status:** CP15 analysis + Workstream A implementation complete. Scheduler V2 **NOT** enabled.
**Branch:** `feat/lb-b35-cp15-contract-parity`
**Base:** `main` @ `47030ddf1af81e1dbf835e2f46a98df40e975029`
**Production:** untouched throughout (`sha256:cb3090da…`, `RestartCount=0`, `StartedAt 2026-10-02T21:28:45Z`)
**Flag:** `LEARNBOX_SCHEDULER_V2` remains **ABSENT**

---

## Workstream A — the `schedulerRejected` wire contract

### Canonical contract

HTTP **422** with body exactly `{"error":"schedulerRejected"}`.

Defined once, in `packages/learning-engine/src/review-sync-wire-contract.ts`:

| Export                                 | Meaning                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SCHEDULER_REJECTED_CODE`              | the discriminator string                                                                        |
| `SCHEDULER_REJECTED_STATUS`            | `422`                                                                                           |
| `REVIEW_SYNC_ERROR_KEY`                | the body key (`error`)                                                                          |
| `schedulerRejectedBody()`              | the exact body object                                                                           |
| `REVIEW_SYNC_NON_REJECTION_RESPONSES`  | the pinned non-rejection corpus (`validation` 400, `invalidToken` 401, `serverUnavailable` 503) |
| `REVIEW_SYNC_NEAR_MISS_BODIES`         | shapes that must **not** be read as the refusal                                                 |
| `buildReviewSyncWireContractFixture()` | the cross-language fixture payload                                                              |

`packages/learning-engine` was the correct home because it is already a shared dependency of both
boundaries, so neither boundary needs a new dependency edge.

### Why not "three tests with the same literal"

The owner's acceptance criterion is that a **server-side rename must break CI** before it can
silently convert the native deterministic rejection into a retryable failure. Three independent
tests each restating the literal cannot satisfy that: renaming the server and all three tests
together still passes.

The chosen mechanism removes the independence:

1. Both TypeScript boundaries now **import** the constant instead of restating it.
   - `apps/website/lib/mobile-review-http.ts` — `schedulerRejectedResponse()` built from the canonical body/status.
   - `apps/website/lib/learner-review-web-http.ts` — same.
2. Dart cannot import TypeScript, so `scripts/sync-review-sync-wire-contract.mjs` **generates**
   `apps/mobile/test/fixtures/review_sync_wire_contract.json` from the canonical module.
3. `pnpm verify:review-sync-wire-contract` (`--check` mode) fails when the committed fixture no
   longer matches the canonical module. It is wired into **`pnpm check`**, which the required
   `quality` job runs (`.github/workflows/quality.yml:37`).
4. `apps/mobile/test/review_sync_wire_contract_test.dart` **consumes the generated fixture** (it
   contains no literal of its own) and drives the real `HttpReviewSyncTransport` and the real
   `ReviewSyncCoordinator`. The required `mobile` job runs `flutter test`
   (`.github/workflows/quality.yml:57`).

This is the "contract-conformance test that consumes the authoritative server fixture from the Dart
side" option, selected because cross-language code generation into `lib/` would have been
disproportionate for a three-field contract.

### What the Dart conformance test pins

- status is exactly the fixture's `422`
- body discriminator is exactly the fixture's `schedulerRejected`
- native maps it to a **terminal** `MobileReviewTransportException` with `retryable == false`
- the coordinator reports `SchedulerRejected`
- **the queue remains fully intact** (asserted by exact `clientEventId` set, not just a count)
- **no retry timer is armed and no retry budget is consumed** (asserted via the coordinator's
  retry-scheduling surface)
- every pinned non-rejection code (400/401/503) and every near-miss body stays retryable

### Mutation proof (the part that actually matters)

A gate nobody has tried to defeat is not evidence. Three mutations were applied and reverted:

| #   | Mutation                                                                     | Expected        | Observed                                                                                                                             |
| --- | ---------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | rename code in canonical module, do **not** regenerate fixture               | `quality` fails | **FAILED as required** — `verify:review-sync-wire-contract` exited 1 with the "review it together with the native transport" message |
| M2  | rename **and** regenerate the fixture (the realistic "fix the failure" move) | `mobile` fails  | **FAILED as required** — Dart test reported the refusal becoming `RetryableFailure`, i.e. exactly the harm the criterion forbids     |
| M3  | change status `422 → 409`, regenerate fixture                                | `mobile` fails  | **FAILED as required** — `Expected: <422> Actual: <409>` and the transport stopped throwing a terminal exception                     |

M2 is the decisive case: regenerating the fixture to silence the drift check does **not** buy a
green build, because the Dart side then fails on behaviour. Both escape routes are closed.

After reverting all three, the full suite is green again.

### Independent verification (adversarial review)

An adversarial reviewer attacked the acceptance criterion. I verified every material claim myself
rather than adopting it; two findings were real and are now **fixed**, two were partly overstated.

**CRITICAL-4 (real, MEDIUM → FIXED): the fixture pin test was vacuous.**
`apps/mobile/test/review_sync_wire_contract_test.dart:69` asserted the body's `error` field was
`isA<String>()` — so a fixture carrying `{"error":"schedulerDenied"}` would have satisfied it. The
conformance tests were the real guard, but the _pin_ test was weaker than its own comment claimed.
It now asserts the literal value and the single key name, with a comment explaining the literal is
deliberate: Dart cannot import the canonical constant, so this is the tripwire for the transport's
own hardcoded match site.

**CRITICAL-1/CRITICAL-2 (stale): "the fixture and Dart test are untracked, so both CI jobs fail."**
True at review time — the reviewer read the working tree before I committed. Both files are tracked
in `a919ab88`, and neither is gitignored. The reviewer's underlying architectural point is correct
and worth recording: the `mobile` job has no Node/pnpm step and never regenerates the fixture, so
the mechanism depends on the fixture being **committed**. That is the intended design, and it is now
satisfied.

**LOW (verified, downgraded): unscoped `findByClientEventId`.**
`postgres-review-event.store.ts:101` queries `WHERE client_event_id = $1` without a `user_id` scope.
The reviewer correctly hedged that its reachability was unconfirmed — I checked: the live batch path
uses the scoped `findByLearnerAndClientEventId` (`mobile-review-batch.service.ts:235`), and
`recordReviewEvent` (the only caller of the unscoped variant) has **no non-test caller** in
`apps/` or `packages/`. Unreachable in production; worth deleting or scoping, not a blocker.

**Operational finding (verified, wrong path cited): preflight success is memoised per process.**
The reviewer cited `packages/learning-engine/src/scheduler-v2-preflight.ts`, which does not exist;
the real file is `apps/api/src/reviews/scheduler-v2-preflight.ts:97`. The behaviour is as described:
a successful preflight is cached for the process lifetime, a failed one is not. **Consequence for
rollback level 2:** setting `LEARNBOX_SCHEDULER_V2=false` does not take effect in a running process
that has already memoised a successful preflight — flag rollback requires a container restart. This
is recorded in the rollback table below.

**F2 (real, HIGH → FIXED): the service layer was a fourth, unbound definition site.**
`apps/api/src/reviews/mobile-review-batch.service.ts` held three independent `'schedulerRejected'`
literals (the error-code union, `NON_RETRYABLE_CODES`, and the throw site) and did **not** import
the canonical module. I confirmed by mutation (M4) that renaming them _was_ caught — but only
incidentally, by a literal in an unrelated existing test (`TS2345`), which is fragile evidence. All
three now derive from `SCHEDULER_REJECTED_CODE`.

**F3 (real, MEDIUM → FIXED): a fourth consumer classified by status only.**
`apps/website/lib/learner-review-web-client.ts:60` matched a bare `422` and never reads the body, so
a _status_ change would have broken it silently. It now imports `SCHEDULER_REJECTED_STATUS`.

**F4 (real, LOW → FIXED): the drift gate depended on implicit script ordering.**
`verify:review-sync-wire-contract` relied on an earlier `pnpm check` step having built the engine.
It now builds the engine itself, verified by deleting `packages/learning-engine/dist` and running
the gate standalone — it passed. A `sync:review-sync-wire-contract` script was added for
regeneration.

**F1 (overstated): "the fixture and Dart test are untracked."** True at review time only because
the branch was uncommitted; both are now committed and neither is gitignored.

**Re-proof after the fixes (M5).** With all four TypeScript sites deriving from the canonical
constant, renaming only the canonical constant:

- M5a — fixture not regenerated → `quality` fails (`out of sync`)
- M5b — fixture regenerated → `mobile` fails (`Expected: … retryable: false`, and the coordinator
  no longer reports `SchedulerRejected`)

Both escape routes remain closed with the contract now bound at **four** TypeScript sites instead
of two.

### Verified locally

- `node scripts/sync-review-sync-wire-contract.mjs --check` → matches (status 422, code `schedulerRejected`)
- `flutter test test/review_sync_wire_contract_test.dart` → **6/6 pass**
- `apps/mobile` full suite → **299/299 pass**
- `dart format --set-exit-if-changed lib test` → clean (my test needed reformatting; fixed before push)
- `flutter analyze` → no issues
- `npx vitest run test/cp15-review-sync-wire-contract.test.ts` → **8/8 pass**
- `pnpm typecheck` → all packages pass
- `eslint` on every file I touched → clean

The only `pnpm check` failures are in `apps/website/dist-cp8/` and `tools/cp8/superseded/`, which
are **gitignored** (`.gitignore:32`, `.gitignore:34`), absent from a CI checkout, and untouched by
this change.

### Verdict

**422 contract blocker: CLOSED for the web and mobile-review boundaries and the Dart transport**,
subject to the independent-review findings in §Independent Verification. The contract is now
mechanically shared on the TypeScript side and mechanically verified on the Dart side.

---

## Workstream B — native/Web scheduler input parity

I derived the native path end-to-end before designing anything, and the derivation changed the
conclusion.

### Derived current native path

| Layer       | File                                                 | Behaviour                                                         |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| UX          | `apps/mobile/lib/features/review/review_screen.dart` | **four grades** (`again`/`hard`/`good`/`easy`)                    |
| Domain      | `review_grade.dart`                                  | `enum ReviewGrade { again, hard, good, easy }` — no binary notion |
| Event       | `pending_review_event.dart`                          | `{clientEventId, cardId, grade, occurredAt}`                      |
| Queue       | `review_queue.dart`                                  | offline-durable, `clientEventId`-keyed                            |
| Transport   | `http_review_sync_transport.dart`                    | posts `{items:[event.toJson()]}`                                  |
| Composition | `main.dart` / `mobile_auth_config.dart`              | production wires **`DisabledReviewSyncTransport`**                |

### Finding B-1 (new, and it reorders the risk): native review sync is not merely "dormant" — in production builds it is **not wired at all**

`mobile_auth_config.dart` resolves to a signed-out configuration in production, and
`apps/mobile/test/mobile_sync_composition_test.dart` asserts that the production composition
contains **no** `HttpReviewSyncTransport`. Native reviews are recorded into the local queue and
never uploaded.

Consequence for the owner's framing: the native/Web asymmetry is **not currently an active
divergence in Production learner data**, because native contributes no review events at all. It is
a blocker for _future_ native activation, not a live corruption risk today. That is a materially
less alarming — and more accurate — statement than "two engines are writing to the same rows".

### Finding B-2 (defect, proven by execution): the native payload is already incompatible with the server, independent of V2

Native sends `cardId`. The server's parser requires **exact keys** including `contentId`:

- `apps/api/src/reviews/mobile-review-batch.request.ts:69` — `exactKeys(value, ['clientEventId', 'contentId', 'grade', 'occurredAt'])`
- `apps/mobile/lib/features/review/pending_review_event.dart` — `toJson()` emits `'cardId'`

I did not infer this. I executed the **real compiled server parser** against the **real native
payload shape**: it throws `MobileReviewBatchRequestError`, which the boundary maps to **400
`validation`**, which the Dart transport classifies as **retryable**. So if native sync were enabled
today, every batch would fail validation and retry forever.

This is a pre-existing latent defect that the owner's V2 concern would have masked: adding
`known`/`unknown` to native without fixing the key would still not work.

### Answers to the six required questions

**1. Should native move to the same binary known/unknown interaction?**
Yes, eventually — but this is a **product/UX decision, not a mechanical one**, so I am stopping for
owner review rather than implementing. V2 is binary-first; keeping four grades on native means
native evidence is only ever a _projection_ into V2's input space, permanently. The web app already
made this move. My recommendation is that native adopt binary **as a deliberate UX change**, not as
a side effect of a scheduler flag.

**2. What happens to four-grade events already queued across an app upgrade?**
They must remain valid and be accepted. `pending_review_event.dart`'s `fromJson` is strict
(`value.length != 4` plus exact key checks), so a binary-shaped event written by a newer build is
**unreadable** by that same parser unless it is extended. Worse — see B-3 — a single unreadable
event currently discards the **entire** queue.

**3. Can legacy queued events stay legacy and be projected server-side while new events are binary?**
Yes, and this is the right design. The server already has the projection machinery
(`parseBinaryItem` accepts `response`; `shadowGradeFor()` maps binary → shadow grade; V2 has
`HISTORICAL_GRADE_PROJECTION` for legacy grades). So a mixed queue is server-representable today.
The missing piece is purely client-side tolerance.

**4. Is an explicit payload/version discriminator needed?**
Yes. The server distinguishes the two item shapes by **key presence** (`'response' in value`), which
works but is implicit. For an upgrade that must tolerate a mixed queue I recommend a per-event
`schemaVersion` persisted in the queue, so the client can route each event to the correct
serializer deterministically instead of inferring from which keys happen to be present.

**5. How do idempotency and reconciliation behave across the transition?**
Idempotency is keyed on `clientEventId`, which is shape-independent — so a legacy event retried
after an upgrade is still deduplicated correctly. That property survives the transition. The
reconciliation cursor is likewise shape-independent.

**6. Can alternating Web/Native review of the same card produce semantically equivalent V2 input?**
Only if native emits binary. With native on four grades, identical learner intent produces
different V2 inputs by client: web `known` enters V2 directly, native `good` enters through
`HISTORICAL_GRADE_PROJECTION`. Equivalent _intent_, non-equivalent _evidence_.

### Finding B-3 (new, HIGH): one malformed queued event destroys the whole queue

`review_queue.dart` decodes the persisted queue and, on any single unparseable entry, yields an
empty queue — silently discarding **all** pending reviews rather than skipping the bad one. During
precisely the upgrade described in question 2, this converts a one-event schema mismatch into total
loss of a learner's offline reviews. This must be fixed (skip-and-count, or quarantine) **before**
any native payload change ships.

### Verdict

**Native/Web semantic parity: NOT closed — and it is a product decision, not just code.**

Remaining decision for the owner: whether native adopts the binary interaction. Remaining
engineering prerequisites regardless of that decision: fix the `cardId`/`contentId` mismatch (B-2),
make queue decoding fault-tolerant (B-3), and add a per-event `schemaVersion` (B-4). I implemented
none of these, per the instruction to stop before implementing native parity.

---

## Workstream C — V2 data safety before activation

### Can the exact pre-V2 `card_schedules` state be reconstructed after a rollback?

**No — not from the schema alone.** Stated plainly, as instructed.

- `card_schedules` is **mutable current state**: `UPDATE … SET state, stability_days, difficulty, lapses, due_at, last_reviewed_at`. There is no history table, no temporal columns, no audit trigger.
- `review_events` is append-only and carries `engine_version`, so the _events_ are attributable.
- But a V2 write **overwrites** the prior `stability_days`/`due_at` in place, and the overwritten value is recorded nowhere.
- Reverting the image does not restore schedules. `0023_learning_persistence.sql` has **no down migration**.

### Is replay a sufficient reconstruction mechanism? Measured, not assumed.

I replayed all 97 Production events through the **real V1 engine** from the documented seed
(`card_schedules` defaults: `stability_days 0.0416666667`, `difficulty 5`, `state 'new'`):

- **22 / 31** schedules reconstruct **exactly**
- **9 / 31** diverge — and all 9 are in **Bahram's** account (`451b0433`); **all 15 of Mona's reconstruct exactly**
- in all 9, `state` and `lapses` match; only `stability_days` magnitude differs (ratios ≈1.111, 1.235, 0.529)

So replay is a **strong corroborating check but not an exact reconstruction mechanism**. Anyone
relying on "we can always replay" would silently inherit a 9-row error.

### The pre-existing drift must be frozen before activation, or it contaminates attribution

This is the subtle risk the owner flagged, and it is real: the same 9 rows that already fail V1
replay are rows where a post-V2 anomaly could be blamed on V2 — or, worse, where real V2 damage
could be excused as "that's just the known drift". The protocol therefore **fingerprints the drift
set up front** and asserts it is unchanged, so the two populations can never be conflated.

### Delivered tooling (read-only; tooling/test infrastructure only)

`scripts/scheduler-v2-attribution.mjs` — **read-only**, `SELECT` only, no writes/migrations/flags:

- `--snapshot` — captures every `card_schedules` row, a per-row fingerprint, the full event ledger, the V1-replay drift set, and a `sha256` digest of the whole baseline
- `--verify --baseline <file>` — re-reads and reports `rowsBefore/After`, `schedulesChanged`, `newEvents`, `newV2Events`, `driftSetStable`
- classification: `historical_v1` / `v2_attributed` / `mixed` / `eventless`

`scripts/scheduler-v2-attribution.test.mjs` — **6/6 pass**, pure functions, no DB. Pins that
`engine_version=1` is legacy (not V2), that a changed drift set is reported **unstable**, that
unattributed writes are flagged, and that `NULL` `last_reviewed_at` is distinguished from `''`.

**Validated read-only against real Production:** snapshot → 31 schedules (sha256 `58d28d07…`), 97
events, **0 already V2-attributed**; verify → `rowsBefore 31 / rowsAfter 31 / schedulesChanged false
/ newEvents 0 / newV2Events 0 / driftSetStable true`. Temporary files removed; container digest,
`RestartCount=0` and `StartedAt` unchanged afterwards.

### The four rollback levels — explicitly not equivalent

| Level                         | Mechanism                                                                                                         | Restores schedules?                    | Cost                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| **1. Code rollback**          | re-pin the previous image digest                                                                                  | **No**                                 | seconds; CP14-proven                                 |
| **2. Flag rollback**          | unset `LEARNBOX_SCHEDULER_V2` **and restart the container**                                                       | **No** — stops _future_ V2 writes only | seconds, **restart required** (see note)             |
| **3. Schedule/data rollback** | restore affected `card_schedules` rows from a pre-activation snapshot, scoped by `review_events.engine_version=2` | **Yes, for attributable rows**         | needs the snapshot taken **first**; requires a write |
| **4. Full DB restore**        | restore the whole database from backup                                                                            | Yes                                    | loses all post-backup writes across all tables       |

> **Level 2 is not instantaneous.** `apps/api/src/reviews/scheduler-v2-preflight.ts:97` memoises a
> _successful_ preflight for the process lifetime (a failed one is never cached). A process that has
> already served one V2 review keeps its cached decision, so unsetting the flag alone does not stop
> V2 writes in that process — the container must be restarted. Treat level 2 as "flag + restart".

Levels 1 and 2 stop the bleeding; **neither heals it**. Only level 3 (and only with a
pre-activation snapshot) achieves exact schedule restoration, and `replay-compat.ts` does not do it
— it treats the stored row as authoritative and reports a Box-changing difference as a `conflict`
rather than repairing it.

### Minimum safe mechanism (no new migration needed)

A migration is **not** necessary. The smallest sufficient protocol is:

1. `--snapshot` immediately before activation; store the digest off-box.
2. Enable V2 on **staging only**, with a control account untouched.
3. `--verify` after the observation window; require `driftSetStable: true` and every new schedule mutation attributable to an `engine_version=2` event.
4. Rollback, if needed, = level 3 restore of the attributed rows from the snapshot.

### Verdict

- **V2 writes can be attributed exactly** — via `review_events.engine_version=2` joined to `(user_id, card_id)`, _provided_ the pre-activation snapshot exists and the drift fingerprint is stable. Attribution of _events_ is exact; attribution of _schedule mutations_ is exact only against a baseline.
- **Exact data rollback is possible only via level 3 with a pre-activation snapshot** (or level 4). It is **not** possible from the schema alone, and **not** achieved by code or flag rollback.

---

## Stop gate

1. **422 contract blocker — CLOSED** (web + mobile-review boundaries + Dart transport), mutation-proven M1/M2/M3, enforced by `quality` (`pnpm check`) and `mobile` (`flutter test`).
2. **Native/Web semantic parity — NOT CLOSED.** Owner product decision required: does native adopt the binary known/unknown interaction? Engineering prerequisites either way: B-2 `cardId`→`contentId`, B-3 fault-tolerant queue decoding, B-4 per-event `schemaVersion`.
3. **V2 write attribution — YES, exactly**, given a pre-activation snapshot plus a stable drift fingerprint.
4. **Exact data rollback — only via level 3 (snapshot-based restore of attributed rows) or level 4 (full restore).** Not from schema alone; not from code or flag rollback.
5. **Blockers to staging V2 activation:** none from the contract (closed). Required first: isolated staging DB, `--snapshot` baseline, and either native excluded from scope explicitly or B-2/B-3 fixed.
6. **Blockers to Production V2 activation:** (a) native parity decision + B-2/B-3/B-4; (b) level-3 rollback capability demonstrated on staging; (c) a successful staging V2 observation with exact attribution; (d) deterministic-422 learner UX observed in a real browser (residual evidence gap); (e) owner authorization.

**Nothing enabled, deployed, migrated, or written. `LEARNBOX_SCHEDULER_V2` remains ABSENT.**
