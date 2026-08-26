# Native Preview Auth Verification Design

**Status:** Reviewed design and test plan; no native activation implemented
**Storyboard:** 24 of 30 — Beta and load testing
**Scope:** Default-disabled Android/iOS transport permission, explicit Preview endpoint selection, and a future owner-controlled native OTP/session verification.
**Depends on:** ADR 0011, native auth endpoints from NI-003, dormant mobile session/transport adapters from NI-006, dormant composition from NI-007, and approved native audio QA evidence.

## Goal

Define smallest reversible path to verify native identity on one owner-controlled device against the existing Preview-only OTP boundary. The path must keep production behavior signed out and preserve the local review queue. It does not activate review upload.

## Current facts

- Server native OTP/session routes exist but fail closed unless `MOBILE_AUTH_ENABLED=true` and `SMS_IR_ENABLED=true` with required server secrets.
- Flutter production composition has no endpoint reader, HTTP client, auth UI, token composition, or native network permission.
- Android manifest does not declare `android.permission.INTERNET`; iOS requires no equivalent entitlement for HTTPS.
- The existing protected `/owner/otp-test` route is browser-only and uses Preview-only flags. It is not a native verification client.
- `MOBILE_REVIEW_SYNC_ENABLED` remains false throughout this design and every later native-auth verification slice.

## Non-negotiable boundaries

- No Production hostname, flag, secret, deployment, DNS, Caddy, provider configuration, release signing, cohort invitation, analytics, background work, connectivity listener, timer, or review upload.
- No endpoint is hard-coded into source. No endpoint comes from a remote config, user input, deep link, QR code, shared preference, or mutable local file.
- A native auth build accepts only a compile-time HTTPS Preview origin whose host is explicitly approved by the owner at execution time. Loopback HTTP remains limited to local developer testing.
- The mobile client never receives SMS credentials, database credentials, server signing keys, a user ID, or a browser cookie.
- Phone number and received OTP are entered only by the owner on the device during the later verification run. They are never sent through chat, source files, logs, screenshots, test fixtures, or PR text.
- Reverting verification means returning deployment flags to false and reinstalling a default-disabled build if needed; local queued review events are neither uploaded nor deleted.

## Serial implementation plan

### NI-008A — host capability and immutable build config

**Allowed paths:**

- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `apps/mobile/lib/features/identity/mobile_preview_auth_config.dart`
- `apps/mobile/test/android_network_permission_test.dart`
- `apps/mobile/test/mobile_preview_auth_config_test.dart`
- `apps/mobile/README.md`
- `docs/architecture/OFFLINE_SYNC.md`

**Implementation:**

1. Add Android `INTERNET` permission only. Do not add cleartext traffic, network-security config, background services, receivers, or iOS ATS exceptions.
2. Add immutable compile-time values read only through `--dart-define=LEARNBOX_MOBILE_PREVIEW_ORIGIN=...` and `--dart-define=LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED=true`.
3. With either define absent, empty, or whitespace-only, preserve `MobileAuthConfig.defaults()` behavior: disabled, signed out, no endpoint and no new config value. Trim the origin before validation; reject any value whose scheme is not exactly `https`, has credentials, query, fragment, a non-root path, a port, or an exact-string mismatch with the owner-approved full Preview origin. Reject `LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED` unless it is exactly `true`.
4. The Preview-origin define is public build metadata, not a secret. It must contain only the owner-approved full `https://host` Preview origin and never an API key, OTP/session secret, SMS credential, token, Production origin, or endpoint path. Production builds must omit both native Preview defines.
5. Keep `MobileAuthConfig.defaults()` unchanged. The new config may make later composition possible but must not compose a client, storage, identity state, or review transport.
6. Tests must prove Android permission presence, default-disabled behavior, rejection of malformed/non-HTTPS/credentialed/path-bearing/port-bearing/Production origins, and exact acceptance only of an approved Preview fixture.

**Required checks:** formatter; `flutter analyze`; focused tests; full `flutter test`; `flutter build apk --debug`; `pnpm check`; `pnpm build`; migration validation; `git diff --check`.

**Stop condition:** Draft PR and high-reasoning review. No deployment flags change.

### NI-008B — owner-visible foreground native OTP/session seam

**Allowed paths:** only a new narrowly scoped mobile identity client, injected HTTP abstraction, auth-session composition seam, direct tests, and documentation named in its separate queue record.

**Implementation constraints:**

- The seam is compiled only when NI-008A config is valid and a second explicit compile-time verification flag is true; defaults remain disabled.
- Use strict JSON, bounded timeouts, HTTPS-only endpoint validation, generic typed failures, and secure storage already present in the app.
- OTP request/verify/refresh/revoke must target only existing native endpoints. No review route, `HttpReviewSyncTransport`, or `ReviewSyncCoordinator` activation.
- Do not add auto-refresh, background retry, foreground auto-trigger, connectivity listener, or analytics.
- The UI is owner-only and must not be reachable in ordinary default builds. Exact visual/product shape requires a separate review before implementation.

**Stop condition:** Draft PR, security review, and a separate owner approval before deployment flag changes or any real OTP delivery.

### NI-008C — one-device Preview verification and rollback

**Execution prerequisites:**

1. Owner supplies the approved Preview origin through the private build/deployment process, not chat or source control.
2. Owner sets `MOBILE_AUTH_ENABLED=true` and `SMS_IR_ENABLED=true` only in the protected Preview environment, confirms Vercel Authentication remains on, and redeploys Preview.
3. Owner installs the explicitly configured debug build on one connected device.
4. Owner enters phone and OTP on the device.

**Evidence:**

- No secret, phone, code, token, response body, or full endpoint appears in evidence.
- Record only environment class (`preview`), build commit, device model/OS, generic endpoint class, generic request/verify result, session-created result, logout/revoke result, and rollback result.
- Validate that no review upload was attempted and pending local queue entries remain intact.

**Rollback:**

1. Set both Preview flags to `false`.
2. Redeploy Preview.
3. Confirm native auth routes fail closed and native owner UI/build gate is disabled.
4. Force-stop/uninstall only if the owner explicitly asks; do not clear application data by default.

**Stop condition:** completion does not authorize review-sync upload, cohort use, Production, or release. Those require a separate design, queue task, and owner authorization.

## Threat review checklist

- [ ] Endpoint cannot be overridden by user-controlled runtime input.
- [ ] Android allows HTTPS only; no cleartext exception.
- [ ] iOS has no ATS weakening.
- [ ] Defaults produce signed-out/disabled behavior without a build define.
- [ ] Token values remain in secure storage and never enter logs/analytics.
- [ ] No client user ID, installation ID trust, browser cookie, Origin/CORS bypass, or provider secret is introduced.
- [ ] No review queue event is uploaded or removed in NI-008A/B/C.
- [ ] Rollback retains encrypted queue state.

## Owner gates

- Exact Preview hostname and private build injection: owner gate at NI-008C execution.
- Preview deployment flags and any real OTP delivery: owner gate at NI-008C execution.
- Any review sync, broader cohort, Production, payment/provider change, DNS/Caddy change, or release: separate owner gate.
