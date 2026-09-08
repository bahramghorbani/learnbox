# LB-DS-047 — Android M3-S1 device-local pronunciation preference

- Status: review_requested
- Branch: `feature/m3-android-sound-preference`
- Base commit: `7dba5adab77b0b90a228ac8c7aabab0bc54e3830` (`origin/main`, M3-S1 coordination PR #243 merge)
- Head commit: PR head (this local branch head; verify remotely before merge — the final metadata commit records its own position, not a self-referential SHA)
- Draft PR: - (local verification only; not pushed, not merged)
- Scope completed: yes
- Files changed: `apps/mobile/lib/app.dart`, `apps/mobile/lib/features/review/review_screen.dart`, `apps/mobile/lib/features/review/settings_screen.dart`, `apps/mobile/lib/features/review/sound_preference_store.dart` (new), `apps/mobile/test/sound_preference_store_test.dart` (new), `apps/mobile/test/learner_profile_settings_test.dart`, `apps/mobile/test/mobile_learning_loop_test.dart`, `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-047.md`, `CURRENT_WORK.md`, `docs/design/DESIGN_STATUS.md`, `docs/PRODUCT_STATUS.md`
- Files changed outside the queue's allowed-path list (necessary regression fix, see Regression): `apps/mobile/test/support/sound_preference_test_storage.dart` (new), `apps/mobile/test/support/mobile_test_app.dart`, `apps/mobile/test/mobile_visual_parity_test.dart`, `apps/mobile/test/today_screen_states_test.dart`, `apps/mobile/test/mobile_auth_composition_test.dart`
- Checks run: RED-first store tests then GREEN 17/17 (15 original + 2 storage-timeout tests added after the on-device hang root cause); focused `learner_profile_settings_test.dart` 14/14; focused `mobile_learning_loop_test.dart` 14/14; full Flutter suite 226/226 (verified on two independent runs after the regression fix); `flutter analyze` clean; `dart format --set-exit-if-changed` clean; `flutter build apk --debug` success; `git diff --check` clean; queue/documentation-governance/AI-continuity validators, dashboard tests and repo Prettier all clean; Android emulator RTL/persistence re-verification on Pixel_7 AVD (see Evidence)
- Checks unavailable: emulator TalkBack screen-reader pass (semantics verified by widget tests via `SemanticsData.flagsCollection` and live-region flags; no TalkBack service installed on the AVD)
- Remaining work: independent code/product review and merge (Draft PR required by queue); Web M3-S1 (LB-DS-046) remains queued; M3-A1 server identity reads unchanged
- Risks: none identified beyond scope: sound preference is device-local and un-synced by contract; no native host/manifest/Gradle/iOS/auth/sync/personal-vocabulary/commerce/flags/deployment change included; no new dependency (uses the pre-existing `flutter_secure_storage` 11.0.0)
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Scope

- Added a dedicated versioned sound-preference store (`sound_preference_store.dart`) backed by the
  existing `flutter_secure_storage` dependency under its own key
  `learnbox.soundPreference.v1` with matching `storageNamespace`. Records are a single JSON document
  `{"version":1,"enabled":bool}`. No record / blank record => enabled (default-on compatibility);
  corrupt v1 data self-heals to `{"version":1,"enabled":true}` rewriting only its own key (best
  effort, heal failure swallowed); unknown newer versions resolve to enabled and are never touched;
  read failure never crashes (controller keeps the safe enabled default and surfaces a truthful
  read status with retry in Settings); save failure reverts (the switch never moves ahead of a
  confirmed write) with a truthful live-region error and retry action, and a successful save
  announces via a live region. Every load/save is bounded by `storageTimeout` (5 s default) so a
  hung keystore operation surfaces a truthful read/save-failure + revert + retry instead of an
  unbounded hang (root-caused on-device: `flutter_secure_storage` write hung >7 s on the AVD
  keystore without throwing).
- `app.dart` now owns one `SoundPreferenceController` per app instance (constructor-injectable
  `SoundPreferenceStore` for tests, default `SecureSoundPreferenceStorage`), triggers one `load()`
  at startup, disposes it, and exposes it to pushed routes through `SoundPreferenceScope` above the
  Navigator via `MaterialApp.builder`.
- `settings_screen.dart` (child Settings, M3-P1 foundation) adds the single real device-local sound
  switch row: `پخش تلفظ` (SwitchListTile, key `sound-preference-switch`) with subtitle
  `پخش صدای واژهها هنگام مرور`, disabled while loading/saving, plus live-region status lines:
  loading `در حال خواندن تنظیم صدا`, save error `ذخیرهٔ تنظیم انجام نشد؛ دوباره تلاش کن.` with a
  retry action `تلاش دوباره`, read-failure `خواندن تنظیم صدا انجام نشد؛ پخش صدا روشن فرض شد.` with
  retry, and save confirmation `تنظیم ذخیره شد.`. Text-size (`اندازهٔ متن`) and language rows stay
  informational; no fake pickers, sliders or extra toggles. Intro copy truthfully states the
  sound setting is stored on this device and the rest are informational.
- `review_screen.dart` gates pronunciation at the single `PronunciationPlayer.playAsset` call site:
  when the preference is OFF the review removes the word/sentence audio controls entirely and
  `_playAudio` returns before any `playAsset` call. No other `playAsset` call site exists in `lib`
  (verified by grep); Today and the learner home shell only forward the player, so no changes were
  needed there.
- Documentation statuses updated (`DESIGN_STATUS.md`, `PRODUCT_STATUS.md`) with the same truth
  claims; queue status moved to `review_requested`.

## Regression (real failures found during finalization, fixed)

- After the storage-timeout patch landed, the full Flutter suite failed 39 tests across 7 files
  (`app_test`, `launch_experience_test`, `widget_test`, `mobile_auth_composition_test`,
  `mobile_visual_parity_test`, `today_screen_states_test`, `mobile_learning_loop_test`) with
  `!timersPending` at teardown. Root cause: every test that mounts the full `LearnBoxApp` with the
  default `SecureSoundPreferenceStorage` starts `controller.load()`, whose real platform-channel
  read never completes under the widget-test fake-async clock; the new `storageTimeout` fake timer
  (5 s) therefore stays pending at teardown and the binding asserts. Before the timeout patch the
  same dangling read was invisible because no timer existed. All 39 failures trace the identical
  stack (`_LearnBoxAppState.initState` → `SoundPreferenceController.load` line 170). Probe test
  confirmed an unmocked `SecureSoundPreferenceStorage().read()` never completes in `testWidgets`.
- Fix (test hermeticity, no production behavior change): each full-app test helper now defaults the
  sound store to a shared in-memory double
  (`test/support/sound_preference_test_storage.dart`, `InMemorySoundPreferenceStorage`), mirroring
  how `learner_profile_settings_test` and the learning-loop persisted-OFF test already injected
  in-memory stores. RED evidence: the 39 failing pre-existing tests. GREEN after fix: all 39 pass;
  full suite 226/226 on two runs. These five helper/support files sit outside the queue's listed
  allowed paths; this is the only fix that keeps the required full-suite gate green without a
  production hack (a production-side timeout suppression would hide real device hangs). Product
  scope untouched.

## Evidence

- RED-first: store tests failed with `uri_does_not_exist` before the store existed, then passed
  after the store landed. Widget-layer RED: `learner_profile_settings_test.dart` and
  `mobile_learning_loop_test.dart` failed compilation (`soundPreferenceStore` parameter absent)
  before `app.dart` wiring, then passed after wiring; behavior tests (default-on switch, save
  persist + live-region announce, failed-save revert + retry, read-failure retry, sound-OFF
  removing audio controls and blocking `playAsset`, sound-ON restoring playback, persisted OFF on
  launch) went RED then GREEN. Two further store tests
  (`HangingSoundPreferenceStorage`, 50 ms timeout) went RED before `storageTimeout` bounded
  load/save, then GREEN.
- Store tests: 17/17 passed (`sound_preference_store_test.dart`): record handshake, v1 default-on,
  explicit on/off persistence, corrupt v1 self-heal rewrite, unknown newer version untouched and
  enabled, blank record default, read failure rethrow, write failure rethrow, hanging read and
  hanging write surfaced as failures within the timeout.
- Focused widget suites: `learner_profile_settings_test.dart` 14/14 (existing profile/settings
  tests plus the six new sound-preference tests); `mobile_learning_loop_test.dart` 14/14 (existing
  learning-loop tests plus the new persisted-OFF launch test; the secure-storage channel-sequence
  test injects an in-memory sound store so the queue's exact `read/read/write` channel sequence
  stays isolated).
- Full Flutter suite: 226/226 passed (baseline 203/203 plus 17 store tests plus six new
  behavior/widget tests) — final post-fix run and one repeat run both 226/226.
- `flutter analyze`: No issues found (one `unused_catch_stack` warning found and fixed during
  finalization). `dart format --set-exit-if-changed lib test`: clean (store + store test files
  needed one format pass during finalization).
- Debug APK: `flutter build apk --debug` succeeded (Android Studio JBR toolchain).
- Repo checks: `git diff --check` clean; `node scripts/validate-ai-worker-queue.mjs`
  (AI_WORKER_QUEUE_OK, 44 tasks); `node --test scripts/validate-ai-worker-queue.test.mjs` (5 pass);
  `node scripts/validate-documentation-governance.mjs` (DOCUMENTATION_GOVERNANCE_OK, 6 documents)
  and its test; `node scripts/validate-ai-continuity.mjs` (AI_CONTINUITY_OK); dashboard tests
  (`tools/project-dashboard/test/*.test.mjs`); repo Prettier (`pnpm format:check`) clean — the two
  status-doc rows were reflowed by Prettier after their edits (content diff unchanged, verified
  with `git diff --ignore-all-space`). pnpm deps installed from the shared store at
  `/Volumes/LearnBox-Dev/.pnpm-store`.
- Emulator (Pixel_7 AVD, fresh re-verification run during finalization): APK installed on a cold
  boot; Today -> Profile -> Settings navigation driven by adb input; Settings renders the
  `پخش تلفظ` switch (default ON) with subtitle `پخش صدای واژهها هنگام مرور`, informational
  `اندازهٔ متن`/`زبان` rows and RTL back `بازگشت به پروفایل`. Toggling OFF at the real switch
  thumb pixel (244, 745 — found by pixel scan; earlier coordinate guesses missed) turned the track
  grey and announced `تنظیم ذخیره شد.` (live region). `am force-stop` + relaunch + re-navigation:
  switch still OFF (pixel scan: zero blue track pixels). On-device value file present:
  `shared_prefs/learnbox.soundPreference.v1.xml` (encrypted payload, mtime matches the OFF write).
  Device restored to ON. Screenshots: `/Users/test/lb047-emulator-evidence/` (6 PNGs:
  today, profile, settings-ON, settings-OFF+live-region, settings-OFF-after-relaunch,
  settings-restored-ON).
- TalkBack screen-reader pass: unavailable (no TalkBack on AVD); accessibility intent is verified
  by widget tests asserting the merged switch label (`پخش تلفظ`), `hasToggledState`/`isToggled`
  semantics via `SemanticsData.flagsCollection`, and `isLiveRegion` on the save status.

## Verification (final commands)

- `cd apps/mobile && flutter pub get` (worktree-local; generated files not committed)
- `flutter test test/sound_preference_store_test.dart` (17/17)
- `flutter test test/learner_profile_settings_test.dart` (14/14)
- `flutter test test/mobile_learning_loop_test.dart` (14/14)
- `flutter test` (226/226, twice)
- `flutter analyze` (clean)
- `dart format --set-exit-if-changed lib test` (clean)
- `flutter build apk --debug` (success)
- `git diff --check` (clean)
- `node scripts/validate-ai-worker-queue.mjs`; `node --test scripts/validate-ai-worker-queue.test.mjs`;
  `node scripts/validate-documentation-governance.mjs`; `node --test scripts/validate-documentation-governance.test.mjs`;
  `node scripts/validate-ai-continuity.mjs`; `node --test tools/project-dashboard/test/*.test.mjs`;
  `pnpm format:check` (all clean)

## Review

- Awaiting independent review. Queue requires a Draft PR before merge; branch is local-only at this
  stage (not pushed, not merged). No secrets, credentials or production configuration touched.
