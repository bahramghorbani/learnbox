# CP17 — Native Binary Rollout Readiness

**Status:** readiness work complete; rollout NOT authorized.
**Baseline:** `5a12fcf56a27a638f4e816af2e66758cad02c925` (CP16 closed)
**Scheduler V2:** OFF throughout. **Native release:** not performed. **Production:** unchanged.

This checkpoint makes Native Binary Review *safe to roll out later*. It activates nothing.

### Six activation states that are not interchangeable

Conflating any two of these is how this feature becomes unsafe, so they are named separately
and tracked separately everywhere in CP17.

| State | Mechanism | Value now |
|---|---|---|
| Server binary **acceptance** | `LEARNBOX_BINARY_REVIEW` | Production `true` |
| Server-advertised binary **creation** | `LEARNBOX_BINARY_REVIEW_CREATION` | Production **absent** |
| Native **UI capability** | compile-time define | default **off** |
| **First genuinely created** binary Native event | a learner acting on a capable build | has not happened |
| **Drain-only** | creation off, acceptance on | n/a |
| **Scheduler V2** | `LEARNBOX_SCHEDULER_V2` | absent / OFF, untouched by CP17 |

Acceptance is not creation; creation is not UI capability; a capable UI is not a created event;
a drain-only fleet is not a dormant one; and none of them is Scheduler V2.

---

## The four inherited findings, re-verified against main

Each finding was re-derived from current code rather than inherited from the review notes.
One was confirmed exactly, two were confirmed with a corrected root cause, one was found to
be **not** where it was believed to be — and a fifth, worse defect was discovered.

### F1 — Batch head-of-line poisoning · CONFIRMED (corrected root cause)

The review located this in the mobile client's `items.map`. That was wrong: the client's
`toWireJson()` is total over its own type and cannot throw.

The real defect is server-side, at `mobile-review-batch.request.ts:134`:

```ts
const items = payload.items.map((item) => parseItem(item, options));
```

`parseItem` throws on the first malformed item, so `.map` aborts and the **entire batch of up
to 20 events is rejected with a single 400**. Every valid event behind the bad one is refused.
Because the client resends the same batch, one terminally-invalid event blocks those valid
reviews *indefinitely*.

**Resolution — per-item salvage with preserved forensics.** `parseMobileReviewBatchRequestSalvaging`
parses each item independently. Valid items proceed to the scheduler; invalid items are returned
as per-item outcomes using the service's **existing** `validation` vocabulary, so the client
retires exactly those events through a path it already understands. Nothing is silently dropped.

Deliberately kept whole-batch (these carry no trustworthy per-item evidence):
- malformed envelope (not an object, bad `items`, unknown top-level keys)
- duplicate `clientEventId` within one batch — splitting it would risk breaking exactly-once
- an item too malformed to yield a `clientEventId`, since there is nothing to report against

### F2 — No runtime kill switch · CONFIRMED

`BinaryReviewUiConfig` is `String.fromEnvironment` + `static const`: compile-time only. After a
binary-capable build ships, the only rollback would be a store rebuild and review cycle.

**Resolution — two independent server-advertised signals**, reusing the existing sync response
rather than building a remote-config system. The critical insight is that *one* switch would be
unsafe: turning the feature off must not turn already-queued binary events into poison.

| Signal | Controls | Effect when false |
|---|---|---|
| `acceptanceEnabled` (`LEARNBOX_BINARY_REVIEW`) | whether the server will **accept** binary events | queued events cannot drain — so this must stay ON during rollback |
| `creationEnabled` (`LEARNBOX_BINARY_REVIEW_CREATION`) | whether clients may **create** new binary events | UI hidden, no new binary events; existing queue still drains |

`creationEnabled` can never exceed `acceptanceEnabled`, enforced server-side. The emergency
rollback is therefore `LEARNBOX_BINARY_REVIEW_CREATION=false` with acceptance left ON: the UI
disappears, new binary events stop, and the queue drains cleanly.

Failure modes are explicitly safe: an absent, unparseable or non-object `binaryReview` degrades
to `BinaryReviewRuntimeConfig.unknown`, which defers to the compile-time gate and **assumes
acceptance is available** so queued events keep draining rather than stranding.

The four distinctions the task asked to separate:
- *hiding the UI* — `creationEnabled: false` (or the compile-time gate)
- *stopping creation of new binary events* — same signal, same instant
- *draining already-created entries* — governed only by `acceptanceEnabled`, untouched by the kill switch
- *server acceptance/rejection* — `acceptanceEnabled`; a regression answers retryable 503, never a terminal rejection
- *downgrade compatibility* — governed by the envelope version, see F3

### F3 — Quarantine crosses the one-way downgrade boundary · CONFIRMED EXACTLY

Confirmed at `review_queue.dart`, in `_envelopeVersionFor`:

