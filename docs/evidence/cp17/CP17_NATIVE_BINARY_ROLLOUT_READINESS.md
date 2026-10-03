# CP17 — Native Binary Rollout Readiness

**Status:** readiness work complete; rollout NOT authorized.
**Baseline:** `5a12fcf56a27a638f4e816af2e66758cad02c925` (CP16 closed)
**Scheduler V2:** OFF throughout. **Native release:** not performed. **Production:** unchanged.

This checkpoint makes Native Binary Review *safe to roll out later*. It activates nothing.

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

| Suite | Result |
|---|---|
| `packages/learning-engine` | 184 passed (20 new, rollout state machine) |
| `apps/api` | 178 passed |
| `apps/website` | 809 passed, 14 skipped (10 new across 2 files) |
| `apps/mobile` | 343 passed (15 new across 2 files) |

Adversarial cases covered: malformed event between valid events · terminal 422 inside a
multi-event batch · retryable 5xx · duplicate `clientEventId` · mixed legacy/binary queues ·
quarantine-only state · kill switch with binary events already queued · server acceptance
regressed/unavailable · downgrade boundary both directions · CP16-envelope forward migration ·
old-client compatibility · real Native transport serialization and parsing.

Three pre-existing tests were deliberately updated because CP17 *intentionally* changes the
contract they pinned (whole-batch 400 → per-item salvage; `rejected` → `validation`; added
`binaryReview` key). Every fail-closed property in them was preserved.

---

## Remaining blockers for an actual rollout

1. **Production composition still wires `DisabledReviewSyncTransport`** — a release decision.
2. **Owner gate** required before crossing into `creating`.
3. `LEARNBOX_BINARY_REVIEW_CREATION` not yet set in Production (absent ⇒ creation would follow
   acceptance; set it to `false` *before* distributing any binary-capable build).
4. No store submission, no Native release, no flag change performed by this checkpoint.
