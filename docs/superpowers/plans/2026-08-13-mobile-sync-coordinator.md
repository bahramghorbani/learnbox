# Mobile Review Sync Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a disabled-by-default, provider-neutral Flutter coordinator that can
later upload encrypted pending review events only after authentication, without enabling network,
identity, provider, background work or Production.

**Architecture:** Extend the one long-lived `ReviewQueue` with serialized immutable snapshots, add
pure typed identity/transport/result ports, and coordinate bounded uploads with strict
acknowledgement validation. Production remains signed out with a disabled transport. DeepSeek may
implement only Task 1; Codex owns Tasks 2–4, security review, Flutter/Android validation, PR
readiness and merge.

**Tech Stack:** Dart 3, Flutter 3, `flutter_test`, encrypted `flutter_secure_storage`, GitHub CI.

## Global Constraints

- Storyboard remains 24 of 30; no beta or release activation.
- No OTP, session/token storage, user ID, HTTP client, URL, header, provider, secret or migration.
- No automatic/background attempt; only a directly invoked foreground coordinator method.
- Batch size is exactly at most 20, in persisted order.
- Pending events are removed only after complete validation of exact server-acknowledged IDs.
- Unknown or duplicate acknowledgement removes nothing.
- Only one long-lived `ReviewQueue` may own the encrypted store in production composition.
- DeepSeek cannot claim Flutter, Android Studio, emulator, Xcode, APK install or physical-device
  evidence and cannot approve or merge its Draft PR.
- Bobo, content assets, splash, icon, payment and Production remain unchanged.

---

### Task 1: Pure mobile sync contracts and acknowledgement validator — DeepSeek routine task

**Files:**

- Create: `apps/mobile/lib/features/sync/mobile_identity_state.dart`
- Create: `apps/mobile/lib/features/sync/review_sync_transport.dart`
- Create: `apps/mobile/lib/features/sync/review_sync_result.dart`
- Create: `apps/mobile/lib/features/sync/review_acknowledgement.dart`
- Test: `apps/mobile/test/review_sync_contract_test.dart`

**Interfaces:**

- Consumes: `PendingReviewEvent` from
  `apps/mobile/lib/features/review/pending_review_event.dart`.
- Produces: `enum MobileIdentityState { signedOut, authenticated }`;
  `abstract interface class ReviewSyncTransport` with
  `Future<ReviewUploadResponse> upload(List<PendingReviewEvent> events)`;
  immutable `ReviewUploadResponse({required List<String> acknowledgedClientEventIds})`;
  sealed `ReviewSyncResult` variants `AuthenticationRequired`, `NothingPending`,
  `Synchronized({required int acknowledgedCount, required int remainingCount})`, and
  `RetryableFailure({required int remainingCount})`;
  `validateAcknowledgements(batch, response)` returning an immutable list or throwing
  `InvalidReviewAcknowledgement`.

- [ ] **Step 1: Write failing pure-Dart tests**

Cover an empty acknowledgement, full and partial subsets, unknown ID, duplicate ID, immutable
response input, exact result counters and the two identity values. The test must fail because the
sync contract files do not exist.

- [ ] **Step 2: Verify RED**

Run: `cd apps/mobile && flutter test test/review_sync_contract_test.dart`  
Expected: FAIL because imports/types are missing. DeepSeek records the command as unavailable if its
environment has no Flutter; it may instead run `dart test` only if the Flutter package resolves.

- [ ] **Step 3: Implement the minimal pure contracts**

The validator builds the batch ID set, rejects duplicate acknowledgements before subset checking,
rejects every ID outside the batch, and returns `List.unmodifiable(response IDs)`. It performs no
queue mutation and has no network or credential knowledge.

- [ ] **Step 4: Run available static/focused checks**

Run every available command:

```bash
dart format --output=none --set-exit-if-changed apps/mobile/lib/features/sync apps/mobile/test/review_sync_contract_test.dart
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test test/review_sync_contract_test.dart
```

Unavailable commands must be recorded honestly in `.ai/worker-reports/LB-DS-001.md` for Codex.

- [ ] **Step 5: Handoff through Draft PR**

Change only the five Task 1 paths plus `.ai/WORK_QUEUE.md` and `.ai/worker-reports/LB-DS-001.md`.
Commit, push `worker/lb-ds-001-mobile-sync-contract-tests`, open a Draft PR, set Task 1 to
`review_requested`, write the standard report and stop. Do not modify this Plan.

### Task 2: Serialized queue snapshot — Codex security task

**Files:**