```dart
_quarantine.isEmpty && !events.any((e) => e.hasExplicitBinaryResponse)
    ? _legacySchemaVersion : _schemaVersion
```

Quarantine state alone bumped the envelope to v2 and added a third key. A pre-CP16 build's
`_load()` demands `decoded.length != 2` and `schemaVersion == 1`, and otherwise calls
`_discardCorruptQueue()` — **deleting every surviving valid review**. So a device that had merely
seen one corrupt entry, with zero binary reviews, could not be safely downgraded.

**Resolution — narrowed, not documented around.** Quarantine evidence moved out of the queue
envelope into its own store. The envelope now bumps to v2 **only** when an event genuinely
carries binary evidence, which is the one case that truly cannot be represented to an old build.
Forensic evidence is fully retained, and evidence a CP16-era build already wrote into the
envelope is migrated out on load (proven by test).

The boundary is now minimal and *mechanically* enforced via `pointOfNoReturnCrossed`, not by
documentation.

### F4 — Server-before-client ordering · VERIFIED, and a worse defect found

Production acceptance was re-verified read-only: `LEARNBOX_BINARY_REVIEW=true` on
`learnbox-app-production-app-1`, `RestartCount=0`, `LEARNBOX_SCHEDULER_V2` absent.

**F5 (new, not in the inherited list) — the flag could never take effect.**
`apps/website/lib/mobile-review-http.ts:75` called the parser **without** the options argument:

```ts
parsed = parseMobileReviewBatchRequest(body, verification.claims.sub);  // no options
```

`binaryResponses` therefore defaulted to `false` on the mobile boundary — the *only* boundary
Native uses (`/api/reviews/mobile`). The web boundary passed the flag correctly; the mobile one
never read it. So every binary event from a Native client would have been rejected **regardless
of the Production flag being ON**. A rollout performed on the strength of "the server flag is
already enabled" would have failed for 100% of binary events.

This was a hard rollout blocker, invisible to contract-level tests, and is exactly what the
"re-verify, don't inherit" instruction was for.

**Resolution:** the mobile boundary now reads `LEARNBOX_BINARY_REVIEW`, and a binary event
arriving at a flag-off server raises a *capability* error → retryable **503**, never a terminal
400. This matters: the identical event becomes valid again once the flag is restored, so
classifying it terminal would have destroyed real learner reviews on any flag regression.

### F6 — Native transport parity · CLOSED for readiness

`mobile_auth_config.dart` wires `DisabledReviewSyncTransport` in production with no endpoint
reader at all, so the real HTTP transport's binary path had never executed. Two further defects
surfaced once it was actually exercised:

1. `decoded.length != 1` rejected *any* additional response key, so adding `binaryReview` would
   have broken sync. Now accepts the one documented optional key while still refusing unknown keys.
2. The per-item rejection status had to match the service's real `validation` vocabulary rather
   than a newly invented `rejected` status.

Binary serialization is now proven through the real transport: `response` emitted with no
`grade`, `contentId` never `cardId`, mixed batches in one request, 422 terminal, 503 retryable.

Still open and **out of scope** for readiness: production composition still wires the disabled
transport. Enabling it is a release action, not a readiness action.

---

## Rollout state machine (`packages/learning-engine/src/native-binary-rollout.ts`)

Mechanical, pure, no I/O, activates nothing. `assessRollout()` + `canAdvance()` + `STAGE_EVIDENCE`.

| Stage | Meaning | Downgrade safe? |
|---|---|---|
| **A `dormant`** | nothing enabled anywhere | yes |
| **B `serverReady`** | server accepts binary; no binary client distributed | yes |
| **C `armed`** | binary client distributed, creation withheld | **yes — last safe stage** |
| **D `creating`** | binary events being created | **no — boundary crossed** |
| **E `draining`** | creation withdrawn, queue still draining | no |

Enforced blockers: server-before-client; creation never above acceptance; acceptance never on a
pre-0023 schema (CP8 finding N1); no binary UI without a real transport; no binary UI without the
runtime kill switch; no acceptance regression while binary events are queued.

Transition rules: no stage skipping; no advance while any blocker exists; no retreat once the
boundary is crossed — **except** `creating → draining`, the kill switch, which is never blocked.

**Point of no return:** the first genuinely-created binary event. Thanks to F3 this is now the
*only* thing that crosses it — quarantine state no longer does.

**Rollback strategy by stage:** A/B/C — plain downgrade, no data loss. D/E — forward recovery
only: `LEARNBOX_BINARY_REVIEW_CREATION=false`, keep acceptance ON, observe queue depth fall to
zero. Never disable acceptance while binary events remain queued.

---

## Preserved CP16 guarantees (all re-proven)

