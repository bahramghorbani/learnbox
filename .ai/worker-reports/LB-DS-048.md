# LB-DS-048 — M3-A1 Web-only masked identity read

- Status: accepted
- Executor: high-reasoning Web/API identity worker (Hermes Agent, aval-ai/gpt-5.6-terra, custom provider)
- Base commit: `5d7a71720522611e03e8e2cef7a9b16b2a16b4df`
- Branch: `feature/m3-web-masked-identity`
- Head commit: `f8563bdb4d42de8995eaef4d96f5f83b62f5d4d4` (final PR head)
- Draft PR: #248 (merged) — https://github.com/bahramghorbani/learnbox/pull/248
- Merge commit: `b580d599c2a2b90c5fb505b8c54245e3f582cf5c`
- Files changed: see final scoped file list in this report.
- Scope completed: yes
- Bobo canonical status: unchanged
- Product surface: Learner Web and API
- Milestone/workstream: M3-A1 / Web learner plus backend identity read
- Capability inventory: Profile and account center; merged, verified dormant implementation
- Status change: planned/gated server identity read to merged verified dormant implementation; no activation
- Documents updated: `.ai/WORK_QUEUE.md`, `CURRENT_WORK.md`, `PROJECT_STATE.md`, `docs/PRODUCT_STATUS.md`, `docs/design/DESIGN_STATUS.md`, this report.
- Rollback: leave `WEB_LEARNER_PROFILE_ENABLED` unset/false, or revert this branch. No session, data, schema or deployment state changes.
- Secrets or production changes: none
- Checks run: focused API repository/service 6/6; focused Web HTTP/route/client/Profile 41/41; full API 139/139; full Website 270/270; API/Website typecheck/build; `pnpm check`; `pnpm build`; migration, format, queue/documentation/continuity/dashboard validators; `git diff --check`.
- Checks unavailable: none for the dormant implementation.
- Remaining work: runtime activation and Android identity remain separately gated.
- Risks: default-off runtime only; future activation needs separate owner-approved deployment/configuration review. Route-level signed-cookie 200 test is non-blocking future hardening.

## Scope

- Added `GET /api/learner/profile`, Node runtime only. Route derives canonical `users.id` only through existing signed HttpOnly learner cookie via `readLearnerSession`.
- Added API read-only repository selecting only `phone_e164` with parameterized `users.id`, plus service validation and Iranian masking. Browser response has only `maskedPhone`; raw phone, `first_name`, user ID, session and auth metadata never serialize.
- Added default-off `WEB_LEARNER_PROFILE_ENABLED` runtime configuration. Missing flag, DB URL or session secret returns generic no-store `503` before session processing.
- Missing/invalid session, missing learner, malformed phone, offline/client parse failure and server failure fail closed without identity. Every route outcome has `cache-control: no-store`.
- Profile keeps device-local goal and pending-review facts during identity loading/error/offline/unavailable states. Retry is only shown for failed server reads.
- No Android/mobile/iOS, migration/schema, auth/OTP/session/cookie, sign-out, deletion, account-scoped storage, sync, preferences, reminders, commerce, analytics, provider, secret, deployment, Preview/Production, landing, Admin or Bobo change.

## Strict TDD evidence

1. API service happy path
   - RED: `pnpm --filter @learnbox/api exec vitest run test/learner-profile.service.test.ts`
   - Evidence: module missing: `Cannot find module '../src/profile/learner-profile.service.js'`.
   - GREEN: same command after service implementation.
   - Evidence: `1 passed`.

2. API service masking correction
   - RED: same command after first minimal implementation.
   - Evidence: expected `{ maskedPhone: '0912***4567' }`, received `null`.
   - GREEN: same command after exact canonical phone mask correction.
   - Evidence: `1 passed`; final focused service suite `5 passed`.

3. API repository
   - RED: `pnpm --filter @learnbox/api exec vitest run test/postgres-learner-profile.repository.test.ts`
   - Evidence: module missing: `Cannot find module '../src/profile/postgres-learner-profile.repository.js'`.
   - GREEN: same command after read-only parameterized repository implementation.
   - Evidence: `1 passed`.

