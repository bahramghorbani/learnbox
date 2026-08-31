# LB-DS-024 — M1-D server read-side reconciliation cursor exposure

- Branch: `worker/m1d-cursor-read`
- Base commit: `246779d` (PR #170 client-side cursor capture/persistence merge)
- Head commit: `PENDING` (filled at push time)
- Draft PR: PENDING (filled at push time)
- Scope completed: read-side exposure of the authoritative per-learner reconciliation cursor (ADR 0014) in the learner-state snapshot and both `GET /api/learner/state` serializers; strict decimal-string client parsing; no request cursor, no sync activation.
- Files changed: `apps/api/src/learner-state/learner-state.service.ts`, `apps/api/src/learner-state/postgres-learner-state.repository.ts`, `apps/api/src/learner-state/learner-state-http.ts`, `apps/api/test/learner-state.service.test.ts`, `apps/api/test/learner-state-http.test.ts`, `apps/api/test/postgres-learner-state.repository.test.ts` (new), `apps/website/lib/learner-state-web-http.ts`, `apps/website/lib/learner-state-web-client.ts`, `apps/website/test/learner-state-web-http.test.ts`, `apps/website/test/learner-state-web-client.test.ts`, `apps/website/test/learner-today-server-states.test.tsx`, `CURRENT_WORK.md`, `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-024.md`.
- Checks run: focused API learner-state suites; focused Website learner-state suites; API/Website typecheck; `pnpm check`; `node scripts/validate-migrations.mjs`; `pnpm format:check`; `git diff --check`.
- Checks unavailable: none for the required gate; no mobile/simulator/release gate is required by this read-side slice.
- Remaining work: send the stored cursor in a future authenticated request contract; route/client flag enablement; network sync activation remains owner-gated.
- Risks: Web client now fails closed when the cursor field is absent or malformed (contract change); the API response contract gains one required field.
- Secrets or production changes: none; no credentials, endpoints, flags, auth, schema, migration, seed, deployment or production activation changed.
- Bobo canonical status: not affected.

- Status: review_requested
- Executor: subagent (W6, server read-side)
- Base: `main` at `246779d` (PR #170, client-side cursor capture/persistence merged)
- Branch: `worker/m1d-cursor-read`
- Risk: routine-offline-sync-read-boundary
- Specification: `docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md`;
  `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md` (appendix Slice 1b/1c)
- Allowed paths used: `apps/api/src/learner-state/**`;
  `apps/api/test/learner-state*.test.ts`; `apps/api/test/postgres-learner-state.repository.test.ts`;
  `apps/website/lib/learner-state-web-http.ts`; `apps/website/lib/learner-state-web-client.ts`;
  `apps/website/test/learner-state-web-http.test.ts`; `apps/website/test/learner-state-web-client.test.ts`;
  `apps/website/test/learner-today-server-states.test.tsx`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`
- Required checks: see below; all ran green locally.

## Scope

Server read-side cursor exposure only. No request cursor, no network sync
activation, no route/flag/default change, no mobile/auth/`main.dart`/
migration/seed/production change.

- `LearnerStateSnapshot` gains `reconciliationCursor: string` (decimal string,
  ADR 0014; `'0'` when no cursor row exists).
- `LearnerStateRepository` gains `readReconciliationCursor(userId)`; the
  PostgreSQL implementation reads `learner_reconciliation_cursors` with a
  parameterized `$1` user-scoped query, casts `cursor::text` (BIGINT-as-string,
  never a JS number) and defaults to `'0'` when no row exists.
- `LearnerStateService.readLearnerState` includes the cursor in the snapshot.
- Both serializers (API Bearer route `learner-state-http.ts` and Web cookie
  route `learner-state-web-http.ts`) expose `reconciliationCursor` in the
  existing `GET /api/learner/state` JSON body.
- The Web client (`learner-state-web-client.ts`) strictly requires the cursor as
  a non-negative decimal string (`/^(0|[1-9]\d*)$/`); missing, numeric,
  negative, fractional, scientific-notation or non-decimal values fail closed
  to `unavailable`, and values beyond `Number.MAX_SAFE_INTEGER` survive as
  strings.

## TDD evidence

- RED: new API assertions (service snapshot cursor, HTTP body cursor,
  repository query shape + `'0'` default) and Web assertions (HTTP body cursor,
  client strict decimal parsing) failed before implementation:
  - API: `Test Files 3 failed (3); Tests 3 failed | 4 passed (7)` — missing
    `reconciliationCursor` in serialized body and
    `TypeError: repository.readReconciliationCursor is not a function`.
  - Web: `Test Files 2 failed (2); Tests 9 failed | 29 passed (38)` — body
    missing `reconciliationCursor`, client rejecting cases returned `ok`
    instead of `unavailable`, and the large-cursor case failed.
- GREEN: all focused suites pass after implementation: API learner-state suites
  `11/11`; Web learner-state suites `48/48` (http 6, client 32, route 2,
  today-server-states 8).

## Check evidence

- `pnpm --filter @learnbox/learning-engine build` — OK (prerequisite for api types).
- `pnpm --filter @learnbox/api build` — OK.
- `pnpm --filter @learnbox/billing-core build` — OK (prerequisite for website tests).
- Focused API tests (`learner-state.service`, `learner-state-http`,
  `postgres-learner-state.repository`) — 11/11 passed.
- Focused Website tests (`learner-state-web-http`, `learner-state-web-client`,
  `learner-state-web-route`, `learner-today-server-states`) — 48/48 passed.
- `pnpm --filter @learnbox/api typecheck` — OK.
- `pnpm --filter @learnbox/website typecheck` — OK.
- `node scripts/validate-migrations.mjs` — OK (no migration changed).
- `pnpm format:check` — clean.
- `pnpm check` — repository-wide gate, all green (includes format/lint/
  typecheck/test/validators).
- `git diff --check` — clean.

## Checks unavailable

- None for the required gate. No mobile, simulator, emulator, APK or release
  build is required by this read-side slice.

## Remaining work

- Send the stored cursor with a request (separate slice; requires owner-approved
  activation of the authenticated sync boundary).
- Route/client flag enablement and network sync activation remain separate
  owner-gated tasks.
- Mobile cursor consumption of the server read (Flutter) is out of scope for
  this server read-side slice.

## Risks

- None new. The Web client contract now requires a valid decimal-string
  `reconciliationCursor`; the fixture bodies in the route/UI tests were updated
  accordingly and the full focused suites pass.
- BIGINT is never widened to a JS number anywhere in this slice (repository
  casts to text, client validates and carries the string).

## Secrets or production changes

- None. No secret, credential, endpoint, provider, flag, deployment or
  production activation touched.

## Bobo canonical status

- Not affected.