Old four-grade clients serviceable · binary clients use known/unknown · legacy projection
read-time only · binary storage/wire separation · `clientEventId` survives upgrade · mixed
legacy/binary batches supported · exact `schedulerRejected` 422 terminal/nonretryable ·
transient failures retryable · queue corruption cannot destroy unrelated reviews · no silent
event loss · protected-content invariants untouched · Scheduler V2 OFF.

---

## Test evidence

Counts below are from the final post-review candidate, re-run serially; earlier
counts are superseded and are not final evidence.

| Suite | Result |
|---|---|
| `packages/learning-engine` | **188** passed (24 new, rollout state machine) |
| `apps/api` | **178** passed |
| `apps/website` | **809** passed, 160 skipped |
| `apps/mobile` | **355** passed (21 new) |
| `flutter analyze` | no issues |
| `dart format` | clean |
| TS builds (`learning-engine`, `api`) | clean |

**Mutation (authoritative, supersedes all earlier runs):** 22 mutants, **22
killed, 0 survived, 0 aborted**. Each mutant was run under a strict invariant —
canonical blob from `HEAD` → apply exactly one mutant → prove applied by hash
change → run the designated suite → prove killed → restore → prove byte-identical
to canonical. The earlier run was discarded: it restored via `git checkout --`,
which silently cannot restore an untracked file, so mutants accumulated and its
results were not attributable to single mutations.

Adversarial cases covered: malformed event between valid events · terminal 422 inside a
multi-event batch · retryable 5xx · duplicate `clientEventId` · mixed legacy/binary queues ·
quarantine-only state · kill switch with binary events already queued · server acceptance
regressed/unavailable · downgrade boundary both directions · CP16-envelope forward migration ·
old-client compatibility · real Native transport serialization and parsing.

Three pre-existing tests were deliberately updated because CP17 *intentionally* changes the
contract they pinned (whole-batch 400 → per-item salvage; `rejected` → `validation`; added
`binaryReview` key). Every fail-closed property in them was preserved.


---

## Independent adversarial review

Reviewer: **Codex `gpt-6-sol`** (provider `openai-codex`), read-only, fresh
context. Attribution verified mechanically from the usage record
(`provider=openai-codex`, `model=gpt-6-sol`) — a response silently substituted
to Claude would not have counted. Five issues were raised; the parent reproduced
each one against the code before accepting it.

| ID | Finding | Parent verification | Disposition |
|---|---|---|---|
| H1 | F4 not closed in production composition | reproduced | already documented as a release decision, not a repo defect |
| H2 | Kill switch stopped at `ReviewUploadResponse`; the UI gate never consulted it, so F2 did not actually work end-to-end | reproduced | **FIXED** + regression |
| H3 | The client skipped every non-acknowledged outcome, so a salvaged event stayed queued and kept occupying a batch slot — head-of-line blocking survived the F1 fix | reproduced | **FIXED** + regression |
| H4 | Production supplied no quarantine store, so F3 evidence was memory-only and lost on restart | reproduced | **FIXED** + regression |
| H5 | Claimed non-200 → retryable turns 422 into an infinite retry | **could not reproduce** | **REJECTED** — CP10/D16 already classifies `schedulerRejected` as terminal, and only that exact contract |
| M1 | The kill-switch exception sat in the retreat branch, but `creating → draining` is a *forward* step: the exception was dead code, and the blocker check then vetoed the one transition that must never be vetoed | reproduced | **FIXED** + regression |
| M4 | Stage derivation could report a pre-boundary stage after the boundary had been crossed | reproduced | **FIXED** + regression |

H3 and M1 each defeated a headline CP17 safety claim while the whole suite was
green: salvage that still blocked the queue, and a kill switch that failed
precisely when the system was unhealthy. Both are now pinned by behavioural
tests and by mutants M17–M21.

### Why H5 was rejected

The transport maps non-200 to `serverUnavailable` *except* an explicit
`schedulerRejected` body, which it classifies terminal. That narrow, contract-
exact mapping is deliberate (CP7 → CP10/D16): a 422 without the known code is
treated as retryable because an unrecognised 422 is more likely a deploy skew
than a permanent verdict. The reviewer's premise — that *any* 422 is retried
forever — does not hold in the current code.

---

## Remaining blockers for an actual rollout

1. **Production composition still wires `DisabledReviewSyncTransport`** — a release decision.
2. **Owner gate** required before crossing into `creating`.
3. **Pre-release safety interlock — `LEARNBOX_BINARY_REVIEW_CREATION=false` must be set
   explicitly in Production before any binary-capable Native build is distributed.**
   CP17 does **not** set it. "Absent follows acceptance" is a safe *library* default but must
   not be relied on at the release boundary: absent is indistinguishable from "nobody
   configured this", and acceptance is already `true`, so a single composition mistake would
   arm creation. The explicit `false` is the interlock, and it must be verified in the running
   container — not merely in `.env` — before distribution.
4. No store submission, no Native release, no flag change performed by this checkpoint.