- Modify: `apps/mobile/lib/features/review/review_queue.dart`
- Test: `apps/mobile/test/review_queue_test.dart`

**Interfaces:**

- Consumes: existing encrypted `ReviewQueueStore` and `PendingReviewEvent`.
- Produces: `Future<List<PendingReviewEvent>> pendingEvents()` returning `List.unmodifiable` through
  the same `_serializeMutation` lane used by record/count/acknowledge.

- [ ] **Step 1: Write failing concurrency and immutability tests**

Prove persisted order, caller immutability, snapshot-before-later-record semantics, and serialization
against a delayed concurrent `record` or `acknowledge`.

- [ ] **Step 2: Verify RED**

Run: `cd apps/mobile && flutter test test/review_queue_test.dart`  
Expected: FAIL because `pendingEvents` is absent.

- [ ] **Step 3: Implement minimal snapshot API**

Return an unmodifiable copy from `_load()` inside `_serializeMutation`. Do not expose the store,
storage key, JSON schema or a queue-clearing operation.

- [ ] **Step 4: Verify GREEN and commit**

Run the focused test and `flutter analyze`; commit as `feat(mobile): expose serialized review snapshots`.

### Task 3: Foreground synchronization coordinator — Codex security task

**Files:**

- Create: `apps/mobile/lib/features/sync/review_sync_coordinator.dart`
- Test: `apps/mobile/test/review_sync_coordinator_test.dart`

**Interfaces:**

- Consumes: `ReviewQueue`, `MobileIdentityState Function()`, and `ReviewSyncTransport`.
- Produces: `Future<ReviewSyncResult> synchronize()`; concurrent calls return the same in-flight
  future; `_batchSize = 20`.

- [ ] **Step 1: Write failing authentication and empty-queue tests**

Prove signed-out does not read queue or call transport, and authenticated empty queue does not call
transport.

- [ ] **Step 2: Verify RED, then implement only the two gates**

Run the focused test, confirm missing coordinator failure, implement and rerun green.

- [ ] **Step 3: Write failing batch/acknowledgement tests**

Prove 21 events uploads the first 20 in order; full and partial valid acknowledgements remove only
exact IDs; unknown, duplicate, empty acknowledgement, transport exception and queue-write exception
remove nothing applicable and return retryable failure.

- [ ] **Step 4: Implement minimal upload flow**

Snapshot, take 20, upload, validate the entire response, acknowledge only validated IDs, then query
remaining count. An empty acknowledgement returns `RetryableFailure` without acknowledgement.

- [ ] **Step 5: Write failing concurrent-attempt test**

Use a delayed transport and assert two `synchronize()` calls invoke transport once and resolve to
the same result.

- [ ] **Step 6: Implement one in-flight Future and verify GREEN**

Clear the in-flight field in `whenComplete` without swallowing failures. Run focused tests and
`flutter analyze`; commit as `feat(mobile): coordinate safe review synchronization`.

### Task 4: Disabled production composition, documentation and integration gates — Codex task

**Files:**

- Create: `apps/mobile/lib/features/sync/disabled_review_sync_transport.dart`
- Modify: `apps/mobile/lib/main.dart`
- Modify: `apps/mobile/README.md`
- Modify: `docs/architecture/OFFLINE_SYNC.md`
- Modify: `CURRENT_WORK.md`
- Test: `apps/mobile/test/mobile_sync_composition_test.dart`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: production composition with `MobileIdentityState.signedOut` and a transport whose upload
  throws if called, proving there is no active network path.

- [ ] **Step 1: Write failing source/composition tests**

Prove production creates exactly one queue, identity is signed out, disabled transport is injected,
and no HTTP package, endpoint, credential, timer, connectivity listener or background worker is
introduced.

- [ ] **Step 2: Implement disabled composition and verify focused tests**

Do not surface a new automatic UI action. Document future adapter boundaries and explicit non-goals.

- [ ] **Step 3: Run feature-boundary validation**

```bash
pnpm check
pnpm build
node scripts/validate-migrations.mjs
cd apps/mobile && flutter analyze
cd apps/mobile && flutter test
cd apps/mobile && flutter build apk --debug
```

Install the debug APK on the connected physical Android only to confirm the existing offline
three-card journey remains intact and no network permission/behavior was added. No sync success is
claimed.

- [ ] **Step 4: Independent security review and integration**

Review the full diff for no-data-loss, acknowledgement validation, one-queue ownership and disabled
production composition. Address findings, push a non-Draft PR, wait for all required CI, merge only
when green, then update `PROJECT_STATE.md` and clear `CURRENT_WORK.md` in a closure PR.
