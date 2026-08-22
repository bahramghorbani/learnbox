# LB-DS-005 worker report

- Branch: `worker/lb-ds-005-mobile-offline-pronunciation`
- Base commit: `aee1c85` (PR #89 merged)
- Head commit: `7a38118`
- Draft PR: `#90` — Draft, independent review and physical Android listening QA pending
- Scope completed: offline word and revealed-sentence playback for exactly the three canonical Start
  cards, using the six existing approved V2 assets, an injected Dart player contract and exact
  native allowlists. No autoplay or network path was added.
- Files changed:
  - `apps/mobile/lib/app.dart`
  - `apps/mobile/lib/features/review/pronunciation_player.dart` (new)
  - `apps/mobile/lib/features/review/review_screen.dart`
  - `apps/mobile/lib/features/review/today_screen.dart`
  - `apps/mobile/android/app/src/main/kotlin/com/learnbox/learnbox/MainActivity.kt`
  - `apps/mobile/ios/Runner/AppDelegate.swift`
  - `apps/mobile/test/mobile_learning_loop_test.dart`
  - `apps/mobile/test/native_pronunciation_bridge_test.dart` (new)
  - `apps/mobile/README.md`
  - `docs/architecture/MOBILE_PRONUNCIATION.md` (new)
  - `.ai/WORK_QUEUE.md`
  - `.ai/worker-reports/LB-DS-005.md` (this report)
  - `CURRENT_WORK.md`
- Checks run:
  - New bridge test was observed failing because `pronunciation_player.dart` did not exist, then
    passed after the minimal channel contract and native allowlists were implemented.
  - `dart format --output=none --set-exit-if-changed ...` → pass, 0 changed.
  - `cd apps/mobile && flutter analyze --no-pub` → pass, no issues.
  - Focused Flutter tests (`mobile_learning_loop_test.dart`,
    `native_pronunciation_bridge_test.dart`) → pass, 14/14.
  - `cd apps/mobile && flutter test --no-pub` → pass, 73/73.
  - `FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn flutter build apk --debug --no-pub`
    → pass; the default Google artifact endpoint returned HTTP 403 before the mirror retry.
  - `cd apps/mobile && flutter build ios --debug --no-codesign --no-pub` → pass after regenerating
    ignored Flutter/iOS metadata from the existing local toolchain state.
  - `pnpm check` → pass.
  - `pnpm build` → pass.
  - `node scripts/validate-migrations.mjs` → pass, 11 migrations.
  - Android emulator smoke → pass: APK installed and launched on Pixel 7/API 37, the word control
    appeared, and tapping it produced no platform/Flutter playback error or calm-failure UI.
- Physical Android listening QA → pass on Xiaomi M2006C3LG / Android 11. The owner heard all six
  approved V2 clips in order and confirmed that every word phrase and sentence was clear and
  exactly matched its German text. A temporary uncommitted QA entrypoint exercised the same
  packaged assets and native allowlist after the unchanged baseline secure-storage flow prevented
  card advancement; it was removed and the production APK was rebuilt and restored afterward.
- Checks unavailable: no required LB-DS-005 check remains unavailable. No physical iOS claim is
  made. `flutter pub get` returns a pub.dev authorization failure; tests and builds used existing
  local generated metadata with `--no-pub` and changed no dependency or lockfile.
- Remaining work: complete independent high-reasoning review and require green GitHub CI before any
  merge decision.
- Risks: playback failure is isolated from grading, exact native allowlists reject unknown paths,
  both platform builds compile and real-device output passed. The secure-storage retry UI also
  appeared on a clean install, but the same behavior reproduced from unmodified `origin/main`, so
  it is not introduced by this audio branch and should be handled as separate follow-up work.
- Secrets or production changes: none. No credential, provider, URL, network client, storage, sync,
  identity, flag, release or production behavior changed.
- Bobo canonical status: unchanged.
- Routing evidence: two serial substantial-worker attempts using `aval-ai/gpt-5.6-terra` stalled
  without changing files. The supervisor explicitly escalated to its configured high-reasoning tier
  and completed the verified implementation. No concurrent worker and no Codex review were used.
