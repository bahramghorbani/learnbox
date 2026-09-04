# LearnBox current work

**Scope:** only unfinished work on the current branch. Stable merged facts live in `PROJECT_STATE.md`; product truth lives in `docs/PRODUCT_STATUS.md`; milestone authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### Active milestone

- **M1 — Online Learning Core:** slice 1 QA complete; milestone remains **partial and not production-ready**.
- **D0/D1 design gates:** completed for current learner surfaces.
- **M1-A contract audit:** completed in PR #151.
- **M1-D slice 1:** completed in PR #152; server snapshot remains fail-closed and not Web-wired.
- **M1-D cursor slice (ADR 0014):** server-core implementation **merged** in PR #169 at
  `9ff7c99` (migration 0014 + atomic cursor advance in `PostgresReviewEventStore.writeAtomically`
  - cursor on acknowledged batch outcomes); client-side cursor capture/persistence for the
    dormant foreground sync boundary merged in PR #170 at `246779d` (strict transport parse,
    `ReconciliationCursorStore`, coordinator persistence, and optional request cursor serialization
    — network sync remains disabled); the read-side cursor exposure slice (LB-DS-024) **merged** in PR #171 at
    `0057419` (snapshot contract + Web `GET /api/learner/state` now serialize the authoritative
    per-learner cursor as a decimal string from `learner_reconciliation_cursors`, default `'0'`,
    BIGINT-as-string throughout); the per-event cursor binding slice (LB-DS-025) **merged** in
    PR #172 at `caa3a39` (migration 0015 adds nullable `review_events.reconciliation_cursor`
    with a non-negative check and a `(user_id, reconciliation_cursor)` index, no legacy
    backfill; `writeAtomically` records the returned cursor on the newly claimed event in the
    same transaction and returns that exact event cursor; idempotent replay returns the
    event-stored cursor, never the current learner cursor); sending the cursor in a request and
    route/client flag enablement remain separate serial, review-gated M1-D tasks; the documented
    M1-D wire contract covers the snapshot only (no delta endpoint exists; `reviewEventsCount`
    is not a delta), and wire-contract/delta-endpoint work remains separate review-gated;
    milestone stays partial/not production-ready.
- **M1-B Web slice 1:** completed in PR #156; Today was explicitly local-only until the server wiring slice.
- **M1-B Web slice 2 (LB-DS-022):** merged in PR #163 at `73cdb62` (2026-08-30); ADR 0012 route `GET /api/learner/state` (cookie subject = canonical `users.id`) plus truthful Today fetch are on `main` behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime (defaults false). The actionable Today figure stays tied to the local bundled session until the approved/published Start Pack seed/catalog rows are implemented and released (the Start Pack ↔ canonical `contentId` contract itself is recorded in ADR 0013; seed/catalog implementation remains a separate review-gated task).
- **M1-C Mobile slice 1:** completed in PR #155; Today local queue state is truthful, sync coordinator remains dormant.
- **M1-Q independent QA:** completed in PR #157; the current server-wired follow-up QA is recorded in `.ai/qa-reports/M1-Q3-CURRENT-WEB-SERVER-WIRED.md` and merged in PR #175. Functional checks are green; browser visual/AX/keyboard acceptance remains blocked by the Chrome permission dialog and is not claimed.
- **Next active work:** M1-D push reconciliation cursor/watermark policy is approved in
  ADR 0014 (per-learner monotonic version, incremented only on newly applied events,
  committed in the same transaction as event and schedule update); the server-core
  implementation merged in PR #169, the client-side cursor capture/persistence merged in
  PR #170, the read-side cursor exposure in `GET /api/learner/state` merged in PR #171
  (LB-DS-024, merge commit `0057419`), and the per-event cursor binding merged in PR #172
  (LB-DS-025, merge commit `caa3a39`); sending the
  stored cursor in a request and route/client flag enablement remain separate serial,
  review-gated M1-D queue tasks; the server request-boundary parser is now covered by
  `apps/api/src/reviews/mobile-review-batch.request.ts`; the documented M1-D wire contract remains snapshot-only
  (no delta endpoint exists), so wire-contract/delta-endpoint work remains separate
  review-gated; seed/catalog implementation remains a separate
  review-gated task.

## Immediate execution order

1. Complete the Admin session → canonical `users.id` binding: migration `0016`, session lookup, and the one-shot server-side binding operation are implemented in the current worktree; owner bootstrap, role assignment and staging verification remain gated. ADR 0015 records the fail-closed boundary.
2. Start Pack ↔ canonical `contentId` contract is decided and recorded in ADR 0013; implement the seed/catalog slice as a separate review-gated task.
3. Implement the authenticated server-wired learner path completion and any remaining D1 fetch states.
4. Decide and implement M1-D push reconciliation. The cursor/watermark policy is approved in
   ADR 0014; server-core (PR #169), client-side cursor capture/persistence (PR #170),
   read-side cursor exposure (PR #171/LB-DS-024) and per-event cursor binding (PR #172/LB-DS-025)
   are merged; sending the cursor in a request and flag enablement remain
   separate review-gated tasks. Client transport serialization now accepts and sends the stored
   valid decimal-string cursor without enabling production sync; server request parsing and route
   integration remain separate review-gated tasks.
5. Re-run browser visual and accessibility QA when the Chrome permission blocker is cleared; do not treat the current functional QA as visual acceptance.

## Owner-approved product decisions captured in M0

- `learnboxapp.com` is an independent informational landing site.
- LearnBox is online-first and offline-tolerant, with durable pending review events and reconnect sync.
- The free app includes approximately 35 complete A1 German words.
- Premium packs are complete vocabulary products generated with AI assistance and human review.
- Web uses a direct bank gateway; Android uses Cafe Bazaar in-app billing; iOS uses Apple In-App Purchase.
- Platform offers may have different prices/product IDs but map to shared backend entitlements.
- Users can add personal words with duplicate checks.
- Splash, profile, settings, progress, purchases and general account features are real product scope.

## Completion rule

After the M0 PR merges, update this file to the next active milestone and remove the branch-specific M0 note. Never leave merged branches or completed tasks listed as active.
