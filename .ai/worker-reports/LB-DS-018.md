# LB-DS-018 handoff

- Task: dormant Persian-first native auth UI surface
- Branch: `worker/lb-ds-018-native-auth-ui`
- Status: ready for independent UI/security review; Draft PR required

## Scope

- Added `MobileAuthScreen` only. It is injected with `MobileAuthClient` and is not imported by `main.dart` or `app.dart`.
- Phone and OTP stages provide RTL Persian copy, LTR inputs for phone/OTP, responsive scroll-safe layout, 44dp-or-larger controls, inline recoverable errors, phone-number change, verified state, and no credential/token display.
- Persian phone digits normalize before the injected client call.
- No direct HTTP transport, provider, flag, endpoint activation, Preview/Production call, background work, analytics, review sync, secret, dependency, or app composition was added.

## TDD evidence

- RED: initial focused test failed because `mobile_auth_screen.dart` and `MobileAuthScreen` did not exist.
- Additional RED: a missing `sid` acceptance path and response-shape validation were separately corrected in NI-008B before this UI slice.
- GREEN: `flutter test test/mobile_auth_screen_test.dart` — `+8: All tests passed!`.
- GREEN regression: Persian phone and OTP digits are accepted by the input formatters and normalized to ASCII before the injected client request.

## Checks

- `dart format lib/features/identity/mobile_auth_screen.dart test/mobile_auth_screen_test.dart` — passed.
- `cd apps/mobile && flutter test test/mobile_auth_screen_test.dart` — `+7: All tests passed!`.
- `cd apps/mobile && flutter analyze` — `No issues found! (ran in 1.3s)`.
- Full Flutter, APK, pnpm and migration checks pending final pre-PR run.

## Review focus

- Confirm default application remains unchanged: no `main.dart`/`app.dart` diff.
- Confirm all actual OTP delivery and composition remain blocked by separate owner authorization.
- Confirm Persian digit normalization and no secret rendering.
