# LearnBox AI work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. `blocked` tasks are context, not authorization to
start. Historical tasks remain for traceability and must not be duplicated.

## Active work registry

- **LB-DS-015 / NI-008A native Preview host/config seam** is authorized and in activation review on branch `docs/activate-lb-ds-015`, based on `main` at `30673a2`. Scope is limited to Android INTERNET permission and immutable compile-time Preview build configuration with tests/docs. No endpoint, HTTP client, token/session composition, UI, provider, secret, flag activation, deployment, Preview request, Production or review-sync upload is authorized.

## LB-DS-015

- Status: ready
- Executor: high-reasoning-worker
- Base: main at `30673a2` (NI-008 design merged through PR #126)
- Branch: docs/activate-lb-ds-015
- Risk: security-sensitive-native-host-config
- Specification: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/mobile/android/app/src/main/AndroidManifest.xml; apps/mobile/lib/features/identity/mobile_preview_auth_config.dart; apps/mobile/test/android_network_permission_test.dart; apps/mobile/test/mobile_preview_auth_config_test.dart; apps/mobile/README.md; docs/architecture/OFFLINE_SYNC.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-015.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only NI-008A. Add Android INTERNET permission and immutable compile-time Preview origin/verification configuration. Defaults remain signed out/disabled; no endpoint, HTTP client, token/session composition, UI, provider, secret, deployment, Preview request, Production, background work or review-sync upload. Start with a failing test, stop at Draft PR for independent security review, and preserve all unrelated worktrees.

## LB-DS-014

- Status: ready
- Executor: high-reasoning-worker
- Base: main at `ffc403f` (S2 native audio QA evidence merged through PR #125)
- Branch: docs/lb-ds-014-native-preview-design
- Risk: security-sensitive-native-auth-activation-design
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md; docs/architecture/ADR/0011-native-mobile-session-and-transport.md; docs/operations/OTP_PROVIDER_ACTIVATION.md
- Allowed paths: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-014.md; CURRENT_WORK.md
- Required checks: pnpm test:dashboard; pnpm verify:ai-worker-queue; pnpm verify:ai-continuity; pnpm format:check; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner authorized autonomous planning for future native Preview verification. This task is design-only and must preserve all current fail-closed behavior. It must specify later implementation as serial slices: native host transport permission and compile-time Preview endpoint selection; disabled-by-default native OTP/session composition; owner-entered device verification; rollback flags to false; then a separate owner authorization before any review-sync upload. No code, permission, endpoint, deployment, secret, provider call, Preview, Production, real OTP message, background work, UI activation or NI-009+ implementation is allowed in LB-DS-014.

## LB-DS-013

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `8fe519b` (NI-007 activation PR #119 merged)
- Branch: worker/lb-ds-013-dormant-composition
- Risk: security-sensitive-mobile-composition
- Merge commit: `dc032d2` (PR #120 merged)
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-007 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/mobile/lib/main.dart; apps/mobile/lib/features/identity/mobile_auth_config.dart; apps/mobile/test/mobile_auth_composition_test.dart; apps/mobile/README.md; docs/architecture/OFFLINE_SYNC.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-013.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/main.dart apps/mobile/lib/features/identity/mobile_auth_config.dart apps/mobile/test/mobile_auth_composition_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_auth_composition_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner-authorized NI-007 implementation accepted through PR #120. Added explicit dormant composition using `MobileAuthConfig.defaults()`: both auth and review-sync defaults are false, production remains signed out and uses `DisabledReviewSyncTransport`. No network permission, endpoint activation, provider, UI-visible activation, background trigger, Preview, Production or NI-008+ work.

## LB-DS-012

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `24a7805` (NI-006 activation PR #116 merged)
- Branch: worker/lb-ds-012-native-adapters
- Risk: security-sensitive-mobile-credential-transport
- Merge commit: `92506e3` (PR #117 merged)
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-006 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/mobile/lib/features/identity/mobile_session.dart; apps/mobile/lib/features/identity/mobile_session_store.dart; apps/mobile/lib/features/identity/secure_mobile_session_store.dart; apps/mobile/lib/features/sync/http_review_sync_transport.dart; apps/mobile/test/mobile_session_test.dart; apps/mobile/test/secure_mobile_session_store_test.dart; apps/mobile/test/http_review_sync_transport_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-012.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/identity/mobile_session.dart apps/mobile/lib/features/identity/mobile_session_store.dart apps/mobile/lib/features/identity/secure_mobile_session_store.dart apps/mobile/lib/features/sync/http_review_sync_transport.dart apps/mobile/test/mobile_session_test.dart apps/mobile/test/secure_mobile_session_store_test.dart apps/mobile/test/http_review_sync_transport_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_session_test.dart test/secure_mobile_session_store_test.dart test/http_review_sync_transport_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner-authorized NI-006 implementation accepted through PR #117. Added dormant Flutter session/store and injected review transport adapters using existing secure storage. Transport enforces HTTPS or loopback HTTP, positive timeout, strict max-20 batch, typed failure and no credential logging. No new dependency, endpoint activation, native permission, composition, trigger, UI, flag enablement, provider/network activation, background sync, Preview, Production or NI-007+ work.

## LB-DS-011

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `0298810` (NI-005 activation PR #113 merged)
- Branch: worker/lb-ds-011-native-review-route
- Risk: security-sensitive-native-review-http
- Merge commit: `07a5f64` (PR #114 merged)
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-005 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/website/lib/mobile-review-http.ts; apps/website/lib/mobile-review-runtime.ts; apps/website/app/api/reviews/mobile/route.ts; apps/website/test/mobile-review-http.test.ts; apps/website/test/mobile-review-route.test.ts; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-011.md; CURRENT_WORK.md
- Required checks: pnpm --filter @learnbox/website exec vitest run test/mobile-review-http.test.ts test/mobile-review-route.test.ts; pnpm --filter @learnbox/website typecheck; pnpm --filter @learnbox/website build; pnpm verify:security; pnpm check; pnpm build; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner-authorized NI-005 implementation only: add a default-disabled authenticated mobile review route using the server-derived learner/session contract and exact max-20 request/ack schema. `MOBILE_REVIEW_SYNC_ENABLED` remains false. Preserve generic typed errors, strict JSON/content-type/body/schema validation, HTTPS outside bounded loopback, no browser cookies, no Origin/CORS/custom-header/installation-ID trust, and no client user ID. No Flutter/mobile code, dependency, flag enablement, provider, network activation, UI, background sync, Preview, Production or NI-006+ work. Start with failing direct tests, record exact output, mark review_requested and stop at Draft PR for supervisor high-reasoning security review.

## LB-DS-010

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `0ec9bb5` (PR #110 activation merged)
- Branch: worker/lb-ds-010-native-review-core
- Risk: security-sensitive-review-database-migration
- Merge commit: `3534cde` (PR #111 merged)
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-004 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: database/migrations/0013_native_review_transport.sql; apps/api/src/reviews/postgres-review-event.store.ts; apps/api/src/reviews/mobile-review-batch.service.ts; apps/api/test/native-review-migration.test.ts; apps/api/test/postgres-review-event.store.test.ts; apps/api/test/mobile-review-batch.service.test.ts; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-010.md; CURRENT_WORK.md
- Required checks: pnpm --filter @learnbox/api exec vitest run test/native-review-migration.test.ts test/postgres-review-event.store.test.ts test/mobile-review-batch.service.test.ts; pnpm --filter @learnbox/api typecheck; pnpm --filter @learnbox/api build; pnpm check; pnpm build; node scripts/validate-migrations.mjs
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner-authorized NI-004 implementation only: add migration 0013 for lossless text client-event IDs, learner-scoped uniqueness, immutable canonical content IDs, approved-content schedule bootstrap and server applied_at; implement learner-scoped PostgreSQL review persistence and max-20 batch service with payload equality, exact idempotent acknowledgements and generic typed failures. No HTTP route, mobile code, flag enablement, provider, network activation, UI, background sync, Preview, Production or NI-005+ work. Start with failing direct tests, record exact output, mark review_requested and stop at Draft PR for supervisor high-reasoning review.

## LB-DS-009

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `9c5a6ef` (authorization PR #106 merged)
- Branch: worker/lb-ds-009-mobile-auth-http
- Risk: security-sensitive-native-auth-http
- Merge commit: `d7695ee` (PR #107 merged)
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-003 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/website/lib/mobile-auth-http.ts; apps/website/lib/mobile-auth-runtime.ts; apps/website/app/api/auth/mobile/otp/request/route.ts; apps/website/app/api/auth/mobile/otp/verify/route.ts; apps/website/app/api/auth/mobile/session/refresh/route.ts; apps/website/app/api/auth/mobile/session/revoke/route.ts; apps/website/test/mobile-auth-http.test.ts; apps/website/test/mobile-auth-routes.test.ts; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-009.md; CURRENT_WORK.md
- Required checks: pnpm --filter @learnbox/website exec vitest run test/mobile-auth-http.test.ts test/mobile-auth-routes.test.ts; pnpm --filter @learnbox/website typecheck; pnpm --filter @learnbox/website build; pnpm check; pnpm build; node scripts/validate-migrations.mjs
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only the NI-003 default-disabled native auth HTTP boundary after failing direct tests.
Keep native OTP routes distinct from browser cookie routes: no cookie, no browser-Origin requirement,
no CORS/custom-header/installation-ID trust, strict JSON/body limits, HTTPS outside bounded loopback
development, generic errors and fail-closed `MOBILE_AUTH_ENABLED=false` runtime. Derive learner/session
only from the NI-001/NI-002 server contracts; never accept client user IDs or provider secrets. Add
refresh/revoke routes only behind the same disabled runtime. No review route, mobile code, dependency,
network activation, flag enablement, UI or Production work. Do not implement NI-004 or later. Record
exact output, mark `review_requested`, and stop at a Draft PR for supervisor high-reasoning security
review.

## LB-DS-008

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `9eccc59` (PR #102 merged)
- Branch: worker/lb-ds-008-mobile-identity-store
- Risk: security-sensitive-auth-database-migration
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-002 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: database/migrations/0012_mobile_learner_sessions.sql; apps/api/src/auth/postgres-mobile-identity.store.ts; apps/api/src/auth/postgres-otp-challenge.store.ts; apps/api/test/mobile-session-migration.test.ts; apps/api/test/postgres-mobile-identity.store.test.ts; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-008.md; CURRENT_WORK.md
- Required checks: pnpm --filter @learnbox/api exec vitest run test/mobile-session-migration.test.ts test/postgres-mobile-identity.store.test.ts; pnpm --filter @learnbox/api typecheck; pnpm --filter @learnbox/api build; pnpm check; pnpm build; node scripts/validate-migrations.mjs
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only the NI-002 atomic PostgreSQL identity/session persistence seam after failing direct
tests. Lock the OTP challenge row; normalize/hash-bind the submitted phone; verify and consume the
challenge; upsert `users.phone_e164`; and create/rotate/revoke only hash-stored mobile sessions in
one transaction. Add no HTTP route, environment read, provider call, network path, mobile code,
dependency, UI, flag or Production activation. Preserve generic failures, refresh-family reuse
revocation, session expiry/idle windows and the existing queue. Do not implement NI-003 or later.
Record exact migration/test output, mark `review_requested`, and stop at a Draft PR for supervisor
high-reasoning security review.

Accepted and merged through PR #104 at merge commit `f9f3c3b`. Supervisor review and all local/GitHub
checks passed. No HTTP route, network, provider, mobile composition, flag or NI-003+ work was enabled.
Keep NI-003 through NI-007 unauthorized.

## LB-DS-007

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `97bf8af` (PR #97 merged)
- Branch: worker/lb-ds-007-mobile-session-contract
- Risk: security-sensitive-pure-identity-contract
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md (NI-001 only); docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/api/src/auth/mobile-session.ts; apps/api/src/auth/mobile-identity.service.ts; apps/api/test/mobile-session.test.ts; apps/api/test/mobile-identity.service.test.ts; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-007.md; CURRENT_WORK.md
- Required checks: pnpm --filter @learnbox/api build; pnpm --filter @learnbox/api typecheck; pnpm --filter @learnbox/api exec vitest run test/mobile-session.test.ts test/mobile-identity.service.test.ts; pnpm check; pnpm build; node scripts/validate-migrations.mjs
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only the pure server identity/session contract with injected fake stores. Start with failing direct
tests. Lock the exact versioned access-token claims and 15-minute lifetime, server-derived learner/session
subjects, challenge-bound normalized-phone input to one atomic store call, generic verification failure,
opaque refresh rotation/reuse behavior and deterministic time/random dependencies. No HTTP route,
PostgreSQL adapter, migration, environment read, mobile code, secure-storage adapter, provider call,
network request, cookie, flag, UI or Production activation. Do not implement NI-002 or later work. Record
actual test output and routing evidence, mark `review_requested`, and stop at a Draft PR for independent
high-reasoning security review.

Accepted and merged through PR #100 at merge commit `02d846a`. Supervisor high-reasoning review corrected
weak-key acceptance, configurable token lifetime, future/extra claims, entropy length, malformed-input
validation and duplicate refresh rotation. No route, database, migration, network, flag, provider,
mobile composition or Production behavior was enabled. Keep NI-002 and later work unauthorized.

## LB-DS-006

- Status: accepted
- Executor: substantial-worker
- Base: main at `164270a` (PR #91 merged)
- Branch: worker/lb-ds-006-mobile-web-parity
- Risk: substantial-offline-mobile-presentation
- Specification: docs/superpowers/specs/2026-08-20-mobile-web-parity-expansion-design.md
- Allowed paths: apps/mobile/lib/app.dart; apps/mobile/lib/features/review/learner_home_shell.dart; apps/mobile/lib/features/review/today_screen.dart; apps/mobile/lib/features/review/words_screen.dart; apps/mobile/lib/features/review/progress_screen.dart; apps/mobile/lib/ui/learner_bottom_navigation.dart; apps/mobile/test/app_test.dart; apps/mobile/test/widget_test.dart; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/mobile_visual_parity_test.dart; apps/mobile/test/learner_bottom_navigation_test.dart; apps/mobile/test/support/mobile_test_app.dart; apps/mobile/README.md; docs/architecture/MOBILE_WEB_PARITY.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-006.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/app.dart apps/mobile/lib/features/review/learner_home_shell.dart apps/mobile/lib/features/review/today_screen.dart apps/mobile/lib/features/review/words_screen.dart apps/mobile/lib/features/review/progress_screen.dart apps/mobile/lib/ui/learner_bottom_navigation.dart apps/mobile/test/app_test.dart apps/mobile/test/widget_test.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/mobile_visual_parity_test.dart apps/mobile/test/learner_bottom_navigation_test.dart apps/mobile/test/support/mobile_test_app.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_visual_parity_test.dart test/mobile_learning_loop_test.dart test/learner_bottom_navigation_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; Android emulator visual smoke; physical Android visual smoke
- Simulator required: yes
- Draft PR required: yes
- Merge allowed: yes

Implement only the approved offline Today/Words/Progress shell from the linked design. Preserve the
same repository, queue and pronunciation-player instances; Words shows exactly the three canonical
cards and Progress reports only `ReviewQueue.pendingCount()` as device-local. Navigation changes
presentation only. Do not touch pronunciation implementation/native hosts, identity, sync,
network, storage internals, dependencies, assets, providers, flags, release settings, Bobo or any
unlisted path. Start with failing widget tests, work serially and stop at a Draft PR. Issue #92 is a
separate baseline secure-storage investigation and must not be fixed or masked in this task.

Accepted and merged through green-check PR #94 on 2026-08-22 after sequential Terra/DeepSeek
implementation, full local and GitHub gates, emulator and Xiaomi physical visual smoke, and
independent high-reasoning review. No dependency, storage, identity, network, provider, release or
production path was added. Do not reopen or duplicate this task.

## LB-DS-005

- Status: accepted
- Executor: substantial-worker
- Base: main at `c568702` (PR #87 merged)
- Branch: worker/lb-ds-005-mobile-offline-pronunciation
- Risk: substantial-native-offline-audio
- Specification: docs/superpowers/specs/2026-08-20-mobile-offline-pronunciation-design.md; GitHub issue #59
- Allowed paths: apps/mobile/lib/app.dart; apps/mobile/lib/main.dart; apps/mobile/lib/features/review/pronunciation_player.dart; apps/mobile/lib/features/review/review_screen.dart; apps/mobile/lib/features/review/today_screen.dart; apps/mobile/android/app/src/main/kotlin/com/learnbox/learnbox/MainActivity.kt; apps/mobile/ios/Runner/AppDelegate.swift; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/native_pronunciation_bridge_test.dart; apps/mobile/test/support/mobile_test_app.dart; apps/mobile/README.md; docs/architecture/MOBILE_PRONUNCIATION.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-005.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/app.dart apps/mobile/lib/main.dart apps/mobile/lib/features/review/pronunciation_player.dart apps/mobile/lib/features/review/review_screen.dart apps/mobile/lib/features/review/today_screen.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/native_pronunciation_bridge_test.dart apps/mobile/test/support/mobile_test_app.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/native_pronunciation_bridge_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; cd apps/mobile && flutter build ios --debug --no-codesign; Android emulator smoke; physical Android listening QA for all six approved V2 clips
- Simulator required: yes
- Draft PR required: yes
- Merge allowed: yes

The reviewed design merged through PR #87. Implement only the offline pronunciation slice for
the three canonical Start cards. Use the six existing V2 assets through `StartPackAudioAssets`, one
injected player contract and a fixed-allowlist native bridge. Add accessible Persian word and
revealed-sentence controls, no autoplay, calm failure and lifecycle cleanup while preserving every
grading invariant. Do not restore PR #58 or V1 media; do not change assets, `pubspec.yaml`,
dependencies, network, storage, sync, identity, providers, flags, release settings, Bobo or any
unlisted path. Start with failing direct tests. This is the only authorized implementation task;
keep the separate mobile web-parity expansion design blocked to avoid overlapping mobile edits.
The recorded build and device checks govern the future implementation PR, not this design-only PR.

Accepted and merged through green-check PR #90 on 2026-08-22 after independent high-reasoning
review, Android/iOS builds, emulator smoke and owner-confirmed physical Android listening QA for all
six approved V2 clips. No dependency, network, provider, release or production path was added. Do
not reopen or duplicate this task.

## LB-DS-004

- Status: accepted
- Executor: any-capable-coding-agent
- Base: main at `198abd0` (PR #82 merged)
- Branch: worker/lb-ds-004-start-pack-audio-resolver
- Risk: routine-offline-content-contract
- Specification: GitHub issue #59; `CURRENT_WORK.md` native-audio continuation gate
- Allowed paths: apps/mobile/lib/features/review/start_pack_audio_assets.dart; apps/mobile/test/start_pack_audio_assets_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-004.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/start_pack_audio_assets.dart apps/mobile/test/start_pack_audio_assets_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/start_pack_audio_assets_test.dart; cd apps/mobile && flutter test
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only a pure, offline `StartPackAudioAssets` resolver for the three canonical Start-card
IDs. It must return the exact already-approved V2 word and sentence asset paths for
`start-a1-haus`, `start-a1-tisch` and `start-a1-tuer`; it must return no mapping for an unknown
card ID. Keep the resolver independent of platform audio plugins and UI, with no `pubspec.yaml`,
dependency, asset, network, storage, sync, identity, provider, flag, release or Bobo change.
First add a failing unit test for the three exact mappings and the unknown-ID failure case, then
implement the smallest typed immutable API that makes it pass. Do not add a playback button or
player: physical `de-DE` listening QA and bundled asset provenance are already recorded, while
the native playback experience itself remains a separately reviewed follow-up. Record a standard
handoff report, mark the task `review_requested`, and stop at a Draft PR with actual check output.

Accepted and merged through green-check PR #84 on 2026-08-20 after independent high-reasoning
scope review. Standalone Codex was unavailable, so no Codex review is claimed. Do not reopen or
duplicate this task.

## LB-DS-001

- Status: accepted
- Executor: deepseek-flash
- Base: main-after-plan-merge
- Branch: worker/lb-ds-001-mobile-sync-contract-tests
- Risk: routine-after-security-plan
- Specification: docs/superpowers/specs/2026-08-13-mobile-sync-coordinator-design.md
- Allowed paths: apps/mobile/lib/features/sync/mobile_identity_state.dart; apps/mobile/lib/features/sync/review_sync_transport.dart; apps/mobile/lib/features/sync/review_sync_result.dart; apps/mobile/lib/features/sync/review_acknowledgement.dart; apps/mobile/test/review_sync_contract_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-001.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/sync apps/mobile/test/review_sync_contract_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/review_sync_contract_test.dart
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Completed and merged through PR #56 after required checks passed. It is retained as historical
context only; do not reopen or duplicate it.

## LB-DS-002

- Status: accepted
- Executor: deepseek-flash
- Base: main at `22ccc73` (PR #68 merged)
- Branch: worker/lb-ds-002-today-layout
- Risk: routine-layout-after-reviewed-theme
- Specification: docs/superpowers/specs/2026-08-16-mobile-visual-parity-design.md; docs/superpowers/plans/2026-08-16-mobile-visual-parity.md (Task 3 only)
- Allowed paths: apps/mobile/lib/features/review/today_screen.dart; apps/mobile/test/mobile_visual_parity_test.dart; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/app_test.dart; apps/mobile/test/widget_test.dart; apps/mobile/test/launch_experience_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-002.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/today_screen.dart apps/mobile/test/mobile_visual_parity_test.dart apps/mobile/test/mobile_learning_loop_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only the reviewed Today layout: retain the existing `FutureBuilder`, repository and queue
behavior; render the approved `encourage-v2` asset as excluded decorative semantics only when the
height permits it; add `LearnerBottomNavigation` with Today selected; and show the exact truthful
SnackBar `این بخش به‌زودی در اپ موبایل آماده می‌شود.` when Words or Progress is tapped. Do not
change `app.dart`, `pubspec.yaml`, `ui/`, Bobo assets, review screen, data models, audio, storage,
sync, flags, dependencies, server code or release settings. Create one failing widget test before
the layout change; preserve every existing learning-loop assertion. Record a standard handoff
report, mark the task `review_requested`, and stop at a Draft PR with all actual checks listed.

Completed and merged through PR #70 after independent Flutter, CI and scope review. It is retained
for traceability; do not reopen or duplicate it.

## LB-DS-003

- Status: accepted
- Executor: deepseek-flash
- Base: main at `04d6205` (PR #70 merged)
- Branch: worker/lb-ds-003-completion-screen
- Risk: routine-presentation-with-preserved-grading
- Specification: docs/superpowers/specs/2026-08-16-mobile-visual-parity-design.md; docs/superpowers/plans/2026-08-16-mobile-visual-parity.md (Task 4 completion slice only)
- Allowed paths: apps/mobile/lib/features/review/completion_screen.dart; apps/mobile/lib/features/review/review_screen.dart; apps/mobile/test/mobile_learning_loop_test.dart; apps/mobile/test/mobile_visual_parity_test.dart; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-003.md
- Required checks: dart format --output=none --set-exit-if-changed apps/mobile/lib/features/review/completion_screen.dart apps/mobile/lib/features/review/review_screen.dart apps/mobile/test/mobile_learning_loop_test.dart apps/mobile/test/mobile_visual_parity_test.dart; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart; cd apps/mobile && flutter test
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted through green-check PR #73 on 2026-08-17. The review fixed the synthetic duplicate-event
ID test defect and added end-to-end return-to-Today coverage; do not reopen or duplicate this task.

Implement only the daily-completion presentation slice. First write a failing widget test that
verifies the canonical `celebrate-v2` image exposes the semantic label `بوبو موفقیت تو را جشن
می‌گیرد`, the existing truthful pending-answer text remains visible, and `بازگشت به امروز` returns
to Today. Create `CompletionScreen({required int? pendingCount, required String? storageError,
required VoidCallback onReturnToToday})`, then replace only the completed branch in `ReviewScreen`
with it. The return callback must use `Navigator.of(context).popUntil((route) => route.isFirst)`.
The return action must be at least 56px high. Preserve every `_grade` branch, its exact single
`reviewQueue.record` call, pending-count/error behavior, queue state and existing grade-layout
behavior. Do not restyle the active review card, alter grade labels, add audio/navigation/sync/API
logic, change assets or fonts, add dependencies, or modify any other file. Record a standard
handoff report, mark the task `review_requested`, and stop at a Draft PR with actual check output.
