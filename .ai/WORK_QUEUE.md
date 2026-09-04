# LearnBox AI work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. `blocked` tasks are context, not authorization to
start. Historical tasks remain for traceability and must not be duplicated.

## Active work registry

- **M0 — Product truth and delivery reset:** accepted and merged in PR #146.
- **D0 — Visual language:** accepted and merged in PR #150. Contract: `docs/design/D0_VISUAL_LANGUAGE.md`.
- **D1 — Learner UI kit:** accepted and merged in PR #153. State board: `docs/design/D1_LEARNER_UI_KIT.md`.
- **M1 — Online Learning Core:** **slice-1 QA complete, milestone remains partial/not production-ready**. M1-B Web and M1-C Mobile Today slices are merged with truthful local-only boundaries; M1-D cursor slices (server-core, client capture/persistence, read-side exposure, per-event binding, request serialization and server request-boundary parsing) are merged, while route integration and network sync remain dormant; server wiring and full learning loop remain queued.
- **M1-A — Online learning contract audit:** accepted and merged in PR #151. Contract: `docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md`.
- **M1-D slice 1 — Learner state snapshot:** accepted and merged in PR #152. Implementation: `GET /api/learner/state`, fail-closed and not Web-wired yet.
- **M1-B server-wiring contract — Web learner state:** accepted design (ADR 0012). Web HttpOnly learner cookie → Next.js `GET /api/learner/state` route → server-side identity mapping → existing `LearnerStateService`/`repository` is approved; route implementation merged in PR #163 (LB-DS-022) behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime; Web session → `users.id` mapping is merged (PR #162); Start Pack seed/release remains a separate owner/review-gated decision.
- **M1-B slice 1 — Web Today truth label:** accepted and merged in PR #156; server wiring merged in LB-DS-022 (PR #163, merge commit `73cdb62`) behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime.
- **M1-B slice 2 — Web learner-state read route + truthful Today fetch:** accepted and merged in PR #163 at merge commit `73cdb62`; server-backed figures only after a successful cookie-authenticated read; Today figure stays local until the approved/published Start Pack seed/catalog rows are implemented and released; Start Pack ↔ canonical `contentId` contract is recorded in ADR 0013 (bundled IDs are canonical immutable `cards.content_id`; clients send `contentId`, server resolves `cards.id`); seed/catalog/reconciliation remain separate review-gated tasks.
- **M1-C slice 1 — Mobile Today states:** accepted and merged in PR #155; local queue chip is truthful, sync coordinator remains dormant.
- **M1-Q — Independent QA:** accepted and merged in PR #157; current server-wired follow-up QA accepted and merged in PR #175; report: `.ai/qa-reports/M1-Q3-CURRENT-WEB-SERVER-WIRED.md`. Functional checks are green; browser visual/AX/keyboard acceptance remains blocked and explicitly unclaimed.
- **M2 content-review safety gate:** accepted and merged in PR #177 at merge commit `ae54cee`; approval now requires all six `content_review_checks` dimensions to be `passed`; no publication or provider activation was included. Admin preview queue overview is accepted and merged in PR #181 at `a86c973`; authenticated persistence and reviewer actions remain gated.
- **M2 Admin identity boundary:** ADR 0015 records that `admin_sessions.owner_singleton_id` cannot substitute for canonical `users.id`; migration `0016` adds the approved nullable unique `admin_owner.user_id → users(id)` binding, session lookup returns it fail-closed, and the one-shot server-side binding operation is implemented. Owner bootstrap, role assignment and staging verification remain gated before server-backed review reads/writes.
- **Next:** M1-D push reconciliation cursor/watermark **policy** is approved in ADR 0014
  (per-learner monotonic version, incremented only on newly applied events, same transaction
  as event+schedule); the server-core implementation merged in PR #169 and the client-side
  cursor capture/persistence merged in PR #170; the read-side cursor exposure in
  `GET /api/learner/state` **merged** in PR #171 (LB-DS-024, merge commit `0057419`) and the
  per-event cursor binding **merged** in PR #172 (LB-DS-025, merge commit `caa3a39`); request serialization and server request-boundary parsing are merged; route/client flag enablement remain
  separate serial, review-gated M1-D queue tasks; client transport serialization now accepts and sends the stored valid decimal-string cursor without enabling production sync; server request-boundary parsing is covered by `apps/api/src/reviews/mobile-review-batch.request.ts` and its strict tests, while route integration remains
  snapshot-only (no delta endpoint exists), so wire-contract/delta-endpoint work remains a
  separate review-gated task; the dormant review POST route request-boundary parser
  integration is implemented locally in Slice 1d (`feature/m1d-route-integration`, base
  `d20b46a`, unmerged; report `.ai/worker-reports/LB-DS-M1D-ROUTE-INTEGRATION.md`, appendix
  Slice 1d in `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md`); seed/catalog implementation remains a
  separate owner/review-gated task; independent functional QA of the merged server-wired slice is accepted in PR #175;
  browser visual/AX/keyboard acceptance remains blocked by the Chrome permission dialog.

