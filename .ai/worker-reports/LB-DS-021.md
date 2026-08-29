# LB-DS-021 — M1-C Mobile learner core slice 1: Today D1 states and truth labels

- Status: draft PR (review_requested)
- Executor: mobile-worker (W3)
- Base: `main` at `9e22250` (M1-A #151, M1-D slice 1 #152, D1 #153, queue advance #154 merged)
- Branch: `worker/m1c-today-d1-states`
- Risk: critical-mobile-ui-ux
- Allowed paths used: `apps/mobile/lib/features/review/today_screen.dart`; `apps/mobile/test/today_screen_states_test.dart`; `apps/mobile/test/mobile_learning_loop_test.dart`; `apps/mobile/test/mobile_visual_parity_test.dart`
- Required checks: all listed below ran green.

## Scope

First M1-C slice: improve the Today learner surface so it uses the approved D1
hierarchy/state handling (`docs/design/D1_LEARNER_UI_KIT.md` §5) and truthful
server/local/offline labels without inventing backend APIs.

- Loading: kept descriptive `در حال آماده‌کردن مرور امروز` semantics (D1: skeleton
  rule; this slice keeps the existing progress surface and records the skeleton as
  D3 evidence work).
- Empty: kept honest copy `امروز کارتی برای مرور آماده نیست.` (D1: no invented
  data; Bobo recovery still is a D3 screenshot item, not this slice).
- Truth labels: the summary card now states the count is from the device-local
  bundled pack and is not yet connected to the server —
  `این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به سرور وصل نشده است.`
- Sync state (D1 §5 sync row): pending chip `N رویداد در انتظار همگام‌سازی` shown
  only when the device-local queue really has pending events; count from
  `ReviewQueue.pendingCount()` (M1-C §12.2 truth rule). Queue read failure fails
  closed: Today keeps working, no chip, no invented count.
- No offline hairline banner in this slice: the app has no connectivity listener
  (M1-C §12.3 forbids adding one), and the truthful "not connected to server"
  label is the honest local/sync statement today. Banner is D3 screenshot work
  gated on a connectivity source.

## Deliberate limits

- No backend API invented; Today counts remain device-local and are labelled so.
- No connectivity listener, background sync, analytics or new dependency.
- Production composition unchanged: `main.dart` untouched; auth remains disabled,
  transport remains `DisabledReviewSyncTransport`.
- `ReviewSyncCoordinator` remains dormant; the pending chip is the truthful local
  queue statement the M1-C contract requires (§12.2) and does not claim server
  persistence.
- Existing test adaptations: Today now reads `pendingCount()` once at startup, so
  secure-storage call order became `read, read, write` in the storage-failure test,
  and the Progress retry test consumes one extra failed read. Both tests were
  updated with the exact new assertions; no production behavior changed.

## TDD evidence

- RED: new `today_screen_states_test.dart` (8 widget tests) failed before the
  implementation (4 failures: truth label, pending chip ×3).
- GREEN: all 8 pass after `today_screen.dart` change; full suite 143/143.

## Check evidence

- `flutter test test/today_screen_states_test.dart` — 8/8 passed.
- `flutter test` — 143/143 passed.
- `flutter analyze` — no issues.
- `dart format --output=none --set-exit-if-changed lib test` — clean.
- `flutter build apk --debug` — built `build/app/outputs/flutter-apk/app-debug.apk`.
- `pnpm check` — green.
- `node scripts/validate-migrations.mjs` — 13 migrations validated.
- `git diff --check` — clean.

## Next dependency

- M1-C slice 2: offline hairline banner needs a connectivity source (D1 §5 offline
  row) — the app deliberately has no connectivity listener (M1-C §12.3), so that
  decision needs a queue task.
- D3: screenshot verification of loading/empty/offline/sync states.
- M1-C slice 3: dormant `ReviewSyncCoordinator` activation behind owner-approved
  flags when the authenticated transport exists (M1-C §12.1).