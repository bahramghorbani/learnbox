# LearnBox AI work queue

Read `.ai/WORKER_PROTOCOL.md` before this file. `blocked` tasks are context, not authorization to
start. Historical tasks remain for traceability and must not be duplicated.

## Active work registry

- **M0 — Product truth and delivery reset:** accepted and merged in PR #146.
- **D0 — Visual language:** accepted and merged in PR #150. Contract: `docs/design/D0_VISUAL_LANGUAGE.md`.
- **D1 — Learner UI kit:** accepted and merged in PR #153. State board: `docs/design/D1_LEARNER_UI_KIT.md`.
- **M1 — Online Learning Core:** **slice-1 QA complete, milestone remains partial/not production-ready**. M1-B Web and M1-C Mobile Today slices are merged with truthful local-only boundaries; M1-D cursor slices (server-core, client capture/persistence, read-side exposure, per-event binding, request serialization and server request-boundary parsing) and the dormant route request-boundary integration (Slice 1d, PR #192 at `9c6c5e0`) are merged, while network sync remains dormant; server wiring and full learning loop remain queued.
- **M1-A — Online learning contract audit:** accepted and merged in PR #151. Contract: `docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md`.
- **M1-D slice 1 — Learner state snapshot:** accepted and merged in PR #152. Implementation: `GET /api/learner/state`, fail-closed and not Web-wired yet.
- **M1-B server-wiring contract — Web learner state:** accepted design (ADR 0012). Web HttpOnly learner cookie → Next.js `GET /api/learner/state` route → server-side identity mapping → existing `LearnerStateService`/`repository` is approved; route implementation merged in PR #163 (LB-DS-022) behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime; Web session → `users.id` mapping is merged (PR #162); Start Pack seed/release remains a separate owner/review-gated decision.
- **M1-B slice 1 — Web Today truth label:** accepted and merged in PR #156; server wiring merged in LB-DS-022 (PR #163, merge commit `73cdb62`) behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime.
- **M1-B slice 2 — Web learner-state read route + truthful Today fetch:** accepted and merged in PR #163 at merge commit `73cdb62`; server-backed figures only after a successful cookie-authenticated read; Today figure stays local until the approved/published Start Pack seed/catalog rows are implemented and released; Start Pack ↔ canonical `contentId` contract is recorded in ADR 0013 (bundled IDs are canonical immutable `cards.content_id`; clients send `contentId`, server resolves `cards.id`); seed/catalog/reconciliation remain separate review-gated tasks.
- **M1-C slice 1 — Mobile Today states:** accepted and merged in PR #155; local queue chip is truthful, sync coordinator remains dormant.
- **M1-Q — Independent QA:** accepted and merged in PR #157; current server-wired follow-up QA accepted and merged in PR #175; report: `.ai/qa-reports/M1-Q3-CURRENT-WEB-SERVER-WIRED.md`. Functional checks are green; browser visual/AX/keyboard acceptance is not claimed — it can be verified only against a staging deployment running the current merged build (staging is not confirmed current; the Chrome permission dialog blocker also remains).
- **M2 content-review safety gate:** accepted and merged in PR #177 at merge commit `ae54cee`; approval requires all six `content_review_checks` dimensions to be `passed`. PDR-008 now authorizes LB-DS-049 to ingest all 35 drafts as non-learner-visible `needs_review` candidates and add default-off authenticated Admin queue/check/decision persistence. Publication, migration execution and runtime activation remain separate gates.
- **M2 Admin identity boundary:** ADR 0015 records that `admin_sessions.owner_singleton_id` cannot substitute for canonical `users.id`; migration `0016` adds the approved nullable unique `admin_owner.user_id → users(id)` binding, session lookup returns it fail-closed, and the one-shot server-side binding operation is implemented; the binding slices are merged (PRs #187–#188). Owner bootstrap, canonical-user binding, one `super_admin` role assignment and Passkey sign-in are now verified on isolated staging; bootstrap is disabled and its secret removed. Server-backed Admin content reads/writes remain a separate gated implementation/activation slice.
- **Starter Catalog 35 slice (LB-DS-STARTER-CATALOG-35):** accepted and merged in PR #193 at merge commit `73adc02` (2026-09-04) per ADR 0016. Adds the reusable seed gate `apps/api/src/catalog/start-catalog-seed-gate.ts`, its tests, and the derived snapshot `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`. The separately authorized missing-drafts task merged in PR #200 at `2aa5931`; the snapshot now records 35/35 drafted, 35 linguistically reviewed, 0 release-approved, `seedable: false`, `publicationBlocked: true`. PDR-008 authorizes only `needs_review` candidate ingestion and Admin persistence; learner catalog seeding and publication remain blocked.
- **Next:** M1-D push reconciliation cursor/watermark **policy** is approved in ADR 0014
  (per-learner monotonic version, incremented only on newly applied events, same transaction
  as event+schedule); the server-core implementation merged in PR #169 and the client-side
  cursor capture/persistence merged in PR #170; the read-side cursor exposure in
  `GET /api/learner/state` **merged** in PR #171 (LB-DS-024, merge commit `0057419`) and the
  per-event cursor binding **merged** in PR #172 (LB-DS-025, merge commit `caa3a39`); request serialization and server request-boundary parsing are merged; route/client flag enablement remain
  separate serial, review-gated M1-D queue tasks; client transport serialization now accepts and sends the stored valid decimal-string cursor without enabling production sync; the dormant review POST route request-boundary parser integration (Slice 1d) is merged in PR #192 at merge commit `9c6c5e0` (report `.ai/worker-reports/LB-DS-M1D-ROUTE-INTEGRATION.md`, appendix Slice 1d in `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md`); network sync remains dormant — the documented wire contract is snapshot-only (no delta endpoint exists), so flag enablement and wire-contract/delta-endpoint work remain separate review-gated M1-D queue tasks; seed/catalog implementation remains a
  separate owner/review-gated task; independent functional QA of the merged server-wired slice is accepted in PR #175;
  browser visual/AX/keyboard acceptance is not claimed — it can be verified only against a staging deployment running the current merged build (staging is not confirmed current; the Chrome permission dialog blocker also remains).

### Active grouped workstreams

## LB-DS-026

- Status: accepted
- Executor: subagent (W6, design-only sync contract)
- Base: main at `4718f93` (PR #204 merged)
- Branch: docs/m1d-wire-contract-design
- Head commit: `b372f03`; merge commit: `a6b50b6` (PR #205 merged)
- Risk: security-sensitive-sync-wire-contract
- Specification: docs/architecture/M1D_SYNC_WIRE_CONTRACT.md; docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md; docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md; docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md
- Allowed paths: docs/architecture/M1D_SYNC_WIRE_CONTRACT.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-026.md; CURRENT_WORK.md
- Required checks: markdown/prettier; pnpm verify:ai-worker-queue; pnpm verify:documentation-governance; pnpm verify:ai-continuity; pnpm test:dashboard; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged through PR #205 at merge commit `a6b50b6`. Decision-ready proposed contract only. No reconciliation endpoint exists yet; no code, route, migration, flag, auth, mobile/web composition, sync activation, seed, deployment or production change is authorized. The design records a recommended pull-based GET contract, explicit cursor/idempotency/no-data-loss invariants, and open owner decisions O-1 through O-5. A separate serial implementation task and security/API review are required before any route or flag enablement.

## LB-DS-029

- Status: accepted
- Executor: serial implementation worker (M1-D reconciliation read)
- Base: main at `3647814` (O-1/O-2 decisions merged in PR #208)
- Branch: feature/m1d-reconciliation-read-direct
- Head commit: `95e6c13`; merged by PR #209 at `14ccaee`
- Risk: security-sensitive-sync-read
- Specification: docs/architecture/M1D_SYNC_WIRE_CONTRACT.md; docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md
- Allowed paths: apps/api/src/reviews/postgres-review-event.store.ts; apps/api/test/postgres-review-event.store.test.ts; apps/website/lib/mobile-review-http.ts; apps/website/test/mobile-review-http.test.ts; apps/website/app/api/reviews/mobile/reconciliation/route.ts; apps/website/lib/mobile-review-runtime.ts; apps/website/test/mobile-review-route.test.ts; CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-029.md
- Required checks: focused API/Website tests; API and Website typecheck/build; prettier; documentation governance; continuity; dashboard; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged in PR #209 at `14ccaee`. The read-only reconciliation GET exists but remains fail-closed behind the unchanged disabled `MOBILE_REVIEW_SYNC_ENABLED` boundary. No flag enablement, migration, auth redesign, mobile composition, client sync activation, production route activation, deployment or production change is included. Independent API/security review and a separate activation/composition decision remain required.

## LB-DS-030

- Status: accepted
- Executor: supervisor (Admin authenticated-preview truthfulness)
- Base: `origin/main` at `d81f7b5`
- Branch: `fix/admin-authenticated-preview-truth`
- Risk: low-risk-truthful-admin-ui
- Specification: ADR 0015; ADR 0016; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/admin/app/components/AdminAuthGate.tsx`; `apps/admin/app/components/ContentReviewWorkspace.tsx`; `apps/admin/test/admin-auth-ui.test.tsx`; `apps/admin/test/content-review-workspace.test.tsx`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-030.md`
- Required checks: focused Admin auth/workspace tests; full Admin tests; Admin typecheck/build; format; queue/documentation/continuity/dashboard validators; `git diff --check`
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged in PR #213 at merge commit `14eb8ef`. The authenticated workspace label and complete 35-draft queue are merged; publication, review persistence, schema, migrations, content approvals, seed and Production remain unchanged. Staging cutover exposed a separate fail-closed Docker build-contract blocker and was stopped before the running service changed.

## LB-DS-031

- Status: accepted
- Executor: supervisor (Admin Passkey Docker build contract)
- Base: `origin/main` at `14eb8ef`
- Branch: `fix/admin-passkey-build-contract`
- Head commit: `2d5eb546db0b9a16a70587d3385d4c41228586da`; merge commit: `254276e0ed314f5a20a5d030a11c2f56bdb28560` (PR #214)
- Risk: security-sensitive-deployment-contract
- Specification: ADR 0015; `infrastructure/production/admin/Dockerfile`; `infrastructure/production/admin/compose.yaml`
- Allowed paths: `infrastructure/production/admin/Dockerfile`; `infrastructure/production/admin/compose.yaml`; `apps/admin/test/deployment-contract.test.ts`; `docs/operations/ADMIN_PASSKEY_ACTIVATION.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-031.md`
- Required checks: focused/full Admin tests; Admin typecheck/build; Docker build with the public flag; isolated candidate probe; compose config; format; queue/documentation/continuity/dashboard validators; `git diff --check`
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Accepted and merged in PR #214 at `254276e`; the same merged source was built with the true public flag, verified in an isolated server candidate (`login_ui=true`, `workspace_ui=false`, root `200`, anonymous session `401`, bootstrap `404`) and deployed only to Admin staging. The running container is healthy and public checks stabilized at the same `200`/`401`/`404` contract after Caddy marked the recreated host healthy. The previous image remains available for rollback. Only the non-secret public boolean enters Docker build args; token keys, bootstrap secrets and all other credentials remain runtime-only. Production, seed, publication and data are unchanged.

## LB-DS-032

- Status: accepted
- Executor: supervisor (Web Words truthfulness)
- Base: `origin/main` at `900f43a`
- Branch: `fix/web-words-truth`
- Head commit: `f1794abead1aec93ffffffd5a7854a516e3d55ed`
- Merge commit: `66e449d8b8487596ccd2ea83bfa15520939e9481` (PR #217)
- Risk: routine-web-ui-truth
- Specification: D1 learner UI kit; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/app/globals.css`; `apps/website/test/learner-core-flows.test.tsx`; `apps/website/test/screens.test.tsx`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-032.md`
- Required checks: focused/full Website tests; Website typecheck/build; format; queue/documentation/continuity/dashboard validators; `git diff --check`; browser RTL/accessibility smoke if the local build is available
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Separate the three canonical Start words from device-local personal additions. Canonical words must not consume the personal-word quota; duplicate detection must still cover both groups; fabricated static mastery percentages must be removed; search and empty results must remain accessible and truthful. Use only existing device-local facts. No API, server snapshot, auth, database, migration, seed, content, payment, deployment, publication or Production change.

Implementation is complete and locally verified: canonical and personal rows are separate, the
30-word quota uses personal entries only, canonical duplicates remain blocked, static mastery
percentages are gone and a no-result search exposes a semantic status. Focused flow tests pass
9/9; the full Website suite passes 224/224 across 35 files; Website typecheck/build, formatting,
queue/documentation/continuity/dashboard validators and `git diff --check` pass. Browser smoke at
390×844 and 1440×900 confirmed RTL, no horizontal overflow, three official rows, zero fabricated
rings and the truthful search-empty status. No server or release boundary changed.

Accepted and merged in PR #217 at `66e449d` after all seven GitHub checks passed. The merge changed
only the scoped Website Words UI/test paths and canonical documentation; API, auth, database,
migration, seed, content, payment, deployment, publication and Production remained unchanged.

## LB-DS-033

- Status: accepted
- Executor: supervisor (GPT-5.6 Sol security/contract review and hardening)
- Base: `origin/main` at `fd81158`
- Branch: `review/m1d-reconciliation-read-security`
- Head commit: `b719235c5277f4d502eea68f69acc7eb59667e50`
- Merge commit: `82afe3b0149fc93d28a769ffb5d7f560b18daa41` (PR #219)
- Risk: security-sensitive-sync-read
- Specification: ADR 0014; `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md`
- Allowed paths: `apps/api/src/reviews/postgres-review-event.store.ts`; `apps/api/test/postgres-review-event.store.test.ts`; `apps/website/lib/mobile-review-http.ts`; `apps/website/test/mobile-review-http.test.ts`; `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md`; `docs/PRODUCT_STATUS.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-033.md`
- Required checks: focused API/Website reconciliation tests; full API and Website tests; API build; Website typecheck/build; migration validation; formatting; queue/documentation/continuity/dashboard validators; `git diff --check`; secret scan
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Review and harden the dormant reconciliation GET before any activation decision. Prevent a
concurrent POST from advancing `nextCursor` beyond the last event represented in the response, and
reject decimal cursors outside PostgreSQL's non-negative BIGINT range at the HTTP boundary. Preserve
Bearer-subject learner scoping, HTTPS/no-store/generic errors and the disabled-by-default runtime.
No flag activation, client composition, database migration, deployment or Production change.

Implementation and Sol security review are complete. `nextCursor` is now derived only from the last
event emitted in the page (or echoes `after` for an empty page), removing the two-statement race.
The HTTP boundary rejects values above signed PostgreSQL BIGINT before storage access. Focused API
store tests pass 13/13; focused Website review boundary tests pass 14/14; full API passes 133/133
and full Website passes 225/225. Builds, typecheck, migration validation, formatting, governance
validators, diff check and secret scan pass. Runtime flags remain false and no client is composed.

Accepted and merged in PR #219 at `82afe3b` after all seven GitHub checks passed. The two activation
blockers are resolved in the dormant server read; client composition and activation remain separate
gates. No migration, database data, deployment, seed, publication, payment or Production state
changed.

## LB-DS-034

- Status: accepted
- Executor: supervisor (Web review-session keyboard/SR accessibility)
- Base: `origin/main` at `2e2d7a36e4f2abf6ab5ed4a04edadcfdda15c1a8`
- Branch: `fix/web-review-session-focus`
- Head commit: `ab93453f2d4696a104fc6696d49ebd579dd9db73`
- Merge commit: `e7069b8d8e86c143179fecad0b181b900309dc57` (PR #221)
- Risk: routine-web-accessibility
- Specification: `docs/design/D1_LEARNER_UI_KIT.md`; `docs/design/ACCESSIBILITY.md`; `docs/design/UI_QA.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/test/learner-core-flows.test.tsx`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/UI_QA.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-034.md`
- Required checks: focused/full Website tests; Website typecheck/build; format; queue/documentation/continuity/dashboard validators; `git diff --check`; local browser keyboard smoke
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Restore keyboard focus after review-session DOM transitions that remove the focused control. Focus
only moves when the active element has been removed: start/next-card front → flip control; card back
→ return control; completion → heading; exit/return → Today review CTA. No API, auth, flag, schema,
migration, seed, content, payment, deployment, publication or Production change.

Accepted and merged in PR #221 at `e7069b8` after all seven GitHub checks passed. Focus recovery is
verified for start, both flip directions, next-card grade, completion and return-to-Today transitions.
No API, auth, sync flag, schema, migration, seed, payment, deployment, publication or Production
state changed.

## LB-DS-035

- Status: accepted
- Executor: supervisor (Web Words source filters and search recovery)
- Base: `origin/main` at `1634744a1929edd31f68c90af8d41228e3df4c27`
- Branch: `feat/web-words-source-filters`
- Head commit: `0066af2749653246fff865aa91e2571de744946c`
- Merge commit: `bd4491563a69fdc0aca44160889c41c6c2339488` (PR #223)
- Risk: routine-web-ui-accessibility
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §7; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/app/globals.css`; `apps/website/test/learner-core-flows.test.tsx`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-035.md`
- Required checks: focused/full Website tests; Website typecheck/build; format; queue/documentation/continuity/dashboard validators; `git diff --check`; browser RTL/keyboard/responsive smoke
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement the D1 Words source chips (`همه` / `رسمی` / `شخصی`) as keyboard-reachable pressed-state
buttons. Search composes with the selected source; visible count and section headings reflect only
displayed rows. A no-result query provides a clear-search recovery action that returns focus to the
search input. Keep canonical/personal identity and quota truth unchanged. No API, auth, sync flag,
schema, migration, seed, content, payment, deployment, publication or Production change.

Accepted and merged in PR #223 at `bd44915` after all seven GitHub checks passed. The source filter,
search composition, visible counts, pressed state and clear-search focus recovery are verified. No
API, auth, sync flag, schema, migration, seed, payment, deployment, publication or Production state
changed.

## LB-DS-036

- Status: accepted
- Executor: supervisor (Android Words offline search and recovery)
- Base: `origin/main` at `58a6590a872d94ccda9c02846a1c06a4fba37e01`
- Branch: `feat/mobile-words-search`
- Head commit: `2845ae128a9d620eb0d76a24b3ed714e8300f8fe`
- Merge commit: `6efc2dfd0fb6cbc5cf7b5bd18dec9b33d3b1e97b` (PR #225)
- Risk: routine-mobile-ui-accessibility
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §7; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/mobile/lib/features/review/words_screen.dart`; `apps/mobile/test/mobile_visual_parity_test.dart`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-036.md`
- Required checks: focused/full Flutter tests; Dart format; Flutter analyze; Android debug build; queue/documentation/continuity/dashboard validators; `git diff --check`; Android-sized RTL/large-text smoke
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Add offline German/Persian search to the bundled canonical Android Words list, a truthful no-result
state and a clear-search action that restores focus. Keep the visible count explicitly official; do
not invent personal vocabulary, synchronization or server state. No API, auth, sync flag, schema,
migration, seed, payment, deployment, publication or Production change.

Accepted and merged in PR #225 at `6efc2df` after all seven GitHub checks passed and independent
review returned PASS with no blocking findings. Search remains local to bundled official content;
personal vocabulary and every server/activation gate remain unchanged.

## LB-DS-037

- Status: accepted
- Executor: supervisor (Android device-local personal vocabulary parity)
- Base: `origin/main` at `388ff670479a4b943279d1e9cf6bde3e4d00a2e4`
- Branch: `feat/mobile-personal-vocabulary`
- Head commit: `b51f5b4f9f36fc187ac47dc9992d8e2676c68008`
- Merge commit: `eda763066bbe08c2931858898e68b4560d882c30` (PR #227)
- Risk: routine-mobile-ui-secure-local-data
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §7; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/mobile/lib/app.dart`; `apps/mobile/lib/features/review/learner_home_shell.dart`; `apps/mobile/lib/features/review/words_screen.dart`; `apps/mobile/lib/features/review/personal_vocabulary_store.dart`; `apps/mobile/test/mobile_visual_parity_test.dart`; `apps/mobile/test/personal_vocabulary_store_test.dart`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-037.md`
- Required checks: focused/full Flutter tests; Dart format; Flutter analyze; Android debug build; queue/documentation/continuity/dashboard validators; `git diff --check`; Android-sized RTL/large-text smoke
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Add secure device-local personal vocabulary to Android Words: separate official/personal groups,
normalized duplicate prevention across both sources, a real 30-record local quota, combined
German/Persian search and truthful load/save/empty/quota recovery states. Keep all personal entries
explicitly device-local; do not claim synchronization or server acknowledgement. No API, auth, sync
flag, schema, migration, seed, payment, deployment, publication or Production change.

Implementation and hardening are merged through PR #227 at `eda7630`. Dart format, Flutter analyze, 193/193 Flutter tests, the Android debug APK, independent re-review and all seven GitHub PR checks passed. No sync, server acknowledgement, API, auth, migration, seed, deployment or Production change is included.

## LB-DS-044

- Status: accepted
- Executor: supervisor (fail-closed business-readiness audit)
- Base: `origin/main` at `bb6c6d6ca1b0af1b0a96a771c4f29a6aabe73d4e`
- Branch: `docs/starter-catalog-release-readiness-audit`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-next-safe-checkpoint`
- Head commit: `d1841956132b814d2982790b67e6d88bdeeb2585`
- Draft PR: #240 (merged) — https://github.com/bahramghorbani/learnbox/pull/240
- Merge commit: `9771dde78a1cec60bdefb8ba05864e3b4a7ad699`
- Risk: content-release-truth-and-owner-gates
- Specification: ADR 0013; ADR 0016; `content/packs/learnbox-start/README.md`; `docs/PRODUCT_STATUS.md`
- Allowed paths: `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-044.md`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`
- Required checks: structured audit of all 35 item IDs and gate artifacts; Prettier; queue/documentation/continuity validators; dashboard tests; `git diff --check`; independent truthfulness review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none for the audit; candidate-media production requires separate cost authorization; attachment, seed, approval, invitation, activation and publication remain owner-gated
- Must not touch: content drafts or review ledgers; media generation/upload/attachment; `cards`/`card_versions`; migrations; seed runners; auth/session; providers/secrets; runtime flags; Preview/Production; participant invitations; publication
- Acceptance: repository contains a decision-ready 20/15 readiness matrix, exact missing gates, stale-evidence warnings and a safe next-workstream boundary without inferring approval or changing release state.

Audit baseline: 35/35 drafted; 35/35 approved only for German linguistic and Persian translation;
the original 20 have candidate-stage provenance/visual/audio/app-flow evidence and privately attested
but unattached media; the remaining 15 have no media candidates or app-flow approval; no item has an
approved/published `card_versions` row. Seed and publication remain blocked. See
`docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`.

## LB-DS-045

- Status: accepted
- Executor: supervisor (W4 content-evidence reconciliation)
- Base: `origin/main` at `9771dde78a1cec60bdefb8ba05864e3b4a7ad699`
- Branch: `docs/starter-catalog-evidence-reconcile`
- Head commit: `ce9fb2aafe8536108999bc798cce639bba0e90e4`
- Draft PR: #241 (merged) — https://github.com/bahramghorbani/learnbox/pull/241
- Merge commit: `95c704b2258f85b943e6874da29ccf57b6e51e82`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-starter-evidence-reconcile`
- Risk: fail-closed-content-evidence-and-validator-truth
- Specification: LB-DS-044 audit; ADR 0013; ADR 0016; `content/packs/learnbox-start/README.md`
- Allowed paths: `content/packs/learnbox-start/validation/start-a1-slice-candidates.json`; `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-candidates.json`; `content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json`; `content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json`; `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json`; `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`; `content/packs/learnbox-start/validation/start-a1-issue59-audio-gate.json`; `scripts/validate-start-slice-candidates.mjs`; `scripts/validate-start-slice-drafts.mjs`; `scripts/validate-issue59-audio-gate.mjs`; `scripts/validate-issue59-audio-gate.test.mjs`; `apps/admin/test/content-review-workspace.test.tsx`; `package.json`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-044.md`; `.ai/worker-reports/LB-DS-045.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/PRODUCT_STATUS.md`; `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`
- Required checks: Issue #59 RED/GREEN tests; Start candidate/draft/linguistic/provenance/media validators; deterministic catalog/hash audit; `pnpm check`; `pnpm build`; migration validation; Prettier; queue/documentation/continuity validators; `git diff --check`; independent truthfulness/fail-closed review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none for evidence reconciliation; paid candidate generation and all human media/app-flow/release approval remain outside scope and owner-gated
- Must not touch: generated/private media blobs; media generation/upload/attachment; approval dimensions or approval events; `cards`/`card_versions`; migrations; seed runners; auth/session; providers/secrets; runtime flags; Preview/Production; invitations; publication
- Acceptance: the two candidate and draft batches truthfully link the existing two-dimensional linguistic approvals while preserving overall `needs_review`; the 15-item provenance ledger stops listing those approved dimensions as pending; the Issue #59 gate deterministically derives 36 transcription matches, four regeneration failures, six listening approvals and 34 pending reviews from its ledger and stays non-releaseable; the catalog remains 0/35 release-approved, non-seedable and publication-blocked.

Accepted and merged through PR #241 at `95c704b`. Independent review returned PASS on the full
implementation/evidence diff and the final metadata-only delta. The exact final head `ce9fb2a` passed
five GitHub check runs and both Vercel commit-status contexts. No media, seed, approval, activation,
Preview/Production or publication state changed.

## LB-DS-046

- Status: accepted
- Executor: Hermes Web implementation worker (M3-S1 Web)
- Base: `origin/main` at `7dba5adab77b0b90a228ac8c7aabab0bc54e3830` (M3-S1 coordination merge)
- Branch: `feature/m3-web-sound-preference`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-m3-web-sound-preference`
- Risk: learner-web-device-local-preference-and-audio-gating
- Specification: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md` §§3-6, 8, 10 (M3-S1 only); `docs/product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/app/components/SettingsScreen.tsx`; `apps/website/app/components/PronunciationButton.tsx`; `apps/website/app/globals.css`; `apps/website/app/sound-preference.ts`; `apps/website/test/learner-profile-settings.test.tsx`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-046.md`; `CURRENT_WORK.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Required checks: RED/GREEN sound-preference tests; focused Web Profile/Settings tests; full website tests; website typecheck/build; Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; responsive RTL/accessibility review; independent code/product review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none; merged in PR #244 at `b5b07fca2fe102c0d8f68880d25154fc35df7d76`
- Must not touch: Android/mobile; Profile sound rows; sign out; account deletion; profile/server APIs; auth/session; review-sync activation; reminders; purchases/packs; provider/config; flags; deployment; Production; landing; Admin; Bobo assets; learning-engine package
- Acceptance: Web persists one versioned device-local pronunciation preference with default-on compatibility; malformed or unknown records recover to enabled without touching unrelated keys; denied durable storage remains usable through the existing memory fallback; Settings exposes an accessible labelled switch and save status; disabled sound prevents Audio and speech-synthesis calls; no server, sync, auth or release claim is introduced.

Web M3-S1 merged in PR #244 at `b5b07fca2fe102c0d8f68880d25154fc35df7d76`. Strict RED→GREEN evidence
(focused Profile/Settings suite 30/30, full Web suite 259/259, website typecheck and production
build) was independently re-run on head `2dcf2ffbf5aeef9bfb4e5b6082a97cad8052215f`; the independent
code/product review returned PASS with no blocking findings. All seven GitHub/Vercel contexts on
that reviewed head completed successfully. The final metadata delta also passed independent review,
and all seven final-head CI/Vercel contexts completed successfully before merge.

## LB-DS-047

- Status: accepted
- Executor: Hermes Android implementation worker (M3-S1 Android)
- Base: `origin/main` at `7dba5adab77b0b90a228ac8c7aabab0bc54e3830` (M3-S1 coordination PR #243 merge)
- Head commit: `8ec12b598164d1caf8cabc43b2dc598e03a8f9a8`
- Draft PR: #245 (merged) — https://github.com/bahramghorbani/learnbox/pull/245
- Merge commit: `610441a18644616b79704ef40fd9349efc1a80ed`
- Branch: `feature/m3-android-sound-preference`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-m3-android-sound-preference`
- Risk: learner-android-device-local-preference-storage-and-audio-gating
- Specification: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md` §§3-6, 8, 10 (M3-S1 only); `docs/product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md`
- Allowed paths: `apps/mobile/lib/app.dart`; `apps/mobile/lib/features/review/learner_home_shell.dart`; `apps/mobile/lib/features/review/today_screen.dart`; `apps/mobile/lib/features/review/review_screen.dart`; `apps/mobile/lib/features/review/settings_screen.dart`; `apps/mobile/lib/features/review/sound_preference_store.dart`; `apps/mobile/test/sound_preference_store_test.dart`; `apps/mobile/test/learner_profile_settings_test.dart`; `apps/mobile/test/mobile_learning_loop_test.dart`; `apps/mobile/test/mobile_visual_parity_test.dart`; `apps/mobile/test/today_screen_states_test.dart`; `apps/mobile/test/mobile_auth_composition_test.dart`; `apps/mobile/test/support/mobile_test_app.dart`; `apps/mobile/test/support/sound_preference_test_storage.dart`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-047.md`; `CURRENT_WORK.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Required checks: RED/GREEN sound-preference store and audio-gate tests; focused Flutter Settings/learning-loop tests; full Flutter tests; Flutter analyze; Dart format; debug APK build; queue/documentation/continuity/dashboard validators; `git diff --check`; Android emulator RTL/accessibility review; independent code/product review
- Simulator required: yes
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none; merged in PR #245 at `610441a18644616b79704ef40fd9349efc1a80ed`
- Must not touch: Web; native Android host/manifest/Gradle; iOS; existing auth/sync/personal-vocabulary stores; sign out; account deletion; profile/server APIs; reminders; purchases/packs; provider/config; flags; deployment; Production; landing; Admin; Bobo assets
- Acceptance: Android persists one versioned device-local pronunciation preference in a dedicated existing secure-storage-backed store with default-on compatibility; corrupt v1 data self-heals, unknown newer versions remain untouched, and storage failures never crash; Settings exposes an accessible labelled switch with save/revert status; disabled sound prevents `PronunciationPlayer.playAsset`; no new dependency, server, sync, auth or release claim is introduced.

Supervisor allowlist amendment: the five additional `apps/mobile/test` helper/support paths are approved only for hermetic test-store injection after the required full suite exposed 39 pending-timer failures from the real secure-storage channel. They do not widen product scope or production code.

Android M3-S1 merged in PR #245 at `610441a18644616b79704ef40fd9349efc1a80ed` after
independent code/product review found no blocking implementation issue and requested only truthful
metadata correction. The correction landed at final PR head
`8ec12b598164d1caf8cabc43b2dc598e03a8f9a8`; all seven GitHub/Vercel contexts completed
successfully on that exact head before merge.

## LB-DS-050

- Status: accepted
- Executor: supervisor (M2 staging-preflight preparation; no activation)
- Base: `origin/main` at `a3f472012d653dee26ad40c64258abd70065cef6` (PR #254 merged)
- Head commit: `83b6c1bb4a7fcbb22612e211a20c06b692a8e367`
- Draft PR: #255 (merged) — https://github.com/bahramghorbani/learnbox/pull/255
- Merge commit: `7861354ebfd2eb63dfb4de4d5d2f655c16258fb8`
- Branch: `ops/admin-content-review-staging-preflight`
- Risk: security-sensitive-staging-preflight-and-migration-runner-packaging
- Specification: `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`; PDR-008; ADR 0016; `docs/DOCUMENTATION_GOVERNANCE.md`
- Allowed paths: `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`; `infrastructure/production/admin/compose.yaml`; `infrastructure/production/admin/tests/deployment-boundary.test.mjs`; `infrastructure/production/app/Dockerfile`; `infrastructure/production/app/tests/deployment-boundary.test.mjs`; `package.json`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-050.md`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`
- Required checks: both production deployment-boundary suites; `pnpm check`; `pnpm build`; `node scripts/validate-migrations.mjs`; `pnpm audit --prod --audit-level=high`; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; secret scan; independent review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none for preparation; a separate explicit owner approval remains required before any staging operation
- Must not touch: migration content or execution; staging/Preview/Production deployment; runtime flag activation; secrets; database data; human review or approval; seed; pack membership; publication; learner delivery; invitations; billing or Vercel configuration; Bobo assets
- Acceptance: Compose exposes `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` as a runtime-only default-false value; deployment-boundary tests prove the default-off/explicit-on mapping and migration-runner dependency resolution; the runbook defines exact-release, backup, checksum, fail-closed, activation-verification and rollback gates without performing them; no environment is changed and no migration, review, seed, publication or learner delivery occurs.

This task merged in PR #255 at `7861354`. Independent infrastructure/migration review and both
reviewer-hardening deltas passed, and all seven final-head GitHub/Vercel contexts succeeded. The
preflight only prepares a reviewed, reversible staging operation. It does not authorize the operator
phases documented by the runbook. Migration `0017`, the Admin review flag, human attestations,
deployment and all release paths remain unchanged and gated.

## LB-DS-051

- Status: accepted
- Executor: Hermes Web implementation worker (M1-B Today no-due state)
- Base: `origin/main` at `05222eeab3b3c144bb6effb2d4d1a726cb6b99d6` (PR #256 merge commit)
- Head commit: `5968cbb308b4f91fe4a965e3cc0c186b703df9d8`
- PR: #257 (merged) — https://github.com/bahramghorbani/learnbox/pull/257
- Merge commit: `d80c37ea05b796e947e9e97533a90a07c5a5ea28`
- Branch: `feature/web-today-no-due-state`
- Risk: routine-web-ui-truth-accessibility
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §5 Today empty/no-due state; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/website/app/components/TodayScreen.tsx`; `apps/website/app/LearnerHome.tsx`; `apps/website/app/globals.css`; `apps/website/test/learner-core-flows.test.tsx`; `apps/website/test/learner-today-server-states.test.tsx`; `apps/website/test/learner-today-empty.test.tsx`; `apps/website/README-M1B-WEB-SLICE1.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-051.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`
- Required checks: strict RED/GREEN focused Today no-due tests; full Website tests; Website typecheck and production build; Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; responsive RTL/keyboard/large-text browser evidence; independent code/product/accessibility review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none
- Must not touch: Android/mobile/iOS; API, route, auth or session behavior; learner-state parsing; sync composition or activation; `WEB_LEARNER_STATE_ENABLED`; migration, seed, catalog membership, publication, deployment, Preview/Production, provider, secret, Admin, commerce or Bobo canonical assets
- Acceptance: when the truthful device-local Today session has no remaining cards, Web renders the D1 no-due message `کارتی برای مرور نیست`, does not render the zero-card start prompt or `شروع مرور`, and exposes one accessible action to Words; non-empty sessions and existing loading/error/offline/server-backed labels remain unchanged; the state is verified in local-only, offline/error and server-backed label conditions without claiming server due counts, acknowledgement or catalog activation.

This task merged in PR #257 at `d80c37e` after an exact-head independent code/product/accessibility
PASS on `5968cbb` and all seven required GitHub/Vercel contexts succeeded. Focused Today tests passed
17/17, the affected Today/core-flow set 30/30 and the full Website suite 276/276; Website typecheck,
production build, repository validators and 390×844/200% reflow browser probes passed. No server
state, sync, catalog seed, publication, deployment, migration or runtime flag was activated.

## LB-DS-052

- Status: review_requested
- Executor: supervisor (milestone execution coordination)
- Base: `origin/main` at `0e36fb7466aa746cc0f322309fa399a81a005197` (PR #258 merge commit)
- Branch: `docs/next-milestone-execution-queue`
- Risk: documentation-only-milestone-sequencing
- Specification: `ROADMAP.md`; `.ai/WORKSTREAMS.md`; `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md`; `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`; `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`
- Allowed paths: `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-052.md`; `CURRENT_WORK.md`
- Required checks: Prettier on changed Markdown; `node scripts/validate-ai-worker-queue.mjs`; `node scripts/validate-documentation-governance.test.mjs`; `node scripts/validate-ai-continuity.mjs`; `git diff --check`; independent milestone/dependency/scope review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none
- Must not touch: product code; tests; content or generated media; migrations or database data; auth/session behavior; provider or secret configuration; runtime flags; staging/Preview/Production; deployment; seed; pack membership; human approval; publication; payments; landing; Bobo assets
- Acceptance: the repository has one continuously executable next M1 task and records later owner/cost-gated M2 tasks without treating them as ready; scopes remain coherent milestone outcomes rather than microtasks; no product, environment, content-release or provider state changes.

## LB-DS-053

- Status: ready
- Executor: substantial Android/M1-D sync worker with independent high-reasoning review
- Base: exact merge commit of LB-DS-052 (replace this dependency with its merged SHA before dispatch)
- Branch: `feature/m1d-mobile-reconciliation-client`
- Risk: security-sensitive-no-data-loss-mobile-sync-client-composition
- Specification: `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md` §§3.2, 4-7, 9-11, 13, 15-17; ADR 0014; `docs/architecture/OFFLINE_SYNC.md`
- Allowed paths: `apps/mobile/lib/features/sync/reconciliation_cursor_store.dart`; `apps/mobile/lib/features/sync/review_sync_result.dart`; `apps/mobile/lib/features/sync/review_sync_transport.dart`; `apps/mobile/lib/features/sync/http_review_sync_transport.dart`; `apps/mobile/lib/features/sync/review_sync_coordinator.dart`; `apps/mobile/lib/main.dart`; `apps/mobile/lib/app.dart`; `apps/mobile/lib/features/review/learner_home_shell.dart`; `apps/mobile/lib/features/review/today_screen.dart`; `apps/mobile/test/reconciliation_cursor_store_test.dart`; `apps/mobile/test/reconciliation_cursor_transport_test.dart`; `apps/mobile/test/reconciliation_cursor_coordinator_test.dart`; `apps/mobile/test/review_sync_coordinator_test.dart`; `apps/mobile/test/http_review_sync_transport_test.dart`; `apps/mobile/test/review_sync_contract_test.dart`; `apps/mobile/test/mobile_sync_composition_test.dart`; `apps/mobile/test/mobile_auth_composition_test.dart`; `apps/mobile/test/app_test.dart`; `apps/mobile/test/today_screen_states_test.dart`; `apps/mobile/test/mobile_learning_loop_test.dart`; `apps/mobile/test/support/mobile_test_app.dart`; `docs/architecture/M1D_SYNC_WIRE_CONTRACT.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-053.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/PRODUCT_STATUS.md`
- Required checks: strict RED/GREEN tests for reconciliation response parsing, paging, lost POST response, malformed/partial response, cursor persistence and exact-POST-ack removal invariant; all focused sync tests; full Flutter test suite; `flutter analyze`; `dart format --output=none --set-exit-if-changed`; debug APK build; Prettier on changed docs; queue/documentation/continuity/dashboard validators; `git diff --check`; independent high-reasoning security/no-data-loss review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: LB-DS-052 coordination merge only
- Must not touch: API/server implementation or migrations; Web/Admin/landing/iOS; auth/session redesign; native gateway; runtime flag enablement; deployment; staging/Preview/Production; secrets/providers; content seed/publication; payments; Bobo assets
- Acceptance: the mobile sync transport strictly parses the existing dormant reconciliation GET contract and the learner composition can invoke the documented reconnect sequence through the coordinator without deleting any local event from a cursor or GET result; malformed, partial, failed and paged responses preserve the queue and prior cursor; production composition remains fail-closed with signed-out identity and disabled transport, all sync flags remain false, and no network route is activated or deployed.

## LB-DS-054

- Status: blocked
- Executor: high-reasoning serial staging operator plus independent security/data-integrity reviewer
- Base: a separately approved exact `origin/main` release commit containing PRs #252 and #255
- Branch: `ops/admin-content-review-staging-activation`
- Risk: owner-gated-staging-backup-database-migration-and-runtime-activation
- Specification: `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`; PDR-008; ADR 0016
- Allowed paths: `docs/operations/ADMIN_CONTENT_REVIEW_STAGING_ACTIVATION.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-054.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/PRODUCT_STATUS.md`
- Required checks: every runbook Phase 1 preflight; verified encrypted staging backup and restore readiness; migration checksum/ledger check; post-migration `35 / 210 / 210 / 0 / 0` assertion; protected Admin route/Passkey/bootstrap health probes; rollback evidence; queue/documentation/continuity validators; `git diff --check`; independent security/data-integrity review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: explicit owner authorization for the exact staging release commit, backup, migration `0017`, Admin image rollout and `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=true`; trusted secret entry must occur outside chat
- Must not touch: Production; learner applications or sync flags; seed; pack membership; media attachment; human check outcomes or decisions; approval/publication; participant invitation; payment; DNS/TLS; landing; Bobo assets
- Acceptance: only isolated Admin staging is backed up, migrated and activated exactly per the reviewed runbook; database truth is `35 / 210 / 210 / 0 / 0`, Passkey protection remains intact, rollback is proven, and Production, learner delivery, content decisions and publication remain unchanged.

## LB-DS-055

- Status: blocked
- Executor: W4 content-factory worker plus mandatory human visual/audio/content reviewers
- Base: exact current `origin/main` after LB-DS-054 only if staging review evidence is needed; otherwise a freshly recorded current main
- Branch: `content/start-15-candidate-media-readiness`
- Risk: cost-gated-generated-media-and-human-content-quality
- Specification: `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`; ADR 0013; ADR 0016; PDR-003; PDR-008
- Allowed paths: remaining-15 Start Pack candidate media and validation ledgers under `content/packs/learnbox-start/`; bounded content/media validators and tests; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-055.md`; `CURRENT_WORK.md`; `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`
- Required checks: immutable ID/checksum and provenance validation; candidate visual QA; word/sentence audio transcription plus human listening QA; local learner app-flow QA; all Start Pack validators; `pnpm check`; `pnpm build`; migration validation; Prettier; queue/documentation/continuity/dashboard validators; `git diff --check`; independent fail-closed content/product review
- Simulator required: yes
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: separate owner authorization for paid provider cost and confirmed human visual/audio/content review capacity
- Must not touch: existing approved canonical Bobo appearance; database migration/execution; media attachment; `card_versions` approval/publication; catalog seed; pack membership; runtime flags; invitations; staging/Preview/Production; payments; auth/session/sync; landing
- Acceptance: candidate-only image/audio evidence for the remaining 15 items is complete, immutable and human-reviewed enough to produce a truthful 35-item decision package while `seedable: false`, `publicationBlocked: true`, and 0/35 release-approved versions remain unchanged; no asset is attached or delivered to learners.

## LB-DS-049

- Status: accepted
- Executor: high-reasoning serial Admin/content-persistence worker (M2)
- Base: `origin/main` at `dc92fe2fbf1381bb98dcf8a81f7f11079252d785` (PR #250 scope authorization plus merged PR #253 dependency-security prerequisite)
- Branch: `feature/admin-starter-review-persistence-clean`
- Head commit: `bb2ee717a5e88481f36d1125b0ce6c151affcb09` (reviewed implementation and migration hardening; base merge and metadata-only delta follow)
- Draft PR: #252 — https://github.com/bahramghorbani/learnbox/pull/252 (merged; replaces closed PR #251)
- Merge commit: `a2a75e9789ebffffffe50e80067ccd0d23c5926a`
- Risk: security-sensitive-admin-write-and-content-data-migration
- Specification: `docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md`; ADR 0015; ADR 0016; `docs/product-decisions/PDR-005-LEARNING-CONTENT-FACTORY.md`
- Allowed paths: `database/migrations/0017_start_catalog_review_candidates.sql`; `scripts/validate-migrations.mjs`; `apps/api/src/admin/content-review.service.ts`; `apps/api/src/admin/postgres-content-review.store.ts`; `apps/api/test/postgres-content-review.store.test.ts`; `apps/admin/app/api/content/review/route.ts`; `apps/admin/app/api/content/review/check/route.ts`; `apps/admin/app/api/content/review/decision/route.ts`; `apps/admin/lib/server/admin-content-review-config.ts`; `apps/admin/lib/server/admin-content-review-routes.ts`; `apps/admin/lib/server/admin-content-review-server.ts`; `apps/admin/lib/server/postgres-content-review-store.ts`; `apps/admin/app/components/ContentReviewWorkspace.tsx`; `apps/admin/test/admin-content-review-routes.test.ts`; `apps/admin/test/postgres-content-review-store.test.ts`; `apps/admin/test/content-review-workspace.test.tsx`; `docs/architecture/ADR/0016-starter-catalog-35-seed-gate.md`; `docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-049.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`
- Required checks: strict RED/GREEN migration, Admin store, route-security and UI-state tests; migration validation; full API and Admin tests/typecheck/build; Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; independent high-reasoning security/data-integrity/product review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none for implementation; migration execution and any staging/Preview/Production flag activation require separate approval
- Must not touch: learner Web/mobile/iOS or landing; learner auth/session/review-sync routes; pack membership; learner schedule bootstrap; status `published`; prices, purchases or entitlements; provider/media generation; secrets; deployment; staging/Preview/Production configuration or activation; Bobo assets
- Acceptance: all 35 committed draft IDs are inserted idempotently as canonical `cards.content_id` values with deterministic identities and immutable version-1 `card_versions.status = 'needs_review'`; exactly six pending checks exist per candidate and repository evidence is not forged as a database-user attestation; enabled Admin reads derive actor identity only from the canonical Passkey session, authorize only through `admin_role_assignments`, return `no-store`, and strictly validate output; check and final-decision mutations require trusted origin, CSRF, recent authentication, target locking, idempotency and atomic audit attribution; final approval remains impossible until all six checks pass and never publishes; a dedicated default-off runtime boundary returns 404 without reading review data when disabled; UI state is server-truthful when enabled and never treats local preview state as persisted; candidate rows remain invisible to all learner paths; no migration execution, deployment or activation is included.

The first draft PR #251 exposed two CI blockers (lint and generic-secret false positives) plus an
incorrect MD5 implementation behind the runtime's uuid5 label. The clean replacement merged in PR
#252 at `a2a75e9`: it removes scanner-triggering test/comment syntax without an allowlist or bypass, uses RFC
uuid5 SHA-1 for future runtime check keys, resets all six attestations when a version is returned for
revision, maps cross-target idempotency collisions to conflict and clears stale client keys after
conflicts. Migration 0017 still ingests the same 35 committed drafts with six pending checks each and
no decision/reviewer/release values. Learner resolution, schedule bootstrap, publication, migration
execution and runtime/deployment state remain unchanged. Evidence is in
`.ai/worker-reports/LB-DS-049.md`; independent reviews passed and all seven final-head checks were green.

## LB-DS-048

- Status: accepted
- Executor: high-reasoning Web/API identity worker (M3-A1)
- Base: `origin/main` at `5d7a71720522611e03e8e2cef7a9b16b2a16b4df` (M3-A1 scope-coordination merge)
- Head commit: `f8563bdb4d42de8995eaef4d96f5f83b62f5d4d4` (final PR head)
- Draft PR: #248 (merged) — https://github.com/bahramghorbani/learnbox/pull/248
- Merge commit: `b580d599c2a2b90c5fb505b8c54245e3f582cf5c`
- Branch: `feature/m3-web-masked-identity`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-m3-web-masked-identity`
- Risk: security-and-privacy-sensitive-authenticated-identity-read
- Specification: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md` §§4-5, 6, 9-10 (M3-A1 only); `docs/product-decisions/PDR-007-WEB-MASKED-IDENTITY-READ.md`
- Allowed paths: `apps/api/src/profile/learner-profile.service.ts`; `apps/api/src/profile/postgres-learner-profile.repository.ts`; `apps/api/test/learner-profile.service.test.ts`; `apps/api/test/postgres-learner-profile.repository.test.ts`; `apps/website/app/api/learner/profile/route.ts`; `apps/website/lib/learner-profile-web-http.ts`; `apps/website/lib/learner-profile-web-runtime.ts`; `apps/website/lib/learner-profile-web-client.ts`; `apps/website/app/LearnerHome.tsx`; `apps/website/app/components/ProfileScreen.tsx`; `apps/website/app/globals.css`; `apps/website/test/learner-profile-web-http.test.ts`; `apps/website/test/learner-profile-web-route.test.ts`; `apps/website/test/learner-profile-web-client.test.ts`; `apps/website/test/learner-profile-settings.test.tsx`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-048.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Required checks: strict RED/GREEN API repository/service, HTTP boundary, route, client and Profile state tests; API build/typecheck and focused tests; full website tests, typecheck and production build; Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; responsive RTL/accessibility review; independent high-reasoning security/product review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none; implementation merged in PR #248 at `b580d599c2a2b90c5fb505b8c54245e3f582cf5c`
- Must not touch: Android/mobile/iOS; database migrations or schema; raw phone serialization; first-name/display-name/avatar presentation; auth, OTP, session or cookie behavior; sign out; account deletion; account-scoped local storage; review-sync activation; server preference sync; reminders; purchases/packs; analytics; providers/secrets; deployment; Preview/Production flags or activation; landing; Admin; Bobo assets
- Acceptance: an authenticated Web-only `GET /api/learner/profile` derives canonical `users.id` solely from the existing signed HttpOnly learner cookie; reads the matching `users` row; returns only a strictly validated server-masked Iranian phone value with `cache-control: no-store`; never returns raw phone, first name, internal IDs or session data; dedicated runtime config defaults off and fails closed; invalid/expired session, missing learner, malformed data, offline and server failure expose no identity; Web Profile keeps local goal/pending facts usable through identity loading/error/offline states and offers bounded retry; no auth redesign, migration, Android path, deployment or activation is included.

## LB-DS-042

- Status: accepted
- Executor: Hermes web implementation worker (M3 Web P1)
- Base: `origin/main` at `0f4feb71dc01b878519cae58765284a6028b5daf` (LB-DS-041 post-merge reconciliation)
- Head commit: `7b58ff2` (Profile/Settings implementation and review hardening)
- Draft PR: #238 (merged) — https://github.com/bahramghorbani/learnbox/pull/238
- Merge commit: `3f6db8ffc81c07afb5c576ce0469e8746a13110a`
- Branch: `feature/m3-web-profile-settings`
- Risk: learner-web-ui-and-device-local-state
- Specification: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md` §§3-6, 8, 10 (M3-P1 only); `docs/product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/app/components/LearnerNav.tsx`; `apps/website/app/components/ProgressScreen.tsx`; `apps/website/app/components/ProfileScreen.tsx`; `apps/website/app/components/SettingsScreen.tsx`; `apps/website/app/globals.css`; `apps/website/test/learner-profile-settings.test.tsx`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-042.md`; `CURRENT_WORK.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Required checks: focused Web Profile/Settings test; full website test suite; website typecheck/build; Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; responsive RTL/accessibility screenshot review; independent code/product review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none
- Must not touch: sign out; account deletion; profile/server APIs; auth/session; review-sync activation; sound preference persistence (M3-S1); reminders; purchases/packs; provider/config; flags; deployment; Production; landing; Admin; Bobo assets
- Acceptance: Web exposes Profile as the fourth persistent destination; Profile and child Settings show only real device-local goal/pending facts and truthful informational rows; no sign-out/deletion/fake account/commerce/reminder state; all relevant loading/offline/error/keyboard/focus/RTL/responsive states are tested and independently reviewed.
- Note: the shared bottom `LearnerNav` is one component rendered on Today, Words, Progress and Profile, so `ProgressScreen.tsx` is included in the allowed paths for a single type-only widening of its `onNavigate` prop to the shared `LearnerDestination` union (no behavior change).

Implementation and review hardening were accepted and merged in PR #238 at `3f6db8f`. Focused Web
tests pass 16/16 and the full website suite passes 245/245; typecheck, production build, full Flutter
203/203, Flutter analyze, formatting, governance validators and all seven GitHub checks passed after
integrating Android PR #237. No activation, deployment, Production or server-boundary change was included.

## LB-DS-043

- Status: accepted
- Executor: Android implementation worker
- Base: `origin/main` at `0f4feb71dc01b878519cae58765284a6028b5daf`
- Branch: `feature/m3-android-profile-settings`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-m3-android-profile-settings`
- Head commit: `ebbe8b15fa110cd9d5b4c548e235a1fa51b06da9` (stable implementation commit; review-test and status hardening follow on the same branch)
- Draft PR: #237 (merged) — https://github.com/bahramghorbani/learnbox/pull/237
- Merge commit: `6c6f4b6cd89ed7c4d668c75925c1e1145e2f6156`
- Risk: learner-android-ui-and-device-local-state
- Specification: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md` §§3-6, 8, 10 (M3-P1 only); `docs/product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md`
- Allowed paths: `apps/mobile/lib/features/review/learner_home_shell.dart`; `apps/mobile/lib/features/review/profile_screen.dart`; `apps/mobile/lib/features/review/settings_screen.dart`; `apps/mobile/lib/ui/learner_bottom_navigation.dart`; `apps/mobile/test/learner_bottom_navigation_test.dart`; `apps/mobile/test/learner_profile_settings_test.dart`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-043.md`; `CURRENT_WORK.md`; `docs/design/DESIGN_STATUS.md`; `docs/PRODUCT_STATUS.md`
- Required checks: focused Flutter Profile/Settings/navigation widget tests; full Flutter tests; Flutter analyze; debug APK build; format check; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; Android emulator RTL/accessibility screenshot review; independent code/product review
- Simulator required: yes
- Draft PR required: yes
- Merge allowed: yes
- Blocked on: none
- Must not touch: sign out; account deletion; profile/server APIs; auth/session; review-sync activation; sound preference persistence (M3-S1); reminders; purchases/packs; provider/config; flags; deployment; Production; landing; Admin; Bobo assets
- Acceptance: Android exposes Profile as the fourth persistent destination; Profile and child Settings show only real device-local pending facts and truthful informational rows; no sign-out/deletion/fake account/commerce/reminder state; navigation/focus/back/RTL/accessibility and target-device layout are verified without activating dormant native auth.

Implementation was accepted and merged in PR #237 at `6c6f4b6` from
`feature/m3-android-profile-settings`. Profile is the fourth persistent destination after Today,
Words and Progress (PDR-006). Profile shows the neutral `حساب LearnBox` account label and the real
device-local pending review count (zero, positive and failed-read/retry states, complete Persian
phrases). Settings is a child surface opened from Profile with approved informational rows only
(text size follows the device; language فارسی); no preference is persisted or toggled. No goal row
is shown because Android has no device-local goal store. No sign-out, deletion, identity/avatar,
phone, purchase, reminder or sync state is fabricated. Focused widget tests pass 11/11; the full
Flutter suite passes 203/203; `flutter analyze`, `dart format`, the debug APK build, `git diff
--check` and the queue/documentation/continuity/dashboard validators pass. Emulator RTL visual
evidence is recorded in the report. No flag, auth/session, API, migration, deployment, Production,
commerce or Bobo change is included; native auth remains dormant and untouched. Independent review
returned PASS with no blocker; review hardening covers loading, retry recovery and initial child focus.

## LB-DS-041

- Status: accepted
- Executor: supervisor (M3 Profile/Settings design contract)
- Base: `origin/main` at `e074ccfaa9b078609a9942398a79d37c5e79261c`
- Branch: `design/m3-profile-settings-contract`
- Risk: product-and-privacy-sensitive-design-only
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §9; `docs/design/INFORMATION_ARCHITECTURE.md`; `docs/product/PRD.md`; `docs/PRODUCT_STATUS.md`
- Allowed paths: `docs/design/M3_PROFILE_SETTINGS_CONTRACT.md`; `docs/design/DESIGN_STATUS.md`; `docs/product-decisions/PDR-006-PROFILE-SETTINGS-ALPHA-POLICIES.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-041.md`
- Required checks: Markdown/Prettier; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`; independent product/accessibility review
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Produce a decision-ready, design-only Profile and Settings interaction contract before any new M3
surface implementation. Resolve the existing navigation contradiction as an explicit owner decision;
define truthful local/server data boundaries, complete states, accessibility, safe preference scope
and the cross-account pending-data blocker for sign out. No product code, API, auth/session change,
database, migration, notification provider, payment, deployment, publication or Production change.
Merging the proposal must not claim owner approval or authorize implementation.

## LB-DS-040

- Status: accepted
- Executor: supervisor
- Lane: O
- Base: `origin/main` at `a8354a58ebeb5eac3a3a6c2364dbcb3d81f70c6c`
- Branch: `docs/learner-auth-preview-revalidation`
- Worktree: `/Volumes/LearnBox-Dev/LearnBox-final/lb-learner-auth-preview-revalidation`
- Head commit: `3c6fe9d0f6675d99dc21fb2fcc6ee517a565f6de`
- Merge commit: `26525dad294a743ce42d48e0c28edbb3d445338b` (PR #233)
- Scope: record the bounded protected Preview validation of the real learner-facing OTP login flow, including authenticated post-login onboarding evidence and full rollback/removal.
- Allowed paths: `docs/operations/OTP_PROVIDER_ACTIVATION.md`, `.ai/WORK_QUEUE.md`, `CURRENT_WORK.md`, `.ai/worker-reports/LB-DS-040.md`
- Forbidden paths: runtime code; package manifests; database migrations; deployment configuration; unrelated docs
- Risk: medium — security-sensitive operational evidence, with no runtime mutation in this branch
- Specification: `docs/operations/OTP_PROVIDER_ACTIVATION.md`
- TDD required: no (documentation-only operational evidence)
- Simulator required: no
- Draft PR required: no
- Merge allowed: yes
- Required checks: `pnpm exec prettier --check .ai/WORK_QUEUE.md .ai/worker-reports/LB-DS-040.md CURRENT_WORK.md docs/operations/OTP_PROVIDER_ACTIVATION.md`; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`; `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`
- Review method: focused review of the bounded flag changes, authenticated browser outcome, SSO posture, rollback deployment, and removal of the temporarily enabled deployment; no phone number, OTP, session token, or secret value may enter evidence.
- Acceptance contract: learner OTP request and verification reach onboarding in the SSO-protected Preview; `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED` and `SMS_IR_ENABLED` return to `false`; the rollback deployment is Ready and still SSO-protected; the enabled deployment is removed and verified absent; Production, `WEB_LEARNER_STATE_ENABLED`, mobile auth, and review sync remain unchanged.
- Independent reviewer: required — Security Review Agent (isolated context; final evidence/rollback review)
- Evidence destination: `.ai/worker-reports/LB-DS-040.md`
- Dependencies: merged LB-DS-039 OTP provider revalidation; owner-operated phone/OTP entry; no dependency on device-debug access because this task validates the learner Web flow.
- Follow-up: authenticated learner shell is now verified in bounded Preview; persistent server-backed learner-state activation still depends on canonical starter-catalog publication approval and a separate guarded rollout.

## LB-DS-039

- Status: accepted
- Executor: supervisor (protected Preview OTP revalidation)
- Base: `origin/main` at `514ab09919307756dda576fa83c91e5ac0d7d9e5`
- Branch: `docs/otp-preview-revalidation`
- Head commit: `16668542514cec845c9ef7bb1979e373a96ca59f`; merge commit: `a7f2185043e8e95193d56a449770d032e6245a07` (PR #231)
- Risk: protected-preview-operations-security
- Specification: `docs/operations/OTP_PROVIDER_ACTIVATION.md`; `docs/superpowers/specs/2026-08-08-owner-otp-preview-test-design.md`
- Allowed paths: `docs/operations/OTP_PROVIDER_ACTIVATION.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-039.md`
- Required checks: queue/documentation/continuity/dashboard validators; format; `git diff --check`; live Preview protection and fail-closed rollback probes
- Simulator required: no
- Draft PR required: no
- Merge allowed: yes

Revalidate the existing owner-only SMS.ir request/verification flow in Vercel Preview without exposing personal data or secret values. Enable only `LEARNBOX_OTP_TEST_UI_ENABLED` and `SMS_IR_ENABLED` for the bounded test, retain Vercel Authentication, accept only the owner's generic outcome, then immediately return both flags to `false`, redeploy, and verify the protected route returns authenticated `404`. Production, public learner auth, Web learner state, native auth, review sync, private media, analytics and content publication remain unchanged.

## LB-DS-038

- Status: accepted
- Executor: supervisor (Learner Web Progress local-data truthfulness)
- Base: `origin/main` at `b46867c57daf2d4657b2573411c50f015fc4d221`
- Branch: `fix/web-progress-local-truth`
- Head commit: `93bf1de970c18a1b0b696ed450d72231bda76e56`; merge commit: `506b334098cebc71e15537c6758882b8fe52527a` (PR #229)
- Risk: routine-web-ui-truth-accessibility
- Specification: `docs/design/D1_LEARNER_UI_KIT.md` §8; `docs/PRODUCT_STATUS.md`
- Allowed paths: `apps/website/app/LearnerHome.tsx`; `apps/website/app/components/ProgressScreen.tsx`; `apps/website/test/screens.test.tsx`; `apps/website/test/learner-core-flows.test.tsx`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-038.md`
- Required checks: focused/full Website tests; Website typecheck/build; format; queue/documentation/continuity/dashboard validators; `git diff --check`; browser RTL/responsive/large-text smoke
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Label every current Progress figure as device-local, expose the existing unacknowledged review-event count without claiming server acknowledgement, and state that server weekly history is not active. Preserve the calm empty state and hide the pending notice at zero. No API, route, auth, sync flag/client composition, schema, migration, seed, content, payment, deployment, publication or Production change.

Accepted and merged in PR #229 at `506b334`. Focused Progress/core-flow tests pass 18/18; full Website tests pass 229/229; Website typecheck and production build pass. Browser smoke confirms the empty Progress state at desktop and 390×844 with 200% root text scaling, RTL and no horizontal overflow. All seven GitHub checks passed at final head `93bf1de`, and an independent DeepSeek V4 Flash review returned PASS with no blocking findings. No server history, acknowledgement, sync activation or Production state is claimed.

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

## LB-DS-STARTER-CATALOG-35

- Status: accepted
- Executor: subagent (starter catalog slice, ADR 0016)
- Base: main at `d20b46a` plus branch commits `0fcdcaf` and `94cb729` (35-word free starter target)
- Branch: feature/starter-catalog-35
- Risk: routine-content-catalog-boundary
- Specification: ADR 0013 (start-a1-* ids are canonical `cards.content_id`; approved/published `card_versions` required before resolution); ADR 0016 (35-word catalog slice and fail-closed seed gate); PDR-004; docs/content/START_A1_EDITORIAL_REVIEW_PACKET.md
- Allowed paths: content/packs/learnbox-start/**; apps/api/src/catalog/**; apps/api/test/start-catalog-seed-gate.test.ts; docs/architecture/ADR/0016-starter-catalog-35-seed-gate.md; docs/PRODUCT_STATUS.md; CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-STARTER-CATALOG-35.md
- Required checks: focused API seed-gate tests; API typecheck; node scripts/validate-migrations.mjs; pnpm verify:ai-worker-queue; pnpm verify:documentation-governance; pnpm verify:ai-continuity; pnpm verify:start-drafts; pnpm verify:review-gates; pnpm verify:linguistic-approval; pnpm format:check; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: no

Bounded, additive, fail-closed Starter Catalog slice for the 35-word target (ADR 0016). Adds a
reusable seed gate that can only report a catalog as seedable when every target item exists and
is release-approved, plus a derived, SHA-256-anchored catalog snapshot recording the exact
limitation: 20 of 35 target items drafted, 20 linguistically reviewed (German + Persian only),
0 release-approved, seed blocked. No migration, DB seed, approval, publication, media
attestation, price, flag or production activation. DB seeding stays blocked by ADR 0013 until
the missing 15 reviewed drafts and approved/published card versions exist. Report:
`.ai/worker-reports/LB-DS-STARTER-CATALOG-35.md`.

Accepted and merged through PR #193 at merge commit `73adc02` on 2026-09-04. The merged branch
was `feature/starter-catalog-35-clean`; its snapshot, seed gate, tests and ADR 0016 are
byte-identical to the recorded head `6d5dcb5` artifacts, and the record's `Merge allowed: no`
field reflected the original slice instruction, not a blocker on this later reviewed merge.
The derived snapshot still records the exact fail-closed limitation: target 35, drafted 20,
linguistically reviewed 20 (German + Persian only), release-approved 0, `seedable: false`,
15 target drafts missing. No migration, DB seed, approval or publication was merged; DB
seeding stays blocked by ADR 0013 until the missing 15 reviewed drafts and approved/published
card versions exist. Do not reopen or duplicate this task.

## LB-DS-STARTER-DRAFTS-15

- Status: accepted
- Executor: subagent (starter catalog 15 pending drafts, ADR 0016)
- Base: main at `f63538c` (PR #199 merged)
- Branch: content/starter-drafts-15
- Merge commit: `2aa5931` (PR #200 merged 2026-09-04)
- Risk: routine-content-catalog-boundary
- Specification: ADR 0013 (start-a1-* ids are canonical `cards.content_id`; approved/published `card_versions` required before resolution); ADR 0016 (35-word catalog slice and fail-closed seed gate); docs/content/START_A1_EDITORIAL_REVIEW_PACKET.md
- Allowed paths: content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json; content/packs/learnbox-start/validation/start-a1-catalog-35-pending-candidates.json; content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json; content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json; apps/api/test/start-catalog-seed-gate.test.ts; CURRENT_WORK.md; .ai/worker-reports/LB-DS-STARTER-DRAFTS-15.md
- Required checks: focused seed-gate vitest (RED then 10/10 GREEN); content-factory batch validation 13/13; Start Pack validators (verify:start-slice/start-drafts/linguistic-approval/source-scope/start-provenance-ledger/start-candidate-qa/media-handoff/start-attachment-draft/start-v2-image-attachment-draft/start-private-media-attestation/start-v2-images-private-media-attestation/private-media-delivery/website-start-slice/start-local-media-preview/start-pack-v2-contract); test:mobile-start-content; JSON structural sanity; git diff --check; prettier check on changed files
- Simulator required: no
- Draft PR required: no
- Merge allowed: yes

Accepted and merged through PR #200 at merge commit `2aa5931` on 2026-09-04. The record was
handed off as a local review-requested branch (report `.ai/worker-reports/LB-DS-STARTER-DRAFTS-15.md`:
branch `content/starter-drafts-15`, head `8010de7b`); the branch was then merged through PR #200.
Adds 15 Goethe-evidenced pending Start A1 drafts (Fenster, Zimmer, Uhr, Milch, Kaffee, Ei, Tee,
Stadt, Supermarkt, gehen, essen, trinken, groß, kalt, neu; status `needs_review`, `media: []`,
every review dimension pending) as a dedicated batch consumed only by the catalog-35 gate and
snapshot, with candidate-intake and provenance-ledger records; the seed-gate test expectations were
updated to the 35-draft union. The derived snapshot now records 35/35 drafted, 20 linguistically
reviewed, 0 release-approved, `seedable: false`, `publicationBlocked: true`; no DB seed, migration,
approval, media, auth or publication was merged. The 15 pending drafts still need product-owner
linguistic review and all remaining review dimensions before any ADR 0013 seed of
`cards`/`card_versions`. Do not reopen or duplicate this task.

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

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `30673a2` (NI-008 design merged through PR #126)
- Branch: docs/activate-lb-ds-015
- Merge commit: `cc0125a` (activation/queue docs PR #127 merged) and `d5b5fa0` (implementation PR #128 merged)
- Risk: security-sensitive-native-host-config
- Specification: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; docs/architecture/ADR/0011-native-mobile-session-and-transport.md
- Allowed paths: apps/mobile/android/app/src/main/AndroidManifest.xml; apps/mobile/lib/features/identity/mobile_preview_auth_config.dart; apps/mobile/test/android_network_permission_test.dart; apps/mobile/test/mobile_preview_auth_config_test.dart; apps/mobile/README.md; docs/architecture/OFFLINE_SYNC.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-015.md; CURRENT_WORK.md
- Required checks: dart format --output=none --set-exit-if-changed; cd apps/mobile && flutter analyze; cd apps/mobile && flutter test; cd apps/mobile && flutter build apk --debug; pnpm check; pnpm build; node scripts/validate-migrations.mjs; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Implement only NI-008A. Add Android INTERNET permission and immutable compile-time Preview origin/verification configuration. Defaults remain signed out/disabled; no endpoint, HTTP client, token/session composition, UI, provider, secret, deployment, Preview request, Production, background work or review-sync upload. Start with a failing test, stop at Draft PR for independent security review, and preserve all unrelated worktrees.

Accepted and merged 2026-08-26: activation/queue docs through PR #127 at merge commit `cc0125a`
(branch `docs/activate-lb-ds-015`), then the dormant NI-008A implementation through PR #128 at
merge commit `d5b5fa0` (branch `worker/lb-ds-015-native-preview-host-config`, head `88e63b2`).
Implementation added only the Android `INTERNET` permission, immutable compile-time
`LEARNBOX_MOBILE_PREVIEW_ORIGIN` / `LEARNBOX_MOBILE_PREVIEW_VERIFY_ENABLED` config seam with
direct config/manifest tests, and mobile/offline-sync docs; defaults stay signed out and disabled
and the config is fail-closed. No endpoint, HTTP client, token/session composition, UI, provider,
secret, deployment, Preview request, Production, background work or review-sync upload was added
or activated. Local `flutter build apk --debug` remains blocked by a Flutter embedding artifact
HTTP 403 from `storage.googleapis.com`; GitHub mobile CI completed the debug APK build
successfully and passed (`mobile`, `production-stack`, `quality`, `secrets`). Later serial NI-008
slices (auth client, UI, composition, Preview auth runtime) are recorded separately in this queue
(LB-DS-016/018/019/020). Do not reopen or duplicate this task.

## LB-DS-014

- Status: accepted
- Executor: high-reasoning-worker
- Base: main at `ffc403f` (S2 native audio QA evidence merged through PR #125)
- Branch: docs/lb-ds-014-native-preview-design
- Merge commit: `30673a2` (PR #126 merged)
- Risk: security-sensitive-native-auth-activation-design
- Specification: docs/superpowers/specs/2026-08-22-native-identity-authenticated-transport-design.md; docs/architecture/ADR/0011-native-mobile-session-and-transport.md; docs/operations/OTP_PROVIDER_ACTIVATION.md
- Allowed paths: docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-014.md; CURRENT_WORK.md
- Required checks: pnpm test:dashboard; pnpm verify:ai-worker-queue; pnpm verify:ai-continuity; pnpm format:check; git diff --check
- Simulator required: no
- Draft PR required: yes
- Merge allowed: yes

Owner authorized autonomous planning for future native Preview verification. This task is design-only and must preserve all current fail-closed behavior. It must specify later implementation as serial slices: native host transport permission and compile-time Preview endpoint selection; disabled-by-default native OTP/session composition; owner-entered device verification; rollback flags to false; then a separate owner authorization before any review-sync upload. No code, permission, endpoint, deployment, secret, provider call, Preview, Production, real OTP message, background work, UI activation or NI-009+ implementation is allowed in LB-DS-014.

Accepted and merged 2026-08-26 through PR #126 at merge commit `30673a2` (branch
`docs/lb-ds-014-native-preview-design`, head `950ad99`). Merged artifact:
`docs/superpowers/specs/2026-08-25-native-preview-auth-verification-design.md` plus this queue
registry, the LB-DS-014 report and `CURRENT_WORK.md`. Design-only; no code, permission, endpoint,
deployment, secret, provider call, Preview execution, Production, real OTP message, background
work or UI activation merged. The serial implementation slices defined by the design (NI-008A host
config, then client/UI/composition/runtime slices) are recorded separately in this queue
(LB-DS-015/016/018/019/020); a separate owner authorization remains required before any real
device verification or review-sync upload. Do not reopen or duplicate this task.

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