### Active grouped workstreams

| ID   | Workstream                         | Worker role                | Allowed scope                                                 | Depends on                 | Parallel rule                                                                                |
| ---- | ---------------------------------- | -------------------------- | ------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| D0   | Visual language and token contract | W1 + design-capable worker | `docs/design/**`, shared visual token docs, design evidence   | M0                         | Can run alongside M1 contract audit; no overlapping implementation paths                     |
| D1   | Learner UI kit and state boards    | design-capable worker + W8 | `docs/design/**`, UI acceptance/spec artifacts                | D0                         | Can run alongside backend contract audit; implementation waits for affected surface approval |
| M1-A | Online learning contract audit     | W1 + W6                    | API/domain/schema docs and tests only                         | M0                         | Can overlap D0/D1; no mobile/Web surface edits                                               |
| M1-B | Web learning core                  | W2                         | learner Web components/routes/tests                           | M1-A + relevant D1 surface | Must not edit API, mobile, Admin or design token paths                                       |
| M1-C | Mobile learning core               | W3                         | Flutter learner screens/tests/assets                          | M1-A + relevant D1 surface | Must not edit Web, API or Admin paths                                                        |
| M1-D | Sync and persistence               | W6                         | API, persistence, migrations, sync tests                      | M1-A                       | Serial for migrations/auth; separate worktree required                                       |
| M1-Q | Independent product QA             | W8                         | QA evidence, screenshots, accessibility and acceptance review | D1 + M1 deliverables       | Cannot approve its own implementation                                                        |

### Start conditions

- [x] D0 contract is reviewed and linked from `docs/design/DESIGN_STATUS.md`.
- [x] D1 surface/state boards exist for learner screens entering implementation.
- [x] M1-A records API/domain contracts and conflict/idempotency rules.
- [x] M1-B Web and M1-C Mobile have separate worktrees and disjoint allowed paths.
- [x] M1-Q independent QA evidence is complete (`.ai/qa-reports/M1-Q-INDEPENDENT-QA.md`).
- [x] Safety boundary remains: no production, payment, provider credential, real OTP or server activation is implied by this queue.

The historical LB-DS and NI records below remain for traceability. They are not authorization to duplicate or reopen completed work.

## LB-DS-025

