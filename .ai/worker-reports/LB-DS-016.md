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

- `test/mobile_auth_http_client_test.dart` — 14 tests: origin rejection (http, credentials, path,
  explicit port, query, fragment), positive-timeout requirement, exact request/verify/refresh/revoke
  JSON bodies and endpoints, strict exact response keys and JSON content type, typed results, bounded
  timeout → `timeout`, non-2xx → `serverUnavailable`, malformed/unexpected JSON → `validation`.
- `test/mobile_auth_client_test.dart` — 9 tests: origin rejection, request forwards without store
  touch, verify persists tokens + session id on success, verify rejects missing sid without writing,
  verify failure writes nothing, refresh persists rotation, refresh without session →
  `authenticationRequired`, revoke clears locally before remote, revoke clears locally even when remote
  revoke fails.

## Required check results (exact)

- `dart format --output=none --set-exit-if-changed <4 files>` — `Formatted 4 files (0 changed)`; OK.
- `cd apps/mobile && flutter analyze` — `No issues found! (ran in 1.3s)`.
- Focused `flutter test test/mobile_auth_http_client_test.dart test/mobile_auth_client_test.dart` —
  `00:00 +23: All tests passed!`.
- Full `cd apps/mobile && flutter test` — `00:05 +117: All tests passed!`.
- `cd apps/mobile && flutter build apk --debug` — normal Flutter wrapper is blocked by the network: Gradle
  cannot download `flutter_embedding_debug-1.0.0-...jar` from `storage.googleapis.com/download.flutter.io`
  (HTTP 403 Forbidden, verified by direct `curl -sI`). Correct-JDK offline equivalent
  `cd apps/mobile/android && ./gradlew assembleDebug --offline` — **passed**: `BUILD SUCCESSFUL in 43s`,
  `149 actionable tasks: 124 executed, 25 up-to-date`, `EXIT=0`. Verified artifact:
  `apps/mobile/build/app/outputs/flutter-apk/app-debug.apk`, 159207620 bytes. The debug APK build
  acceptance criterion is therefore satisfied through the equivalent Gradle command; the network
  403 remains a wrapper-path limitation.
- `pnpm check` — fails at `pnpm format:check` on pre-existing `DESIGN.md`; no out-of-scope
  formatting change made.
- `pnpm build` — EXIT=0; all workspace builds completed.
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
