# Mobile Learning Loop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Flutter placeholder shell with a tested Persian-first three-card Start review that stores idempotent review events securely on the device and remains usable without a network.

**Architecture:** Keep content, review persistence and presentation behind small Dart interfaces. A generated mobile content bundle is derived from the canonical repository pack, a secure key-value adapter persists only the pending review queue, and injected repositories keep widget tests deterministic. No API, OTP, production flag, payment or release signing is activated.

**Tech Stack:** Flutter 3.44, Dart 3.12, `flutter_secure_storage` 11.0.0, repository pattern, Flutter widget tests, Node content-contract validator.

## Global Constraints

- Repository content under `content/packs/learnbox-start` remains the content source of truth.
- The initial mobile session contains exactly `start-a1-haus`, `start-a1-tisch` and `start-a1-tuer` in that order.
- Review grades are exactly `forgot`, `hard`, `remembered` and `mastered`.
- Every locally accepted grade is persisted before the UI advances and carries a unique `clientEventId`.
- Pending events are never removed without acknowledgement; this plan performs no server upload.
- Persian UI is RTL and core review remains available without network access.
- The approved Bobo appearance and all release/provider flags remain unchanged.
- The change is a debug-tested mobile foundation, not production activation or Cafe Bazaar submission.

---

### Task 1: Canonical mobile Start bundle and repository

**Files:**

- Create: `scripts/mobile-start-content.mjs`
- Create: `scripts/mobile-start-content.test.mjs`
- Create: `scripts/sync-mobile-start-content.mjs`
- Create: `apps/mobile/assets/content/start-a1-v1.json`
- Create: `apps/mobile/lib/features/review/start_card.dart`
- Create: `apps/mobile/lib/features/review/start_pack_repository.dart`
- Create: `apps/mobile/lib/features/review/bundled_start_pack_repository.dart`
- Create: `apps/mobile/test/start_pack_repository_test.dart`
- Modify: `apps/mobile/pubspec.yaml`
- Modify: `package.json`

**Interfaces:**

- Produces: `StartCard`, `StartPackRepository.loadDailySession()`, and `BundledStartPackRepository`.
- Consumes: canonical `start-a1-vertical-slice-drafts.json` and approved V2 image files.

- [ ] **Step 1: Write failing contract tests**

Test that `buildMobileStartContent(source)` returns exactly the three required IDs with German, Persian, definition, example and `assets/cards/<id>.png` fields, and rejects missing IDs. Add a Dart test that expects `BundledStartPackRepository.fromJsonString(json).loadDailySession()` to preserve the three-card order and reject malformed fields.

- [ ] **Step 2: Verify RED**

Run `node --test scripts/mobile-start-content.test.mjs` and `flutter test test/start_pack_repository_test.dart`; both must fail because the modules do not exist.

- [ ] **Step 3: Implement the canonical projection**

Implement `buildMobileStartContent` as a pure projection from the canonical JSON, generate the committed mobile JSON through `sync-mobile-start-content.mjs`, and add a `verify:mobile-start-content` command that compares generated and committed JSON byte-for-byte. Copy only the approved V2 images for the three IDs into `apps/mobile/assets/cards/` and register both content and card asset directories in `pubspec.yaml`.

- [ ] **Step 4: Implement the Dart repository**

Define immutable `StartCard` values and a `StartPackRepository` interface. Parse only the required validated fields, fail closed with `FormatException`, and return an unmodifiable three-card list.

- [ ] **Step 5: Verify GREEN and commit**

Run the two focused tests, `flutter analyze`, and `pnpm verify:mobile-start-content`; commit as `feat(mobile): add canonical Start content repository`.

---

### Task 2: Secure offline review queue

**Files:**

- Create: `apps/mobile/lib/features/review/review_grade.dart`
- Create: `apps/mobile/lib/features/review/pending_review_event.dart`
- Create: `apps/mobile/lib/features/review/review_queue_store.dart`
- Create: `apps/mobile/lib/features/review/secure_review_queue_store.dart`
- Create: `apps/mobile/lib/features/review/review_queue.dart`
- Create: `apps/mobile/test/review_queue_test.dart`
- Modify: `apps/mobile/pubspec.yaml`