- Status: accepted
- Executor: subagent (W6, server persistence)
- Base: main at `0057419` (PR #171 merged)
- Branch: worker/m1d-event-cursor
- Merge commit: `caa3a39` (PR #172 merged 2026-08-31)
- Risk: routine-offline-sync-persistence-boundary
- Specification: docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md; docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md (appendix Slice 1b/1c)
- Allowed paths: database/migrations/0015_event_reconciliation_cursor.sql; apps/api/src/reviews/postgres-review-event.store.ts; apps/api/test/postgres-review-event.store.test.ts; apps/api/test/event-reconciliation-cursor-migration.test.ts; CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-025.md
- Required checks: focused API review-event store + migration tests; full API tests; API typecheck; pnpm check; node scripts/validate-migrations.mjs; pnpm format:check; pnpm verify:ai-worker-queue; pnpm verify:documentation-governance; pnpm verify:ai-continuity; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged through PR #172 at merge commit `caa3a39` on 2026-08-31.
Per-event cursor binding only (ADR 0014). Additive migration 0015 adds nullable
`review_events.reconciliation_cursor BIGINT` with a non-negative check and an
index on `(user_id, reconciliation_cursor)` for learner+cursor reads; legacy
rows are NOT backfilled (NULL means "applied before 0015"). After the atomic
cursor advance, `PostgresReviewEventStore.writeAtomically` records the
returned cursor on the newly claimed event in the same transaction and returns
that exact event cursor. Idempotent replay returns the cursor stored on that
event (`COALESCE(e.reconciliation_cursor, 0)`, never the current learner
cursor); conflicts/retries/missing-schedule never bump the cursor and never
rebind the event. No route, flag, auth, mobile or request-shape change;
sync stays dormant. Sending the stored cursor in a request and route/client
flag enablement remain separate serial, review-gated M1-D queue tasks.
Do not reopen or duplicate this task.

## LB-DS-024

- Status: accepted
- Executor: subagent (W6, server read-side)
- Base: main at `246779d` (PR #170 merged)
- Branch: worker/m1d-cursor-read
- Merge commit: `0057419` (PR #171 merged 2026-08-31)
- Risk: routine-offline-sync-read-boundary
- Specification: docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md; docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md (appendix Slice 1b/1c)
- Allowed paths: apps/api/src/learner-state/**; apps/api/test/learner-state*.test.ts; apps/api/test/postgres-learner-state.repository.test.ts; apps/website/lib/learner-state-web-http.ts; apps/website/lib/learner-state-web-client.ts; apps/website/test/learner-state-web-http.test.ts; apps/website/test/learner-state-web-client.test.ts; apps/website/test/learner-today-server-states.test.tsx; CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-024.md
- Required checks: focused API learner-state tests; focused Website learner-state tests; API/Website typecheck; pnpm check; node scripts/validate-migrations.mjs; pnpm format:check; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged through PR #171 at merge commit `0057419` on 2026-08-31.
Read-side reconciliation cursor exposure only (ADR 0014). `LearnerStateSnapshot`
gains the authoritative per-learner `reconciliationCursor` decimal string;
`LearnerStateRepository.readReconciliationCursor` reads
`learner_reconciliation_cursors` via a parameterized `$1` user-scoped query with
`cursor::text`, defaulting to `'0'` when no row exists; the snapshot is
serialized in both the API Bearer route and the Web cookie route
(`GET /api/learner/state`), and the Web client strictly parses the cursor as a
non-negative decimal string (never a JS number). No request sends a cursor, no
network sync is activated, flags/defaults are untouched, and mobile/auth/
main.dart/migrations/seed/production are not modified. Sending the stored
cursor in a request and route/client flag enablement remain separate serial,
review-gated M1-D queue tasks. Do not reopen or duplicate this task.

## LB-DS-023

- Status: accepted
- Executor: mobile-worker (W3)
- Base: main at `9ff7c99` (PR #169, server-core reconciliation cursor merged)
- Branch: worker/m1d-client-cursor-slice
- Merge commit: `246779d` (PR #170 merged 2026-08-30)
- Risk: routine-offline-mobile-sync-boundary
- Specification: docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md; docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md (appendix Slice 1c)
- Allowed paths: apps/mobile/lib/features/sync/**; apps/mobile/test/** sync-related tests; docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md; CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-023.md
- Required checks: flutter pub get (offline if possible); dart format --output=none --set-exit-if-changed; flutter analyze; focused sync tests; flutter test; git diff --check
- Simulator required: no
- Draft PR required: no
- Merge allowed: yes

Accepted and merged through PR #170 at merge commit `246779d` on
2026-08-30. No request cursor or network sync activation: this record closes
the stale `review_requested` state truthfully from live GitHub evidence;
no code, test, schema, flag or product behavior was modified.

Client-side cursor capture/persistence for the existing dormant foreground sync
boundary (ADR 0014). `ReviewUploadResponse` gains an optional decimal-string
`reconciliationCursor`; `HttpReviewSyncTransport` strictly parses the existing
single-key `{ "outcomes": [...] }` response (acknowledged outcomes must carry a
non-empty exact `clientEventId` and a valid non-negative decimal-string cursor;
malformed acknowledged cursor or response is retryable with no acknowledgements;
non-acknowledged outcomes stay non-acknowledged; request keeps exactly one
`items` key and sends no cursor). New injected `ReconciliationCursorStore` seam
(fail-closed invalid stored cursor; write only after exact acknowledgement
validation and successful queue acknowledgement). `ReviewSyncCoordinator` reads
the prior cursor, persists the response cursor only after exact ack validation
and a successful queue acknowledge; a cursor alone never removes queue entries;
no-ack means no cursor write; in-flight serialization unchanged.
`ReviewSyncResult.Synchronized` carries the persisted cursor (decimal string,
null when absent) and never claims server sync beyond exact acknowledgements.
Cursor write failure returns retryable failure and never reports Synchronized;
queue acknowledgement is durable first, so no acknowledged event is lost
(documented and tested). No API/server/schema/route/auth/main.dart/UI/flag
change; production sync remains disabled and no request carries a cursor yet.
Do not reopen or duplicate this task.

## LB-DS-022

- Status: accepted
- Executor: web-worker (W2)
- Base: main at `5616d0d` (PR #162 merged; cookie subject = canonical users.id)
- Branch: worker/m1b-web-learner-state-read (removed after merge)
- Merge commit: `73cdb62` (PR #163 merged 2026-08-30)
- Fix head: branch head after review-finding fixes
- Risk: security-sensitive-web-learner-session-boundary
- Specification: docs/architecture/ADR/0012-web-learner-state-server-wiring.md; docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md §9/§12
- Allowed paths: apps/website/app/api/learner/state/route.ts; apps/website/lib/learner-state-web-http.ts; apps/website/lib/learner-state-web-runtime.ts; apps/website/lib/learner-state-web-client.ts; apps/website/app/components/TodayScreen.tsx; apps/website/app/LearnerHome.tsx; apps/website/app/learner-sync-state.ts; apps/website/test/learner-state-web-route.test.ts; apps/website/test/learner-state-web-http.test.ts; apps/website/test/learner-state-web-client.test.ts; apps/website/test/learner-today-server-states.test.tsx; apps/website/README-M1B-WEB-SLICE1.md; .env.example; docs/architecture/ADR/0012-web-learner-state-server-wiring.md; docs/PRODUCT_STATUS.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-022.md; CURRENT_WORK.md
- Required checks: focused website learner-state tests; full website tests; website typecheck; website build; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged through PR #163 at merge commit `73cdb62` on 2026-08-30. ADR 0012
Web learner-state read implemented: `GET /api/learner/state` Next.js route reusing the
existing API `LearnerStateService`/`PostgresLearnerStateRepository` via the `api/dist`
mount pattern and verified-TLS pool; identity only from the signed Web learner cookie
(`readLearnerSession`, subject = canonical `users.id`); fail-closed 503 `serverUnavailable`
unless `WEB_LEARNER_STATE_ENABLED=true` plus complete `DATABASE_URL` and
`LEARNBOX_SESSION_SECRET`; 401 `invalidToken` on cookie miss/invalid; 400 `validation` on
non-GET or insecure transport; all responses `no-store`. Today fetches the route only in
`server-otp` mode after authentication, treats the snapshot as server-backed only after a
successful fetch/parse, keeps the local pending-sync chip and truthful loading/error/offline
fallbacks, and never claims server acknowledgement. No Start Pack ↔ canonical `contentId`
join was invented; server `contentId` is authoritative and the local review path is unchanged.
No migrations, schema, seed, catalog, mobile, API source contract, payment, deployment,
secret, OTP delivery, push reconciliation or auth activation work was merged.
Remaining: Start Pack ↔ canonical `contentId` contract is recorded in ADR 0013;
seed/catalog implementation and release remain separate owner/review-gated tasks;
push-reconciliation cursor/watermark remains blocked pending policy
approval; independent acceptance/visual/accessibility QA of the merged server-wired slice
remains pending. Do not reopen or duplicate this task.

## LB-DS-020

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `8667cab`
- Merge commit: `4eca7dd` (PR #142 merged)
- Branch: worker/lb-ds-020-preview-auth-runtime
- Risk: security-sensitive-mobile-auth-runtime
- Specification: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md
- Allowed paths: apps/mobile/lib/main.dart; apps/mobile/lib/features/identity/mobile_preview_auth_runtime.dart; apps/mobile/lib/features/identity/mobile_auth_http_transport.dart; apps/mobile/lib/features/identity/mobile_installation_id_store.dart; apps/mobile/lib/features/identity/secure_mobile_session_store.dart; apps/mobile/test/mobile_preview_auth_runtime_test.dart; apps/mobile/test/mobile_auth_http_transport_test.dart; apps/mobile/test/mobile_installation_id_store_test.dart; apps/mobile/README.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-020.md; CURRENT_WORK.md
- Required checks: focused tests; full Flutter tests; Flutter analyze; debug APK; pnpm check; pnpm build; migration validation; diff check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only fail-closed runtime composition for the owner-controlled native Preview verification. Production/default builds must remain unchanged; no review sync, background work, analytics, Production origin, secret or provider credential may reach the client. Use exact compile-time Preview origin validation, HTTPS-only injected transport, secure installation ID and existing secure session store. The Preview server flags remain unchanged until a separately verified build is ready. Start with failing tests and stop at Draft PR for review.

## LB-DS-019

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `8ff6384` (LB-DS-018 merged and registry clean)
- Merge commit: `1a96e61` (PR #140 merged)
- Branch: worker/lb-ds-019-dormant-auth-composition
- Risk: security-sensitive-mobile-composition
- Specification: docs/superpowers/specs/2026-08-26-native-auth-ui-design-brief.md; apps/mobile/lib/features/identity/mobile_auth_config.dart
- Allowed paths: apps/mobile/lib/app.dart; apps/mobile/lib/main.dart; apps/mobile/lib/features/identity/mobile_auth_config.dart; apps/mobile/lib/features/identity/mobile_auth_screen.dart; apps/mobile/test/mobile_auth_composition_test.dart; apps/mobile/test/mobile_auth_screen_test.dart; apps/mobile/README.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-019.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_auth_composition_test.dart test/mobile_auth_screen_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only dormant composition of the already-reviewed native auth UI. The default `MobileAuthConfig.defaults()` must remain auth-disabled, signed-out, and review-sync-disabled. Inject an optional auth surface/builder without creating a provider, endpoint, secret, real OTP, background trigger, analytics, sync upload, Preview or Production path. Start with failing composition tests. `main.dart` must remain default-safe and must not activate the surface.

## LB-DS-018

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `e284169` (NI-008B and registry synchronization merged)
- Merge commit: `60e3046` (PR #137 merged)
- Branch: worker/lb-ds-018-native-auth-ui-clean
- Risk: critical-mobile-ui-ux
- Specification: docs/superpowers/specs/2026-08-26-native-auth-ui-design-brief.md; apps/mobile/lib/features/identity/mobile_auth_client.dart
- Allowed paths: apps/mobile/lib/features/identity/mobile_auth_screen.dart; apps/mobile/test/mobile_auth_screen_test.dart; apps/mobile/README.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-018.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test test/mobile_auth_screen_test.dart; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement the dormant Persian-first native auth UI surface only: phone entry and OTP entry, injected `MobileAuthClient`, explicit initial/focused/valid/requesting/invalid/expired/rate-limited/offline/server-error/verified/back states, RTL accessibility, LTR isolation for phone/OTP, minimum 44dp controls, keyboard-safe responsive layout and no secret/token display. Start with failing widget tests. Keep `main.dart` and production composition untouched; no direct network, provider, flag, Preview, Production, background, analytics, review-sync or real OTP work. UI must remain unreachable in default builds until a separate composition task.

## LB-DS-017

- Status: blocked
- Executor: high-reasoning design review, then dedicated UI worker
- Base: main at `d6bacdf`
- Branch: `docs/lb-ds-017-native-auth-ui-brief`
- Risk: critical-mobile-ui-ux
- Specification: `docs/superpowers/specs/2026-08-26-native-auth-ui-design-brief.md`
- Allowed paths: `docs/superpowers/specs/2026-08-26-native-auth-ui-design-brief.md`; `CURRENT_WORK.md`
- Required checks: `pnpm test:dashboard`; `pnpm verify:ai-worker-queue`; `pnpm verify:ai-continuity`; `pnpm format:check`; `git diff --check`
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Future implementation paths require a new queue record and must not overlap NI-008B identity client work.
- Required design review: web/mobile visual parity, RTL/accessibility, 320/360/412dp responsive behavior, all auth states, default-disabled reachability.
- Blockers: NI-008B merge, explicit UI implementation authorization, and separate approval before `main.dart` composition.

## LB-DS-016

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `fd141cc` (NI-008B merged through PR #131)
- Branch: worker/lb-ds-016-native-auth-client (removed after merge)
- Risk: security-sensitive-native-auth-client
- Merge commit: `fb30400` (PR #131 merged)
- Specification: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md; docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/mobile/lib/features/identity/mobile_auth_http_client.dart; apps/mobile/lib/features/identity/mobile_auth_client.dart; apps/mobile/test/mobile_auth_http_client_test.dart; apps/mobile/test/mobile_auth_client_test.dart; apps/mobile/README.md; docs/architecture/OFFLINE_SYNC.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-016.md; CURRENT_WORK.md
- Required checks: all passed locally and on GitHub; focused native auth tests `23/23`, full Flutter tests `117`, analyzer, format, pnpm build, migrations and debug APK validation passed.
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implemented and merged through PR #131. The dormant provider-neutral native auth client provides strict injected request/verify/refresh/revoke transport, typed errors, bounded timeout and injected secure-session persistence. No UI, endpoint activation, real OTP, provider call, secret, deployment, Preview execution, Production, background work or review-sync upload was enabled.

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
