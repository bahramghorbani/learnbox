# LB-DS-015 handoff

- Task: NI-008A native Preview host/config seam
- Branch: `worker/lb-ds-015-native-preview-host-config`
- Base commit: `cc0125a` (activation PR #127 merged)
- Implementation commit: pending
- Draft PR: pending
- Scope completed: Android `INTERNET` permission, immutable compile-time `LEARNBOX_MOBILE_PREVIEW_ORIGIN` / `LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED` config seam, direct config/manifest tests, and docs. Production composition remains unchanged and fail-closed.
- Files changed: `apps/mobile/android/app/src/main/AndroidManifest.xml`; `apps/mobile/lib/features/identity/mobile_preview_auth_config.dart`; `apps/mobile/test/android_network_permission_test.dart`; `apps/mobile/test/mobile_preview_auth_config_test.dart`; `apps/mobile/README.md`; `docs/architecture/OFFLINE_SYNC.md`; this report.
- TDD: direct config tests were written first and the initial RED run failed because the new config target was absent; implementation then made the focused tests pass.
- Validation passed: `dart format`; `flutter analyze`; full `flutter test` (94 tests); `pnpm install --frozen-lockfile`; full `pnpm check`; `pnpm build`; `node scripts/validate-migrations.mjs`; `git diff --check`.
- Local `flutter build apk --debug` reached Gradle but failed twice before compilation because Flutter embedding artifact download from `storage.googleapis.com` returned HTTP 403. No source/dependency defect was inferred; GitHub CI APK build remains required.
- Security boundary: no endpoint, HTTP client, token/session composition, UI, provider, secret, deployment, Preview request, Production, background work or review-sync upload was added or activated.
- Stop condition: Draft PR for independent high-reasoning security/scope review; do not merge from the worker.
