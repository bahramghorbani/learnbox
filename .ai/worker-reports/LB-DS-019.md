# LB-DS-019 / dormant auth composition handoff

- Branch: `worker/lb-ds-019-dormant-auth-composition`
- Base commit: `8ff6384`
- Head commit: `859a8d5`
- Draft PR: #140 merged — https://github.com/bahramghorbani/learnbox/pull/140
- Scope completed: injected optional auth screen builder with explicit false-by-default gate; default app remains Today shell and no auth surface is reachable unless a caller explicitly enables the injected dormant composition
- Files changed: `apps/mobile/lib/app.dart`, `apps/mobile/test/mobile_auth_composition_test.dart`, `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-019.md`
- Checks run: focused composition tests passed (`+3`), full Flutter tests passed (`+127`), Flutter analyze passed, format passed, AI queue validator passed, continuity validator passed, diff check passed
- Checks unavailable: Android debug APK build, full pnpm check/build and migration validation pending final PR boundary run; no claim is made yet
- Remaining work: independent security/UI review; final release-gated activation of auth config/provider/OTP remains separate and owner-gated
- Risks: auth builder is intentionally powerful at an explicit caller boundary; default flag remains false and main.dart does not pass a builder; visual/device review remains required before any real activation
- Secrets or production changes: none; no provider, endpoint, secret, real OTP, Preview, Production, background, analytics or review-sync activation
- Bobo canonical status: no Bobo asset was changed, added or composed

## TDD evidence

- RED: composition test initially failed because `LearnBoxApp` had no `authEnabled` or `authScreenBuilder` parameters.
- GREEN: `flutter test test/mobile_auth_composition_test.dart` — `00:00 +3: All tests passed!`.
- GREEN regression: full `flutter test` — `00:05 +127: All tests passed!`.

## Scope guard

`apps/mobile/lib/main.dart` is unchanged. `MobileAuthConfig.defaults()` remains auth-disabled, signed-out and review-sync-disabled. The composition seam is dependency-injected and has no direct network, provider, token, background or release behavior.
