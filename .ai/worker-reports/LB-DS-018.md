# LB-DS-018 / dormant native auth UI handoff

- Branch: `worker/lb-ds-018-native-auth-ui-clean`
- Base commit: `e284169`
- Head commit: `a4f4c82`
- Draft PR: #137 — https://github.com/bahramghorbani/learnbox/pull/137
- Scope completed: dormant Persian-first native auth UI with phone/OTP stages, validation, errors, verified state, change-number, RTL/LTR isolation, responsive layout and digit normalization
- Files changed: `apps/mobile/lib/features/identity/mobile_auth_screen.dart`, `apps/mobile/test/mobile_auth_screen_test.dart`, `.ai/worker-reports/LB-DS-018.md`, `.ai/WORK_QUEUE.md`
- Checks run: focused/full Flutter tests passed (`+8`, `+125`), Flutter analyze passed, format passed, pnpm check/build passed, migrations validated (`13`), diff check passed, GitHub CI passed
- Checks unavailable: local gitleaks executable absent; Android APK build blocked by unavailable DNS/network for Flutter embedding artifact and missing offline cache
- Remaining work: independent UI/security review; separate owner-gated composition task; real OTP/provider/Preview/Production activation remains out of scope
- Risks: critical mobile UI/UX review remains; visual review at 320/360/412dp and accessibility review remain required; resend cooldown is intentionally not active in this dormant slice
- Secrets or production changes: none; no secrets, real OTP, provider, endpoint activation, Preview, Production, background work, analytics or review-sync activation
- Bobo canonical status: no Bobo asset was changed, added or composed

## TDD evidence

- Initial RED observed because the screen file and widget were absent.
- GREEN focused test: `cd apps/mobile && flutter test test/mobile_auth_screen_test.dart` — `00:00 +8: All tests passed!`.
- GREEN full test: `cd apps/mobile && flutter test` — `00:05 +125: All tests passed!`.
- Persian phone and OTP input normalization are covered by focused widget tests.

## Scope guard

`main.dart` and `app.dart` are unchanged. The UI is not imported by default composition and remains unreachable in default builds. No new dependency, permission, network path, provider, flag enablement, token rendering or canonical asset change was introduced.
