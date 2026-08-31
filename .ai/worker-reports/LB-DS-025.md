# LB-DS-025 worker report

- Branch: worker/m1d-event-cursor
- Base commit: 0057419 (origin/main, PR #171 merged)
- Head commit: 8549115 (feat(m1d): bind per-event reconciliation cursor in writeAtomically)
- Draft PR: pending after push (recorded on status flip to review_requested)
- Scope completed: Per-event reconciliation cursor binding (ADR 0014). Additive
  migration 0015 adds nullable `review_events.reconciliation_cursor BIGINT` with a
  non-negative check (`reconciliation_cursor IS NULL OR reconciliation_cursor >= 0`) and
  index `review_events_learner_cursor_idx` on `(user_id, reconciliation_cursor)` for
  learner+cursor reads. Legacy rows are NOT backfilled; NULL means "applied before 0015"
  and replays of legacy events coalesce to `'0'` (the pre-cursor default).
  `PostgresReviewEventStore.writeAtomically` now, after the atomic cursor advance
  (`advance_learner_reconciliation_cursor`), records the returned cursor on the newly
  claimed event in the same transaction (`UPDATE review_events SET
reconciliation_cursor = $2 WHERE id = $1` before COMMIT) and returns that exact event
  cursor as `reconciliationCursor`. Idempotent replay reads the cursor stored on the event
  (`COALESCE(e.reconciliation_cursor, 0) AS cursor`), never the current learner cursor;
  the `learner_reconciliation_cursors` join is removed from both event lookups. Conflicts,
  retries and missing-schedule paths never bump the learner cursor and never rebind the
  event cursor. No route, flag, auth, mobile, request-shape or batch-service behavior
  changed; network sync remains dormant.
- Files changed: database/migrations/0015_event_reconciliation_cursor.sql (new);
  apps/api/src/reviews/postgres-review-event.store.ts;
  apps/api/test/postgres-review-event.store.test.ts;
  apps/api/test/event-reconciliation-cursor-migration.test.ts (new);
  CURRENT_WORK.md; .ai/WORK_QUEUE.md; .ai/worker-reports/LB-DS-025.md (this file)
- Checks run: RED evidence captured first — `pnpm --filter @learnbox/api exec vitest run
test/event-reconciliation-cursor-migration.test.ts` failed 2/2 with
  `ENOENT: no such file or directory ... database/migrations/0015_event_reconciliation_cursor.sql`
  before implementation; focused suite GREEN after implementation —
  `vitest run test/event-reconciliation-cursor-migration.test.ts
test/postgres-review-event.store.test.ts` 13/13 passed; full API suite
  `pnpm --filter @learnbox/api test` 26 files / 114 tests passed;
  `pnpm --filter @learnbox/api typecheck` clean; `node scripts/validate-migrations.mjs`
  `Validated 15 migration(s).`; pnpm check; pnpm format:check (Prettier);
  pnpm verify:ai-worker-queue; pnpm verify:documentation-governance;
  pnpm verify:ai-continuity; git diff --check (results recorded after final run)
- Checks unavailable: none locally; no live PostgreSQL integration exists — all store
  behavior proven with mocked pg pool/client and SQL-string assertions only, no real DB.
- Remaining work: supervisor review of the Draft PR; after acceptance, subsequent serial
  M1-D slices (sending the stored cursor in a request; route/client flag enablement) as
  separately authorized queue tasks.
- Risks: NULL event cursors on legacy rows (pre-0015 events) report `'0'` on replay —
  documented, matches pre-cursor default, and legacy rows are intentionally not
  backfilled per the chosen path; the new per-event `UPDATE` adds one statement inside the
  existing transaction (rolls back atomically with the rest); the index on
  `(user_id, reconciliation_cursor)` is a small additive index on the append-only event
  table.
- Secrets or production changes: none. No secrets, credentials, real IDs, deployment,
  payment, OTP, Preview or production activation.
- Bobo canonical status: unchanged.
