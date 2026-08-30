# LB-DS-023 — M1-D client-side reconciliation cursor capture/persistence

- Branch: `worker/m1d-client-cursor-slice`
- Base commit: `9ff7c99` (PR #169 server-core reconciliation cursor merge)
- Head commit: `001d390` (implementation/tests; metadata normalization pending)
- Draft PR: https://github.com/bahramghorbani/learnbox/pull/170 (open, non-draft)
- Scope completed: client-side cursor capture/persistence at the dormant foreground sync boundary; strict decimal-string parsing; fail-closed storage; exact acknowledgement safety; no production activation.
- Files changed: sync-boundary Dart files and sync tests under `apps/mobile`; `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-023.md`.
- Checks run: Flutter focused sync suites 56/56; full Flutter tests 173/173; Flutter analyze; Dart format; `pnpm check`; AI worker queue and documentation validators; GitHub mobile, production-stack and secrets checks; `git diff --check`.
- Checks unavailable: none for the required gate; no native simulator or release build was required by this slice.
- Remaining work: read cursor from learner-state; send cursor in a future authenticated request contract; route/client integration and flag enablement remain separately gated.
- Risks: cursor write failure after durable queue acknowledgement returns retryable and requires later cursor recovery; production sync remains disabled.
- Secrets or production changes: none; no credentials, endpoints, flags, auth, route, server, schema, deployment or production activation changed.
- Bobo canonical status: not affected.

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
