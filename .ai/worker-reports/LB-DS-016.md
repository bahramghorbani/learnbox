# LB-DS-016 / NI-008B handoff

- Task: NI-008B dormant native auth client seam
- Base: main at `d6bacdf`
- Branch: `worker/lb-ds-016-native-auth-client`
- Status: ready for independent security review (Draft PR)
- Allowed paths: `apps/mobile/lib/features/identity/mobile_auth_http_client.dart`,
  `apps/mobile/lib/features/identity/mobile_auth_client.dart`,
  `apps/mobile/test/mobile_auth_http_client_test.dart`,
  `apps/mobile/test/mobile_auth_client_test.dart`, `apps/mobile/README.md`,
  `docs/architecture/OFFLINE_SYNC.md`, `.ai/worker-reports/LB-DS-016.md`,
  `.ai/WORK_QUEUE.md`, `CURRENT_WORK.md`

## What was implemented

- `MobileAuthHttpClient` + `MobileAuthHttpTransport`/`MobileAuthHttpResponse` contract
  (`mobile_auth_http_client.dart`): provider-neutral injected JSON POST boundary, strict HTTPS-only
  bare-origin validation (no credentials, port, path, query, fragment), exact endpoint paths
  relative to the constructor origin only, bounded timeout, strict status/JSON/object-shape parsing,
  typed generic `MobileAuthException` codes (`timeout`, `validation`, `serverUnavailable`),
  `MobileOtpChallenge`/`MobileTokenPair` typed results, no logging or secrets.
- `MobileAuthClient` (`mobile_auth_client.dart`): typed `requestOtp`/`verifyOtp`/`refreshSession`/
  `revokeSession` over the injected transport and existing `MobileSessionStore`. Persists session
  only on successful verify/refresh; clears local session before best-effort remote revoke; derives
  the opaque session id from the access token's `sid` claim without trusting token validity; reads
  the persisted session for refresh; `authenticationRequired` when no session is persisted. No
  composition into `main.dart`, no UI, flags, background, connectivity, review sync, provider,
  Preview or Production call.

## Direct tests (RED then GREEN)

- `test/mobile_auth_http_client_test.dart` — 10 tests: origin rejection (http, credentials, path,
  explicit port, query, fragment), positive-timeout requirement, exact request/verify/refresh/revoke
  JSON bodies and endpoints, typed challenge/session results, bounded timeout → `timeout`, non-2xx →
  `serverUnavailable`, malformed/unexpected JSON → `validation`.
- `test/mobile_auth_client_test.dart` — 8 tests: origin rejection, request forwards without store
  touch, verify persists tokens + session id, verify failure writes nothing, refresh persists
  rotation, refresh without session → `authenticationRequired`, revoke clears locally before remote,
  revoke clears locally even when remote revoke fails.

## Required check results (exact)

- `dart format --output=none --set-exit-if-changed` — passed: `Formatted 4 files (0 changed) in 0.01 seconds.`
- `cd apps/mobile && flutter analyze` — passed: `No issues found! (ran in 1.3s)`.
- Focused: `flutter test test/mobile_auth_http_client_test.dart test/mobile_auth_client_test.dart` — passed: `00:00 +19: All tests passed!`.
- Full `cd apps/mobile && flutter test` — passed: `00:50 +115: All tests passed!`.
- `cd apps/mobile && flutter build apk --debug` — blocked by network: Gradle received HTTP 403 from `storage.googleapis.com/download.flutter.io` while resolving the cached Flutter embedding artifact. Correct-JDK offline retry (`JAVA_HOME=/Applications/Android Studio.app/Contents/jbr/Contents/Home ./gradlew assembleDebug --offline`) reached `:app:copyFlutterAssetsDebug` but failed with macOS `Could not set file mode 644` on `kernel_blob.bin`. No APK success is claimed.
- `pnpm check` — blocked by unrelated pre-existing `DESIGN.md` Prettier failure (`[warn] DESIGN.md`); no out-of-scope formatting change made.
- `pnpm build` — passed: all workspace builds completed, including website/admin/API.
- `node scripts/validate-migrations.mjs` — passed: `Validated 13 migration(s).`
- `git diff --check` — passed (no output).

## Scope guard

No endpoint activation, real OTP, provider call, secret, deployment, Preview execution, Production,
background work, review-sync upload, UI or `main.dart` composition was performed. No `pubspec.yaml`
dependency was added (uses `dart:convert`/`dart:async` only). Existing dormant
`MobilePreviewAuthConfig`/`MobileAuthConfig` remain untouched.
