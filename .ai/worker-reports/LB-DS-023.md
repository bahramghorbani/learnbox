# LB-DS-023 — M1-D client-side reconciliation cursor capture/persistence

- Status: review_requested
- Executor: mobile-worker (W3)
- Base: `main` at `9ff7c99` (PR #169, server-core reconciliation cursor merged)
- Branch: `worker/m1d-client-cursor-slice`
- Risk: routine-offline-mobile-sync-boundary
- Specification: `docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md`;
  `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md` (appendix Slice 1c)
- Allowed paths used: `apps/mobile/lib/features/sync/**`;
  `apps/mobile/test/**` sync-related tests;
  `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md`; `CURRENT_WORK.md`
- Required checks: see below; all ran green locally.

## Scope

Client-side cursor capture/persistence for the existing dormant foreground sync
boundary only. No network sync activation, no request cursor field, no route,
no server/API file, no schema/migration, no `main.dart`/production composition
change, no flag enablement.

- `ReviewUploadResponse` gains an optional `reconciliationCursor` decimal string;
  `acknowledgedClientEventIds` preserved.
- `HttpReviewSyncTransport` strictly parses the existing single-key
  `{ "outcomes": [...] }` response: acknowledged outcomes must have non-empty exact
  `clientEventId` and a valid non-negative decimal-string `reconciliationCursor`;
  malformed acknowledged cursor or malformed response is retryable (`validation`)
  and produces no acknowledgements; non-acknowledged outcomes stay non-acknowledged.
- New injected `ReconciliationCursorStore` seam (`Future<String?> read()`,
  `Future<void> write(String cursor)`) in the sync boundary, optional in
  `ReviewSyncCoordinator`; fail-closed invalid stored cursor; cursor write only
  after exact acknowledgement validation and successful queue acknowledgement.
- `ReviewSyncCoordinator` persists the response cursor only after exact
  acknowledgement validation and a successful queue acknowledge; a cursor alone
  never removes queue entries; no-ack means no cursor write; in-flight
  serialization unchanged.
- `ReviewSyncResult.Synchronized` carries the persisted cursor (decimal string,
  null when absent); never claims server sync beyond exact acknowledgements.

## Deliberate limits

- Production composition unchanged: `main.dart` untouched; `MobileAuthConfig.defaults()`
  still returns `signedOut` + `DisabledReviewSyncTransport`; no `ReconciliationCursorStore`
  is injected in production.
- Request body keeps exactly one `items` key; no cursor is sent in any request.
- Cursor write failure returns `RetryableFailure` (never `Synchronized`); the queue
  acknowledgement is durable before the cursor write, so no acknowledged event is
  lost and a retry reports `nothingPending` (documented and tested).

## TDD evidence

- RED: new `reconciliation_cursor_store_test.dart` /
  `reconciliation_cursor_transport_test.dart` /
  `reconciliation_cursor_coordinator_test.dart` failed before implementation
  (missing `ReconciliationCursorStore`, `ReviewUploadResponse.reconciliationCursor`,
  `Synchronized.cursor`, coordinator `reconciliationCursorStore` parameter).
- GREEN: all three suites pass after implementation; the pre-existing
  `http_review_sync_transport_test.dart` fixture was updated to the now-required
  cursor-bearing acknowledged outcome (contract change), then all focused and
  full suites pass.

## Check evidence

- `flutter pub get --offline` — OK (worktree).
- `dart format --output=none --set-exit-if-changed lib test` — clean.
- `flutter analyze` — no issues.
- Focused sync suites (contract, coordinator, http transport, composition +
  3 new cursor suites) — 56/56 passed.
- `flutter test` — 173/173 passed.
- `git diff --check` — clean.
- `pnpm check` — **not run**: no pnpm-managed path (API/website/learning-engine)
  was changed; docs/config-only changes are covered by the same-milestone
  repository checks on `main`. Note for supervisor: `pnpm check` is a repository-wide
  gate and can be run before merge if required.

## Checks unavailable

- `flutter build apk --debug` — not run (no native host, asset, dependency or
  entrypoint change; task scope is sync-boundary Dart only). Can be run on request.
- `pnpm check` — not run (see above).

## Remaining work

- Read the cursor in `GET /api/learner/state` (separate serial M1-D slice).
- Send the stored cursor with a request (separate slice; requires owner-approved
  activation of the authenticated sync boundary).
- Route/client integration and flag enablement remain separate owner-gated tasks.

## Risks

- None new. Strict parsing turns a cursor-less acknowledged outcome into a
  retryable failure; the existing transport test fixture was updated accordingly
  and the full suite passes.

## Secrets or production changes

- None. No secret, credential, endpoint, provider, flag, deployment or production
  activation touched.

## Bobo canonical status

- Not affected.