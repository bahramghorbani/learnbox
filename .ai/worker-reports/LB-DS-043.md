# LB-DS-043 — Android Profile/Settings M3-P1 foundation

- Branch: `feature/m3-android-profile-settings`
- Base commit: `0f4feb71dc01b878519cae58765284a6028b5daf`
- Head commit: `ebbe8b15fa110cd9d5b4c548e235a1fa51b06da9` (stable implementation commit; review-test and status hardening follow on the same branch)
- Draft PR: #237 (merged) — https://github.com/bahramghorbani/learnbox/pull/237
- Merge commit: `6c6f4b6cd89ed7c4d668c75925c1e1145e2f6156`
- Scope completed: Profile as the fourth persistent learner destination (PDR-006); truthful Profile surface (neutral account label + real device-local pending review count with loading/error/retry) and child Settings surface with approved informational rows, labelled back action, system-back support and focus restoration; RTL/large-text/target-layout widget coverage; no goal, sign-out, deletion, identity, commerce, reminder or sync fabrication
- Files changed: `apps/mobile/lib/ui/learner_bottom_navigation.dart`; `apps/mobile/lib/features/review/learner_home_shell.dart`; `apps/mobile/lib/features/review/profile_screen.dart`; `apps/mobile/lib/features/review/settings_screen.dart`; `apps/mobile/test/learner_bottom_navigation_test.dart`; `apps/mobile/test/learner_profile_settings_test.dart`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-043.md`; `CURRENT_WORK.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Checks run: RED-first focused widget tests (8 failing before implementation); focused widget tests 11/11 after review hardening; full Flutter suite 203/203 (was 193 before this task); `flutter analyze` clean; `dart format` clean; `flutter build apk --debug` OK (`build/app/outputs/flutter-apk/app-debug.apk`); `git diff --check` OK; `pnpm verify:ai-worker-queue` OK; `pnpm verify:documentation-governance` OK; `pnpm verify:ai-continuity` OK; `pnpm test:dashboard` OK; Android emulator RTL visual evidence (Profile and Settings) captured on `emulator-5554` without auth/activation; independent review PASS at `290cd2f`
- Checks unavailable: physical-device screenshots intentionally not captured — the connected physical phone was not touched per instruction; emulator evidence stands in
- Remaining work: Web M3-P1 remains separately registered (LB-DS-042); M3-S1 sound/goal preference persistence and account-scoped storage/sign-out remain later serial tasks; support/privacy external-link rows remain deferred because Android has no in-scope approved destination or URL-launch dependency (omission is deliberate and fail-closed, mirroring PDR-006)
- Risks: Profile pending count is device-local only and must never be presented as server-synced state; the neutral account label is static product copy, not an identity read; no goal row exists because Android has no goal store (a future goal slice must add the store and row together)
- Secrets or production changes: none — no secret, flag, provider, auth/session, API, migration, deployment, Production, commerce or native-auth activation change
- Bobo canonical status: not applicable; no Bobo asset or canonical appearance change

## Evidence

- RED phase: `learner_bottom_navigation_test.dart` (Profile label/order) and the new
  `learner_profile_settings_test.dart` failed 8/8 before implementation (missing Profile
  destination, missing screens).
- Focused green: `flutter test test/learner_bottom_navigation_test.dart
test/learner_profile_settings_test.dart` → 11/11. Review hardening explicitly covers the
  loading announcement, failed-read retry recovery, and initial focus on the labelled back action.
- Full suite: `flutter test` → 203/203 (193 pre-existing + 10 new).
- `flutter analyze`: No issues found.
- `flutter build apk --debug`: `✓ Built build/app/outputs/flutter-apk/app-debug.apk`.
- Validators: `AI_WORKER_QUEUE_OK tasks=40`, `DOCUMENTATION_GOVERNANCE_OK documents=6`,
  `AI_CONTINUITY_OK`, dashboard tests pass, `git diff --check` clean.
- Widget coverage: four persistent destinations in order; truthful zero/positive/failed pending
  states; no sign-out/deletion/commerce/reminder/phone text; no avatar; Settings child covers the
  shell (no bottom nav), shows only informational rows, has `بازگشت به پروفایل` back action;
  focus returns to the Settings row after both button-back and system-back; RTL asserted; no
  overflow at textScale 2 on 390×844 and 320×360, and in 844×390 landscape.
- Emulator evidence: debug APK installed and launched on `emulator-5554` (Pixel 7, 1080×2400);
  screenshots of Profile and Settings confirm RTL layout, the neutral account label, truthful
  zero-pending state and the informational Settings rows. Native auth was never activated.
- Independent review: PASS with no blocker at `290cd2f`; the three cheap coverage/metadata findings
  were hardened afterward without changing runtime behavior or widening scope.
