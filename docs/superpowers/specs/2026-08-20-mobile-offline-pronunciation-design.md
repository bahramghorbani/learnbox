# Mobile offline pronunciation design

**Status:** proposed for bounded implementation  
**Issue:** GitHub #59  
**Risk:** substantial native/mobile implementation with no network or release activation

## Goal

Add explicit offline playback controls for the six already-approved Start Pack V2 clips: one word
phrase and one example sentence for each of the three canonical cards. Preserve the existing active
recall and grading flow. Do not restore closed PR #58, its branch, its V1 media, or its implementation.

## Non-goals

- No autoplay, streaming, URL, network client, provider, storage, sync or identity behavior.
- No new audio package or dependency.
- No content, asset, `pubspec.yaml`, release flag, production or Bobo change.
- No background playback, playlist, speed control, recording, download or audio cache.

## Architecture

Create a small `PronunciationPlayer` contract in the review feature with `playAsset(String)` and
`stop()` operations. Production uses a `MethodChannelPronunciationPlayer`; tests inject a fake. The
player is composed at the app boundary and passed through `TodayScreen` to `ReviewScreen`; it is not
a global singleton.

Use one channel, `learnbox/pronunciation_v2`, with methods `playAsset` and `stop`. The Dart caller
obtains paths only from `StartPackAudioAssets`. Android and iOS independently enforce a fixed
allowlist containing exactly the six V2 paths. Unknown or malformed paths fail closed. A new play
request stops the previous clip before starting the approved local asset.

Android uses the platform media API with the packaged Flutter asset descriptor. iOS uses the
platform audio API with the packaged Flutter asset path. Both implementations are local-only and
must release the previous player on replacement, stop and host teardown. No third-party plugin is
added.

## UI behavior

- Show a Persian word-pronunciation control beside the visible German phrase for a known card.
- Show a separate sentence-pronunciation control only after the answer is revealed.
- Labels are truthful and accessible: `پخش تلفظ واژه` and `پخش جمله نمونه`.
- Each control has a minimum 56px target and keeps German text LTR inside the RTL screen.
- Never autoplay. Disable playback controls only while a platform request is being started.
- On failure, keep the review usable and announce the live-region message
  `پخش صدا انجام نشد؛ دوباره تلاش کن.`. A later attempt may retry.
- Stop current playback when grading advances the card and when the screen is disposed. Playback
  failure or stop failure must never record, discard or block a review grade.
- If a card has no approved mapping, render no playback control.

## Test contract

1. Unit tests verify the method channel name, exact V2 path argument, stop call and calm
   `PlatformException` propagation without any URL behavior.
2. Widget tests verify word control visibility, sentence control reveal timing, exact path routing,
   accessible Persian labels, 56px targets, one-request-at-a-time behavior and calm failure UI.
3. Existing grading tests must continue proving one durable `reviewQueue.record` per grade and no
   advance before persistence.
4. Native bridge source-contract tests verify the exact six-path allowlist, required channel/method
   names, packaged-asset loading and absence of URL/network APIs.
5. Run formatter, Flutter analysis, focused tests, full Flutter tests, debug Android build and
   no-codesign debug iOS build.
6. Before merge, perform Android emulator smoke plus physical Android listening QA for all six clips
   and record that each plays the already-approved German phrase. Unavailable device evidence is a
   merge blocker, not a passing result.

## Allowed implementation paths

- `apps/mobile/lib/app.dart`
- `apps/mobile/lib/main.dart`
- `apps/mobile/lib/features/review/pronunciation_player.dart`
- `apps/mobile/lib/features/review/review_screen.dart`
- `apps/mobile/lib/features/review/today_screen.dart`
- `apps/mobile/android/app/src/main/kotlin/com/learnbox/learnbox/MainActivity.kt`
- `apps/mobile/ios/Runner/AppDelegate.swift`
- `apps/mobile/test/mobile_learning_loop_test.dart`
- `apps/mobile/test/native_pronunciation_bridge_test.dart`
- `apps/mobile/test/support/mobile_test_app.dart`
- `apps/mobile/README.md`
- `docs/architecture/MOBILE_PRONUNCIATION.md`
- `.ai/WORK_QUEUE.md`
- `.ai/worker-reports/LB-DS-005.md`
- `CURRENT_WORK.md`

`StartPackAudioAssets`, the six V2 files and `pubspec.yaml` are read-only inputs. Any need to change
them, add a dependency, broaden paths or alter product behavior stops the task for supervisor review.

## Routing and review

This is a substantial-worker task because it crosses Dart composition, accessible UI and both native
hosts. Escalate to high-reasoning review for any lifecycle ambiguity, platform security concern,
new dependency, scope expansion, repeated test failure or uncertain device behavior. Independent
high-reasoning review and all repository gates are required before merge.