4. Web HTTP boundary
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-http.test.ts`
   - Evidence: module missing: `Cannot find module '../lib/learner-profile-web-http'`.
   - GREEN: same command after HTTP boundary implementation.
   - Evidence: `2 passed`.

5. Web route/runtime
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-route.test.ts`
   - Evidence: module missing: `Cannot find module '../app/api/learner/profile/route'`.
   - GREEN: `pnpm --filter @learnbox/api build && pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-route.test.ts test/learner-profile-web-http.test.ts`.
   - Evidence: API build passed; `3 passed`.

6. Web client
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-client.test.ts`
   - Evidence: module missing: `Cannot find module '../lib/learner-profile-web-client'`.
   - GREEN: same command after strict parser/client implementation.
   - Evidence: `2 passed`.

7. Profile state
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx`
   - Evidence: expected `بازیابی مشخصات حساب ممکن نشد.`, received neutral-only Profile text.
   - GREEN: same command after identity state rendering.
   - Evidence: `31 passed`.

## Sol review hardening — BLOCK received, addressed; final re-review required

1. HTTP output validation
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-http.test.ts`
   - Evidence: injected raw `09121234567` returned `200`; test expected generic no-store `503`.
   - GREEN: same command after exact `/^09\d{2}\*{3}\d{4}$/` runtime boundary validation.
   - Evidence: `3 passed`; raw, malformed, and array values return `{ error: 'serverUnavailable' }` with `cache-control: no-store`.

2. Client response schema
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-web-client.test.ts`
   - Evidence: response with extra `rawPhone` returned `ok`; test expected `unavailable`.
   - GREEN: same command after exact one-key `{ maskedPhone: string }` schema check and `typeof` guard.
   - Evidence: `2 passed`; arrays, objects, numbers, malformed values, and extra fields fail closed.

3. Identity composition and lifecycle
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx -t 'keeps disabled identity composition neutral'`
   - Evidence: disabled client composition still fetched `/api/learner/profile`.
   - GREEN: same command after default-off `NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED` client gate.
   - Evidence: `1 passed`; disabled/unset stays neutral and exposes no retry.
   - GREEN transition evidence: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx -t 'clears identity offline'` → `1 passed`; offline clears identity, reconnect rereads only when Profile remains eligible.
   - GREEN stale-read evidence: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx -t 'ignores a deferred identity completion'` → `1 passed`; deferred completion after navigation cannot restore identity.

4. Profile truthfulness and accessibility
   - RED: `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx -t 'shows the neutral account label'`
   - Evidence: missing required server-vs-device-local distinction.
   - GREEN: same command after revised Persian intro copy.
   - Evidence: `1 passed`.
   - Loading status semantics: focused assertion initially failed because loading note had no `role="status"`; after adding scoped status semantics, `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx -t 'announces identity loading'` passed `1` test. Existing global NetworkStatus count remains one. Retry target has `min-width` and `min-height` `44px`.

## Final verification

- Focused API repository/service: `6 passed`.
- Focused Web HTTP/route/client/Profile: `41 passed`.
- Full API: `31 files, 139 passed`; API build and typecheck passed.
- Full Website: `39 files, 270 passed`; Website typecheck and production build passed.
- `pnpm check`: passed.
- `pnpm build`: passed.
- `node scripts/validate-migrations.mjs`: `Validated 16 migration(s).`
- `pnpm format:check`: passed.
- Queue/documentation/continuity validators: `AI_WORKER_QUEUE_OK tasks=45`; `DOCUMENTATION_GOVERNANCE_OK documents=6`; `AI_CONTINUITY_OK`.
- Dashboard: `21 passed`.
- `git diff --check`: clean.
- Scope audit: changed paths restricted to LB-DS-048 allowed paths, except existing supervisor coordination files already in scope.
- Secret scan: added-line scan found no hardcoded credential values. `pnpm verify:security` passed inside `pnpm check`.
- RTL/responsive accessibility smoke: local production build Profile at 1280 and 390×844 rendered RTL; `scrollWidth == clientWidth == 390` at mobile size. Device/local facts remained visible while identity was unavailable.

## Independent review

- Independent high-reasoning review passed the hardened code/security/product behavior. Both metadata reconciliation reviews passed after corrections, and all seven GitHub/Vercel contexts succeeded on final PR head `f8563bdb4d42de8995eaef4d96f5f83b62f5d4d4` before merge.

## Risks and remaining work

- Runtime stays disabled. Activation needs separate owner-approved deployment/configuration decision and independent security/product review.
- Android identity remains deferred. No auth/session redesign or cross-account storage work is included.
