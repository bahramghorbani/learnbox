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
    dormant foreground sync boundary merged in PR #170 at `c8b8dfd` (strict transport parse,
    `ReconciliationCursorStore`, coordinator persistence — **no request cursor yet, network sync
    remains disabled**); the read-side cursor exposure slice (LB-DS-024) is **in review** on
    branch `worker/m1d-cursor-read` from `main` at `246779d` (snapshot contract + Web
    `GET /api/learner/state` now serialize the authoritative per-learner cursor as a decimal
    string from `learner_reconciliation_cursors`, default `'0'`, BIGINT-as-string throughout);
    the per-event cursor binding slice (LB-DS-025) is **in progress** on branch
    `worker/m1d-event-cursor` from `main` at `0057419` (migration 0015 adds nullable
    `review_events.reconciliation_cursor` with a non-negative check and a
    `(user_id, reconciliation_cursor)` index, no legacy backfill; `writeAtomically` records the
    returned cursor on the newly claimed event in the same transaction and returns that exact
    event cursor; idempotent replay returns the event-stored cursor, never the current learner
    cursor); sending the cursor in a request and route/client flag enablement remain separate
    serial M1-D tasks; milestone stays partial/not production-ready.
- **M1-B Web slice 1:** completed in PR #156; Today was explicitly local-only until the server wiring slice.
- **M1-B Web slice 2 (LB-DS-022):** merged in PR #163 at `73cdb62` (2026-08-30); ADR 0012 route `GET /api/learner/state` (cookie subject = canonical `users.id`) plus truthful Today fetch are on `main` behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime (defaults false). The actionable Today figure stays tied to the local bundled session until the approved/published Start Pack seed/catalog rows are implemented and released (the Start Pack ↔ canonical `contentId` contract itself is recorded in ADR 0013; seed/catalog implementation remains a separate review-gated task).
- **M1-C Mobile slice 1:** completed in PR #155; Today local queue state is truthful, sync coordinator remains dormant.
- **M1-Q independent QA:** completed in PR #157; report `.ai/qa-reports/M1-Q-INDEPENDENT-QA.md`. Independent acceptance/visual/accessibility QA remains pending for the merged server-wired slice.
- **Next active work:** M1-D push reconciliation cursor/watermark policy is approved in
  ADR 0014 (per-learner monotonic version, incremented only on newly applied events,
  committed in the same transaction as event and schedule update); the server-core
  implementation merged in PR #169, the client-side cursor capture/persistence merged in
  PR #170, the read-side cursor exposure in `GET /api/learner/state` is in review in
  LB-DS-024, and the per-event cursor binding is in progress in LB-DS-025 (migration 0015 +
  `writeAtomically` event-cursor binding, branch `worker/m1d-event-cursor`); sending the
  stored cursor in a request and route/client flag enablement remain separate serial,
  review-gated M1-D queue tasks; seed/catalog implementation remains a separate
  review-gated task.

## Immediate execution order

1. Fix M-L1: add a Dart format gate and normalize the two reported drift files in a dedicated fix.
2. Fix M-L2/M-L3: align Web Today numerals and pending-sync parity, with tests.
3. Start Pack ↔ canonical `contentId` contract is decided and recorded in ADR 0013; seed/catalog implementation remains a separate review-gated task.
4. Implement the authenticated server-wired learner path completion and any remaining D1 fetch states.
5. Decide and implement M1-D push reconciliation. The cursor/watermark policy is approved in
   ADR 0014; server-core (PR #169) and client-side cursor capture/persistence (PR #170) are
   merged, the read-side cursor exposure in `GET /api/learner/state` is in review in LB-DS-024,
   and the per-event cursor binding is in progress in LB-DS-025 (branch
   `worker/m1d-event-cursor`); sending the cursor in a request and flag enablement remain
   separate review-gated tasks.
6. Re-run M1-Q independent acceptance, visual and accessibility QA against the merged server-wired slice (PR #163).

## Owner-approved product decisions captured in M0

- `learnboxapp.com` is an independent informational landing site.
- LearnBox is online-first and offline-tolerant, with durable pending review events and reconnect sync.
- The free app includes approximately 350 complete A1 German words.
- Premium packs are complete vocabulary products generated with AI assistance and human review.
- Web uses a direct bank gateway; Android uses Cafe Bazaar in-app billing; iOS uses Apple In-App Purchase.
- Platform offers may have different prices/product IDs but map to shared backend entitlements.
- Users can add personal words with duplicate checks.
- Splash, profile, settings, progress, purchases and general account features are real product scope.

## Completion rule

After the M0 PR merges, update this file to the next active milestone and remove the branch-specific M0 note. Never leave merged branches or completed tasks listed as active.