**Interfaces:**

- Produces: `ReviewQueue.record(cardId, grade, occurredAt)`, `pendingCount()`, and `acknowledge(ids)`.
- Consumes: `ReviewQueueStore.read()` and `ReviewQueueStore.write(serializedEvents)`.

- [ ] **Step 1: Write failing queue tests**

Use an in-memory `ReviewQueueStore` fake to prove that a grade is persisted before `record` returns, two records receive different IDs, a new `ReviewQueue` instance restores pending events, malformed stored JSON fails closed to an empty queue and exact acknowledgement removes only matching IDs.

- [ ] **Step 2: Verify RED**

Run `flutter test test/review_queue_test.dart`; it must fail because the queue types do not exist.

- [ ] **Step 3: Implement minimal persistence**

Add `flutter_secure_storage: 11.0.0`. Serialize a versioned object `{schemaVersion: 1, events: [...]}`. Generate IDs from an injected ID factory in tests and from cryptographically secure random bytes in production. Store timestamps as UTC ISO-8601 strings, reject malformed structures as a whole, and overwrite corrupt storage with the empty valid payload.

- [ ] **Step 4: Add secure adapter**

Implement `SecureReviewQueueStore` with the single key `learnbox.reviewQueue.v1`; it stores no phone, OTP, cookie, token or media bytes.

- [ ] **Step 5: Verify GREEN and commit**

Run `flutter test test/review_queue_test.dart`, `flutter analyze`, and `flutter build apk --debug`; commit as `feat(mobile): persist offline review events securely`.

---

### Task 3: Persian Today and active-recall flow

**Files:**

- Create: `apps/mobile/lib/app.dart`
- Create: `apps/mobile/lib/features/review/today_screen.dart`
- Create: `apps/mobile/lib/features/review/review_screen.dart`
- Create: `apps/mobile/test/mobile_learning_loop_test.dart`
- Modify: `apps/mobile/lib/main.dart`
- Modify: `apps/mobile/test/app_test.dart`
- Modify: `apps/mobile/test/widget_test.dart`
- Modify: `apps/mobile/README.md`

**Interfaces:**

- Consumes: `StartPackRepository` and `ReviewQueue` from Tasks 1–2.
- Produces: launch → Today → three-card review → completion flow.

- [ ] **Step 1: Write failing widget tests**

Inject an in-memory repository and queue. Assert that Today announces three prepared cards; starting review shows `das Haus` without the Persian answer; revealing shows `خانه` and the example; choosing `بلد بودم` persists `remembered` before the second card appears; grading all three shows the calm completion copy and pending count `۳`.

- [ ] **Step 2: Verify RED**

Run `flutter test test/mobile_learning_loop_test.dart`; it must fail because the screens do not exist.

- [ ] **Step 3: Implement minimal UI**

Keep the approved three-second launch screen, then build an RTL Today screen and active-recall card with large touch targets. Grade labels map as `دوباره می‌خوانم` → `forgot`, `سخت بود` → `hard`, `بلد بودم` → `remembered`, `خیلی آسان بود` → `mastered`. Disable grading while persistence is in progress and surface a calm retry message if secure storage fails.

- [ ] **Step 4: Verify the complete flow**

Run all Flutter tests and analysis, build the debug APK, install it on the connected physical Android device, confirm the approved splash and the three-card flow, then capture a post-implementation cold-start measurement without treating debug timing as a release target.

- [ ] **Step 5: Update evidence and commit**

Update `apps/mobile/README.md`, `PROJECT_STATE.md`, `CURRENT_WORK.md`, `docs/storyboard/STATUS.md` and `docs/operations/STAGE_24_ANDROID_BASELINE.md` with the exact tested boundary. Run `pnpm check`, commit as `feat(mobile): add offline Start review flow`, push a PR, and merge only after every required CI check passes.
