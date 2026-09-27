# LB-DS-015 handoff

- Task: NI-008A native Preview host/config seam
- Branch: `worker/lb-ds-015-native-preview-host-config`
- Base commit: `cc0125a` (activation PR #127 merged)
- Head commit: `88e63b2`; merged through PR #128 at merge commit `d5b5fa0` on 2026-08-26.
- Draft PR: https://github.com/bahramghorbani/learnbox/pull/128 (merged). Activation/queue docs
  merged separately through PR #127 at merge commit `cc0125a` (branch `docs/activate-lb-ds-015`,
  head `1f8fa67`).
- Scope completed: NI-008A only. Added the Android `INTERNET` permission, immutable compile-time
  `LEARNBOX_MOBILE_PREVIEW_ORIGIN` / `LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED` config seam, direct
  config/manifest tests, and mobile/offline-sync documentation. Production composition remains
  unchanged and fail-closed; defaults stay signed out and disabled.
- Files changed (merged diff, PR #128): `apps/mobile/android/app/src/main/AndroidManifest.xml`;
  `apps/mobile/lib/features/identity/mobile_preview_auth_config.dart`;
  `apps/mobile/test/android_network_permission_test.dart`;
  `apps/mobile/test/mobile_preview_auth_config_test.dart`; `apps/mobile/README.md`;
  `docs/architecture/OFFLINE_SYNC.md`; `.ai/worker-reports/LB-DS-015.md`. PR #127 additionally
  changed `.ai/WORK_QUEUE.md` and `CURRENT_WORK.md` (queue activation docs only).
- Checks run: `dart format`; `flutter analyze`; full `flutter test`; `pnpm check`; `pnpm build`;
  `node scripts/validate-migrations.mjs`; `git diff --check`; direct config tests (RED first, then
  GREEN). PR #128 GitHub checks all passed: `mobile`, `production-stack`, `quality`, `secrets`,
  Vercel.
- Checks unavailable: local `flutter build apk --debug` reached Gradle but failed twice before
  compilation because the Flutter embedding artifact download from `storage.googleapis.com`
  returned HTTP 403; no source/dependency defect was inferred. GitHub mobile CI completed the
  debug APK build successfully, so the APK build requirement is satisfied through CI.
- Remaining work: none for NI-008A. CI APK build remains the required path while the local Flutter
  artifact HTTP 403 persists. Later serial NI-008 slices (dormant auth client, UI surface,
  composition gate, fail-closed Preview auth runtime) are recorded in the queue as
  LB-DS-016/018/019/020.
- Risks: NI-008A remains dormant/default-disabled. No native OTP, endpoint activation, Preview
  request, provider, HTTP client, token/session composition, UI, deployment, Production behavior
  or review sync occurred; real Preview verification and any review-sync upload still require
  separate owner authorization.
- Secrets or production changes: none. No credential, real personal data, provider activation,
  production flag, network path or UI activation was added.
- Bobo canonical status: untouched.
