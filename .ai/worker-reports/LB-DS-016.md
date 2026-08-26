# LB-DS-016 / NI-008B handoff

- Task: NI-008B dormant native auth client seam
- Base: main at `d6bacdf`, rebased onto `fd141cc` (PR #130)
- Branch: `worker/lb-ds-016-native-auth-client`
- Status: ready for independent security review (Draft PR)

## What was implemented

- `apps/mobile/lib/features/identity/mobile_auth_http_client.dart` — provider-neutral injected
  HTTPS JSON transport contract (`MobileAuthHttpTransport`/`MobileAuthHttpResponse` with
  `statusCode`/`contentType`/`body`), strict bare-HTTPS-origin validation (rejects http, credentials,
  path, explicit port, query, fragment), exact endpoint paths relative to the constructor origin
  only, bounded timeout (`MobileAuthException('timeout')`), strict status/content-type/JSON/object
  parsing (`application/json` or `application/json; charset=utf-8`; malformed JSON, null or
  non-string values, missing keys and non-JSON content types all → `validation`), typed
  `MobileOtpChallenge`/`MobileTokenPair` results, no logging or secrets.
- `apps/mobile/lib/features/identity/mobile_auth_client.dart` — typed dormant
  `requestOtp`/`verifyOtp`/`refreshSession`/`revokeSession` over the injected transport and the
  existing `MobileSessionStore`. Persists only after successful verify/refresh; clears locally
  before best-effort remote revoke; `authenticationRequired` when no session is persisted; derives
  the opaque session id from the access token `sid` claim without trusting token validity. No
  composition, UI, flag, background work, connectivity listener, review sync, provider, Preview or
  Production call.

## Direct tests (RED observed, then GREEN)

- `test/mobile_auth_http_client_test.dart` — 11 tests: origin rejection (http, credentials, path,
  explicit port, query, fragment), positive-timeout requirement, exact request/verify/refresh/revoke
  JSON bodies and endpoints, strict JSON content type, typed results, bounded timeout → `timeout`,
  non-2xx → `serverUnavailable`, malformed/unexpected JSON → `validation`.
- `test/mobile_auth_client_test.dart` — 8 tests: origin rejection, request forwards without store
  touch, verify persists tokens + session id, verify failure writes nothing, refresh persists
  rotation, refresh without session → `authenticationRequired`, revoke clears locally before remote,
  revoke clears locally even when remote revoke fails.

## Required check results (exact)

- `dart format --output=none --set-exit-if-changed <4 files>` — `Formatted 4 files (0 changed)`; OK.
- `cd apps/mobile && flutter analyze` — `No issues found! (ran in 4.7s)`.
- Focused `flutter test test/mobile_auth_http_client_test.dart test/mobile_auth_client_test.dart` —
  `00:00 +21: All tests passed!`.
- Full `cd apps/mobile && flutter test` — `01:05 +115: All tests passed!`.
- `cd apps/mobile && flutter build apk --debug` — **fails on network**: Gradle cannot download
  `flutter_embedding_debug-1.0.0-...jar` from `https://storage.googleapis.com/download.flutter.io/...`
  (HTTP 403 Forbidden, verified by direct `curl -sI`). Not a source defect.
  `cd apps/mobile/android && ./gradlew assembleDebug --offline` — `BUILD SUCCESSFUL in 43s`,
  EXIT=0, artifact `build/app/outputs/flutter-apk/app-debug.apk` (159207620 bytes, 2026-08-26 19:53).
  The offline build uses the cached jar and produces the real debug APK.
- `pnpm check` — **fails only on pre-existing `DESIGN.md`** merged by PR #130 (`fd141cc`,
  origin/main): repo prettier (^3.6.2) requires single quotes; PR #130 committed double-quoted
  YAML. `DESIGN.md` is outside this task's allowlist and is identical to `origin/main`
  (`git diff HEAD -- DESIGN.md` empty), so it is not a regression from this branch. All other
  check stages (lint, typecheck, tests, dashboards, load, engine-load, security, all verifiers)
  passed.
- `pnpm build` — EXIT=0, `apps/website build: Done`.
- `node scripts/validate-migrations.mjs` — `Validated 13 migration(s).`, EXIT=0.
- `git diff --check` — clean, EXIT=0.

## Files changed (exact diff paths)

- `apps/mobile/lib/features/identity/mobile_auth_http_client.dart` (new)
- `apps/mobile/lib/features/identity/mobile_auth_client.dart` (new)
- `apps/mobile/test/mobile_auth_http_client_test.dart` (new)
- `apps/mobile/test/mobile_auth_client_test.dart` (new)
- `apps/mobile/README.md` (NI-008B paragraph)
- `docs/architecture/OFFLINE_SYNC.md` (Native auth client seam section)
- `.ai/worker-reports/LB-DS-016.md` (this report)
- `.ai/WORK_QUEUE.md` (registry status)
- `CURRENT_WORK.md` (registry status)

`apps/mobile/pubspec.lock` was touched by `flutter pub get --offline` and reverted; it is outside
the allowlist and unchanged.

## Scope guard

No endpoint activation, real OTP, provider call, secret, deployment, Preview execution, Production,
background work, review-sync upload, UI, flag or `main.dart` composition. No dependency added
(`dart:convert`/`dart:async` only). `MobilePreviewAuthConfig`/`MobileAuthConfig` untouched.
`apps/mobile/pubspec.lock` reverted. Rebased onto current `origin/main` (`fd141cc`) without
force-push; stash pop preserved PR #130's `WORK_QUEUE.md`/`CURRENT_WORK.md` additions.