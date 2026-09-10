# LB-DS-053 — M1-D mobile reconciliation read client composition

- Branch: `feature/m1d-mobile-reconciliation-client`
- Base commit: `acc9a4c33ebef846ae1e7e66598e6427adcc40e8` (exact `origin/main` = PR #259 merge, verified with `git rev-parse HEAD` before any change)
- Head commit: `5d594ee9793d7ce5b5e9ce0314d6212827bb8caa` (metadata-only record-update head). The final readiness or merge decision must always bind to the current remote value from `gh pr view 260 --json headRefOid`; never rely on this historical field.
- Independently reviewed implementation head: `e4e46c1df6e77583cc4751f18e031ff67e071b4b` (final fail-closed hardening). This report subsequently received metadata-only updates.
- Draft PR: #260 — https://github.com/bahramghorbani/learnbox/pull/260. It is open and remains Draft pending required CI and independent review bound to its current exact head.
- Scope completed: The dormant mobile client strictly consumes the existing paged reconciliation GET and can close the cursor gap through `ReviewSyncCoordinator.reconcile()`, while production composition stays signed out with a disabled transport and no network route is active.
- Files changed: `apps/mobile/lib/features/sync/review_sync_transport.dart`; `apps/mobile/lib/features/sync/reconciliation_cursor_store.dart`; `apps/mobile/lib/features/sync/review_sync_result.dart`; `apps/mobile/lib/features/sync/http_review_sync_transport.dart`; `apps/mobile/lib/features/sync/review_sync_coordinator.dart`; `apps/mobile/test/reconciliation_cursor_store_test.dart`; `apps/mobile/test/reconciliation_cursor_transport_test.dart`; `apps/mobile/test/reconciliation_cursor_coordinator_test.dart`; `apps/mobile/test/review_sync_contract_test.dart`; `apps/mobile/test/http_review_sync_transport_test.dart`; `apps/mobile/test/mobile_sync_composition_test.dart`; `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md`; `.ai/WORK_QUEUE.md`; `CURRENT_WORK.md`; this report. `apps/mobile/lib/main.dart`, `app.dart`, `features/review/learner_home_shell.dart`, `today_screen.dart`, `disabled_review_sync_transport.dart`, `mobile_auth_config.dart` and every server/API/migration file are untouched.
- Checks run: RED focused suite (4 files failed to compile); GREEN focused suite 7 files `+101` pass; full `flutter test` `+269` pass; `dart format --output=none --set-exit-if-changed lib test` clean; `flutter analyze` "No issues found"; `flutter build apk --debug` ✓ `build/app/outputs/flutter-apk/app-debug.apk`; `node scripts/validate-ai-worker-queue.mjs` `AI_WORKER_QUEUE_OK tasks=52`; `node scripts/validate-ai-continuity.mjs` `AI_CONTINUITY_OK`; `node scripts/validate-documentation-governance.mjs` `DOCUMENTATION_GOVERNANCE_OK documents=6`; `node scripts/validate-web-security.mjs` ok; dashboard tests `node --test tools/project-dashboard/test/*.test.mjs` pass 21 / fail 0; `git diff --check` clean; `git status` shows only the allowed paths.
- Checks unavailable: the executor initially used `npx prettier@3.6.2` because this worktree had no local `node_modules`. Later validation ran `npx prettier --check` successfully on the metadata files. The remaining historical commands above are evidence from their respective commits, not assertions about the current PR head or current hosted CI state.
- Remaining work: Keep PR #260 Draft until all required hosted CI contexts and an independent review are bound to its then-current exact head; only then run the explicit readiness and merge gates. Keep LB-DS-054 blocked; it depends on LB-DS-053 being accepted and on separate owner authorization. The separately gated follow-up remains wiring GET `events` into acknowledgement corroboration (wire contract §4) and every activation/flag/deployment step.
- Risks: The reconciliation read is composed only in tests; production remains fail-closed, so the main residual risk is future wire drift. Any server change to the §3.2 shape now fails closed (retryable, no cursor write, no queue mutation) rather than corrupting learner state. The `after` query parameter is sent only when a valid decimal cursor is stored, and a transport without an explicit `reconciliationEndpoint` performs no network call at all. A paging server that never terminates is stopped at `ReviewSyncCoordinator.maxReconciliationPages` (100) and persists nothing.
- Secrets or production changes: none. No secret, token, provider, endpoint value, runtime flag, environment file, deployment, staging, Preview or Production state changed. All sync flags (`MOBILE_REVIEW_SYNC_ENABLED`, `MOBILE_AUTH_ENABLED`, `LEARNER_STATE_ENABLED`, `WEB_LEARNER_STATE_ENABLED`) remain false and untouched. No auth/session behavior changed. No server, API, route or migration file was touched.
- Bobo canonical status: unchanged; no Bobo asset, copy or generation was touched.

## RED/GREEN evidence

Strict TDD sequence, in this order on the branch.

**1. RED — commit `d43e9210e39c50922e4aba88dd1eb1517b60a841` (tests only).**
Command:

```
cd apps/mobile && flutter test test/reconciliation_cursor_store_test.dart \
  test/reconciliation_cursor_transport_test.dart \
  test/reconciliation_cursor_coordinator_test.dart \
  test/review_sync_contract_test.dart
```

Result: `exit=1`, `00:00 +0 -4: Some tests failed.` with `Failing tests:` naming all four files and `Failed to load ... Compilation failed`. Representative errors:

```
test/reconciliation_cursor_store_test.dart:49:14: Error: Method not found: 'compareReconciliationCursors'.
test/reconciliation_cursor_transport_test.dart:119:11: Error: No named parameter with the name 'reconciliationEndpoint'.
test/reconciliation_cursor_transport_test.dart:131:40: Error: The method 'readReconciliation' isn't defined for the type 'HttpReviewSyncTransport'.
test/reconciliation_cursor_coordinator_test.dart:504:1: Error: Type 'ReviewReconciliationPage' not found.
test/reconciliation_cursor_coordinator_test.dart:239:13: Error: 'Reconciled' isn't a type.
test/reconciliation_cursor_coordinator_test.dart:338:55: Error: Member not found: 'maxReconciliationPages'.
test/reconciliation_cursor_coordinator_test.dart:434:9: Error: No named parameter with the name 'reconciliationTransport'.
test/review_sync_contract_test.dart:143:28: Error: Member not found: 'ReviewSyncResult.reconciled'.
```

The baseline before the RED commit was green: the same focused selection passed `+58` tests.

**2. GREEN — commit `f0f121716571090f4b5f4b068effe64c79fc2f09` (implementation + docs).**
Focused command (same seven files, including the two untouched-by-RED coordinator/transport suites):

```
cd apps/mobile && flutter test test/reconciliation_cursor_store_test.dart \
  test/reconciliation_cursor_transport_test.dart \
  test/reconciliation_cursor_coordinator_test.dart \
  test/review_sync_coordinator_test.dart \
  test/http_review_sync_transport_test.dart \
  test/review_sync_contract_test.dart \
  test/mobile_sync_composition_test.dart
```

Result: `exit=0`, `00:01 +101: All tests passed!` (58 before → 101 after, +43).

Full validation command:

```
cd apps/mobile && dart format --output=none --set-exit-if-changed lib test && flutter analyze && flutter test && flutter build apk --debug
```

Result: format `Formatted 80 files (0 changed)`, `exit=0`; analyze `No issues found! (ran in 1.3s)`; `flutter test` `exit=0`, `00:10 +269: All tests passed!`; APK `exit=0`, `✓ Built build/app/outputs/flutter-apk/app-debug.apk` (Gradle 96.1 s).

## Response, paging and no-data-loss invariants implemented

Server response shape consumed (wire contract §3.2, verified against `apps/website/lib/mobile-review-http.ts` `MobileReviewReconciliation`):

```json
{
  "reconciliation": {
    "cursor": "42",
    "nextCursor": "47",
    "hasMore": false,
    "events": [
      {
        "clientEventId": "evt_b9f0e1d2",
        "eventId": "9f1c2c6e-3a44-4c7a-9e2b-000000000002",
        "appliedAt": "2026-09-05T08:20:01.000Z"
      }
    ]
  }
}
```

- **Strict consume.** `HttpReviewSyncTransport.readReconciliation` rejects the whole document unless it has exactly one top-level `reconciliation` key holding exactly `cursor`, `nextCursor`, `hasMore` and `events`; both cursors must be non-empty ASCII decimal strings; `nextCursor >= cursor`; `hasMore` must be a real boolean; every event must be an object with exactly `clientEventId`, `eventId`, `appliedAt`, each a non-empty string. A non-200 status, a failed JSON parse, an extra or missing key, a non-string (JS number) cursor and a `nextCursor` behind the echo all throw `MobileReviewTransportException` before any value reaches the cursor store. 6 transport tests plus a 17-case malformed corpus cover this, and the request sends `after` only for a validated stored cursor.
- **Paging.** The coordinator chains pages with `after=<nextCursor>` only while `hasMore` is true. A page must echo the requested cursor, must never move backwards, and must strictly advance while `hasMore` is set. Paging stops at `maxReconciliationPages = 100`; exhausting the bound without a final page fails closed and persists nothing.
- **Persist only after full validation.** `nextCursor` is written exactly once, after the terminating page (`hasMore == false`) of a fully validated pass. The two-page test asserts the store is `47`, never the intermediate `45`; the "failure on a later page" test asserts the store stays `42` even though page one was valid.
- **GET never deletes.** `ReviewReconciliationTransport` is a separate port from `ReviewSyncTransport`, so no reconciliation value can travel through `upload`/`validateAcknowledgements`. `reconcile()` never calls `_queue.acknowledge`. The test "never removes a queued event even when the server reports it applied" seeds a real queued `event-0`, returns it in `reconciliation.events`, and asserts the pending count and the pending event ID are unchanged while the cursor advances `1 → 2`. Recovery for a lost POST response therefore remains the idempotent re-POST, whose exact acknowledgement is the only remover.
- **Malformed/partial/failed preserves.** A malformed page, a lost connection, a cursor-read failure, an echo mismatch and an unbounded page stream each return `RetryableFailure` with the queue and the stored cursor untouched. A signed-out identity returns `AuthenticationRequired` with zero transport calls, and a coordinator with no reconciliation port returns `NothingPending` without reading the cursor store or touching the network.
- **Reconnect trigger.** `synchronize()` runs reconciliation when the pending queue is empty, including when the same attempt's POST acknowledgement drained it, so the sequence is "POST until nothingPending, then GET" (wire contract §7 steps 1–5). A failed post-drain read leaves the POST acknowledgement and the stored cursor intact.
- **Excluded by design.** The wire contract §4 lost-`outcomes` matching is **not** implemented: a `clientEventId` seen in `reconciliation.events` is never used as corroboration for removal. The wire contract now records this scope explicitly (§7 "Exact scope of this slice", §17 "Client composition status") so it cannot be widened silently.

## Production composition (unchanged, fail-closed)

`apps/mobile/lib/main.dart` is byte-identical to the base commit. It still composes `MobileIdentityState.signedOut` with `MobileAuthConfig.createProductionTransport()` → `DisabledReviewSyncTransport()`, and it passes no `reconciliationTransport` and no endpoint, so the coordinator has no network path. A new guard test in `mobile_sync_composition_test.dart` asserts `main.dart` contains none of `ReviewReconciliationTransport`, `readReconciliation`, `reconciliationEndpoint`, `HttpReviewSyncTransport` or `reconciliationTransport`. No flag, environment, route, server, API, migration, provider, deployment, staging or Production state was read or written.

## Owner decisions

- O-1 / O-2: unchanged and still as recorded (conflicts stay pending and require a new event ID after resolution; M1 acknowledgement stays strict one-step after atomic application). This slice implements neither and does not reopen them.
- New decision recorded for this slice: GET remains gap-closing only; GET-to-acknowledgement matching is a separate gated task.

## Blocker

No functional blocker. The only environmental notes are that `node_modules` is absent in this worktree (Prettier run via `npx prettier@3.6.2`) and that the pre-existing `.ai/WORK_QUEUE.md` Prettier warning predates this task.
