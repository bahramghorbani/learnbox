# LB-DS-049 — Admin persisted Start Pack review (PDR-008 slice)

- Branch: `feature/admin-starter-review-persistence-clean`
- Base commit: `dc92fe2fbf1381bb98dcf8a81f7f11079252d785` (`origin/main`; PR #250 scope authorization plus merged PR #253 dependency-security prerequisite)
- Head commit: `46f51154d65c6288ef423a37b21294be84f37806` (implementation snapshot; report-only delta follows)
- Draft PR: #252 — https://github.com/bahramghorbani/learnbox/pull/252 (draft; replaces closed, unmerged PR #251)
- Scope completed: migration 0017 candidate ingestion; default-off Admin queue/check/decision runtime behind `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED`; moved extended store into the Admin runtime; server-truthful workspace with labeled local-only mode; strict RED→GREEN tests; migration validation incl. real-Postgres apply/idempotency/fail-closed smoke; obsolete dormant API copy removed.
- Files changed:
  - added `database/migrations/0017_start_catalog_review_candidates.sql`
  - added `apps/admin/lib/server/postgres-content-review-store.ts`, `apps/admin/lib/server/admin-content-review-config.ts`, `apps/admin/lib/server/admin-content-review-routes.ts`, `apps/admin/lib/server/admin-content-review-server.ts`
  - added `apps/admin/app/api/content/review/route.ts`, `apps/admin/app/api/content/review/check/route.ts`, `apps/admin/app/api/content/review/decision/route.ts`
  - added `apps/admin/test/postgres-content-review-store.test.ts`, `apps/admin/test/admin-content-review-routes.test.ts`
  - modified `apps/admin/app/components/ContentReviewWorkspace.tsx`, `apps/admin/test/content-review-workspace.test.tsx`
  - modified `scripts/validate-migrations.mjs`
  - deleted `apps/api/src/admin/postgres-content-review.store.ts`, `apps/api/test/postgres-content-review.store.test.ts` (obsolete dormant copy, no runtime consumer; extended implementation now lives in the Admin runtime)
  - docs/status: `.ai/WORK_QUEUE.md`, `CURRENT_WORK.md`, `PROJECT_STATE.md`, `docs/PRODUCT_STATUS.md`, `docs/design/DESIGN_STATUS.md`, `docs/architecture/ADR/0016-starter-catalog-35-seed-gate.md`, `docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md`, `.ai/worker-reports/LB-DS-049.md`
- Checks run: see "Final checks" below; every item executed locally with recorded output.
- Checks unavailable: browser visual/AX keyboard acceptance (no staging deployment is current; out of scope by design); real Preview/Production execution (explicitly excluded); independent re-review of clean draft PR #252 (pending, as required by the queue).
- Remaining work: independently review PR #252 and wait for all required GitHub checks; owner decision to execute migration 0017 in an environment; owner decision to enable `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED`; staging deployment of the merged build; a human reviewer attesting each dimension; separate seed/publication gate remains blocked per ADR 0016.
- Risks: security-sensitive Admin writes (mitigated: default-off flag, 404-before-read, session-only actor, DB role check before data access, trusted origin + CSRF + recent auth, row locks, idempotency fail-closed, atomic audit, no publication path); content-data migration (mitigated: deterministic uuid5 identities, faithful embedded draft content, fail-closed guards, additive schema only, validated against a real ephemeral Postgres).
- Secrets or production changes: none. No secrets touched, no environment/deployment/staging/Preview/Production configuration changed, flag left off, migration not executed outside an ephemeral local container.
- Bobo canonical status: unchanged. No Bobo assets, generation, prompts or visual content were added or modified; drafts embed their committed `visualConcept`/`imagePrompt` text only as immutable candidate content.

## What was built

1. **Migration 0017** inserts exactly the 35 committed drafts (`start-a1-vertical-slice-drafts.json` 20 + `start-a1-catalog-35-pending-drafts.json` 15) as canonical `cards` rows (`content_id`, fixed uuid5 `id`, committed lemma) and immutable version-1 `card_versions` rows (`status='needs_review'`, `content_json` = the committed draft item verbatim, `source_provider`/`source_reference` from the draft `source`), plus exactly six pending `content_review_checks` per candidate with fixed uuid5 ids and check keys. No decision row, no reviewer attribution, no passed/failed outcome and no approved/published value is written anywhere. The only additive schema change is `content_review_checks.idempotency_key UUID` (partial unique index), needed for check-write idempotency. Content fidelity: both source files' SHA-256 are anchored in the migration header and recomputed by the validator and by the vitest contract tests.
2. **Fail-closed rerun semantics.** The migration builds a temp candidate working set, runs guard loops that `RAISE EXCEPTION '0017 fail-closed: ...'` whenever an existing `cards`/`card_versions`/`content_review_checks` row diverges from the committed baseline (different identity, lemma, status, content_json, reviewer/notes/idempotency state, or an extra/advanced version), then inserts only rows that are absent (`WHERE NOT EXISTS`). Identical reruns are no-ops; divergent data aborts the whole migration transaction.
3. **Admin runtime (moved + extended store).** `PostgresContentReviewStore` (now `apps/admin/lib/server/postgres-content-review-store.ts`) keeps the dormant store's transaction shape and hardens it:
   - `listReviewQueue(actor)` — DB role check (`content_reviewer`/`super_admin` from `admin_role_assignments`) executes before any review-data read; no role → `forbidden` (route answers 404, indistinguishable from missing); otherwise returns strictly mapped queue rows with persisted checks.
   - `recordCheck(actor, …)` — validates actor/dimension/outcome/notes/idempotency-key; transaction: role check → `SELECT … FOR UPDATE` version lock → reviewable-status check → existing check row locked; pending baseline rows are updated to a passed/failed verdict with reviewer, notes, `reviewed_at` and idempotency key; a replay with the same key and outcome returns `idempotent` with no write; any divergence or cross-target unique-key collision returns `conflict`; audit row written atomically. Only the six fixed dimensions and `passed`/`failed` are accepted. Never touches `card_versions.status`.
   - `submitDecision(…)` — approve requires all six checks `passed` (else `review_incomplete` with pending dimensions); `approve`→`approved`, `reject`→`rejected`, `return_for_revision`→`needs_review` and atomically resets all six attestations to `pending` so a later approval requires fresh review; decision-key replay is `idempotent` only for the same version+action, otherwise `conflict`; version locked, decision + status/check update + audit atomic; never `published`.
4. **Default-off runtime and routes.** `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` must equal `true` AND the Passkey auth runtime must be enabled; otherwise the server factory returns `disabled` before creating a pool, and each Next route answers 404 before any session/DB review access. Queue GET: session (canonical `users.id` via the owner binding) → role → `no-store` JSON. Check/decision POST: trusted origin + `application/json` → session → CSRF → recent auth (428) → strict body parsing (uuid targets, six dimensions, `passed`/`failed`, bounded notes, `approve`/`reject`/`return_for_revision`) → uuid idempotency/decision key → mapped results (200 applied/idempotent, 409 conflict/not_reviewable/review_incomplete, 404 forbidden/not-found, 400 malformed).
5. **UI.** Authenticated mode fetches the real queue and submits check/decision mutations with the session CSRF cookie and per-attempt idempotency keys, re-reading the queue after each persisted mutation; loading / unauthorized / disabled / empty / error+retry / submitting / persisted-success / idempotent-replay / conflict / reauth states are Persian-first (`role="status"`, `aria-live`). A 404 (runtime off/unconfigured) keeps the explicitly labeled local-only preview; local prototype actions never carry a persisted label. Approve is only enabled once the server queue shows all six checks passed (server still re-gates). No unrelated Admin UI was redesigned.

## Strict RED → GREEN evidence

Each cycle: focused failing test first, observed RED, then minimal code, observed GREEN.

### Cycle 1 — migration validator (scripts/validate-migrations.mjs)

- RED: `mv database/migrations/0017… /tmp` then `node scripts/validate-migrations.mjs` → `Validated 16 migration(s).` then `Error: 0017_start_catalog_review_candidates.sql is required.` (exit 1).
- GREEN: file restored → `Validated 17 migration(s).` + `Validated 0017 review-candidate migration determinism and fail-closed guards.` (exit 0).
- Real Postgres smoke (ephemeral `postgres:16-alpine` container, all migrations 0001→0017 in order): `cards=35, cv=35, needs_review=35, checks=210, pending_checks=210, decisions=0`; identical rerun of 0017 → no-op success; divergent rerun after `UPDATE card_versions SET status='approved'` for `start-a1-haus` → `ERROR: 0017 fail-closed: card_versions row for start-a1-haus diverges from committed needs_review baseline` (fail closed, transaction aborted). Container removed after evidence.

### Cycle 2 — 0017 migration contract (vitest)

- RED: `apps/admin/test/postgres-content-review-store.test.ts` phase 1 (contract suite only), migration file moved away → `Test Files 1 failed / Tests 5 failed (5)` (ENOENT on the migration).
- GREEN: file restored → `Test Files 1 passed / Tests 5 passed`.

### Cycle 3 — Admin store

- RED: store test phase 2 (contract + store suites) before `postgres-content-review-store.ts` existed → `Error: Cannot find module '../lib/server/postgres-content-review-store.js'` (`Test Files 1 failed / Tests no tests`).
- GREEN after implementing the store → iterations fixed test-mock SQL matchers and ROLLBACK assertions; final `Tests 20 passed (20)`.

### Cycle 4 — route security boundary

- RED: `apps/admin/test/admin-content-review-routes.test.ts` before the routes module existed → module-not-found failure.
- GREEN after implementing config/routes/server: one iteration corrected the request helper clobbering the untrusted `origin` header and the decision-store signature; final `Tests 14 passed (14)` (queue 404-before-access, 401 no-store, role-less 404, 503; check origin/CSRF/428/200/409/404/400; decision disabled/apply/incomplete/reject/return/malformed).

### Cycle 5 — workspace UI states

- RED: server-mode suites added to `content-review-workspace.test.tsx` → first run `Tests 6 failed | 6 passed (12)`; failures were genuine: jsdom rejects `__Host-` cookies (CSRF read stubbed like the existing splash UI tests), the approve action could not fire while a check was pending (test premise corrected to a concurrent-change scenario), and a stale `text` snapshot (fixed with a live getter).
- GREEN: `Test Files 1 passed / Tests 12 passed (12)` — local-only mode unchanged (3 legacy tests) plus loading/disabled-fallback/unauthorized/error-retry/queue+gate+approve-gating/check submit+refresh/conflict/review_incomplete/approve-after-six/idempotent-replay/return.

### Cycle 6 — API deletion stays green

- Deleted `apps/api/src/admin/postgres-content-review.store.ts` + its test after the move; full API suite: `Test Files 30 passed / Tests 134 passed (134)`.

### Clean-snapshot hardening after PR #251 review

- Replaced the mislabeled MD5 helper with RFC uuid5 SHA-1 and pinned a known deterministic output in the store test.
- Removed scanner-triggering UUID/comment syntax without adding an allowlist, bypass or secret-scanner exception.
- Fixed all three CI lint findings from PR #251.
- A `return_for_revision` decision now atomically resets every persisted dimension to `pending`; a later approval therefore requires fresh attestations.
- Cross-target idempotency-key uniqueness collisions map to a truthful `conflict`, and the client discards stale keys after conflict responses while retaining keys for transport retries.

## Final checks

- Migration validation: `node scripts/validate-migrations.mjs` → `Validated 17 migration(s).` + 0017 deep validation OK.
- Real-Postgres migration apply + idempotent rerun + divergent fail-closed: OK (evidence in Cycle 1).
- Focused tests: store+routes `35 passed (35)`; workspace `12 passed (12)`; migration contract `5 passed (5)` (inside store file).
- Full Admin tests: `Test Files 28 passed / Tests 166 passed (166)`.
- Full API tests: `Test Files 30 passed / Tests 134 passed (134)`.
- Admin typecheck `tsc --noEmit`: pass. API typecheck: pass.
- Admin production build (`next build` incl. ESLint type check): `✓ Compiled successfully`; API build (`tsc -p tsconfig.json`): pass.
- `pnpm test:dashboard`: pass. `node --test scripts/validate-ai-worker-queue.test.mjs`: pass. `node --test scripts/validate-documentation-governance.test.mjs`: pass.
- `node scripts/validate-ai-continuity.mjs` → `AI_CONTINUITY_OK`; `node scripts/validate-documentation-governance.mjs` → `DOCUMENTATION_GOVERNANCE_OK documents=6`.
- Prettier: `pnpm exec prettier --check .` → `All matched files use Prettier code style!`
- `git diff --check`: clean.
- No staging/Preview/Production configuration, no migration execution outside the ephemeral container, no publication, no learner-path change, no dependency/provider/secret change; `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` remains unset (default-off).
