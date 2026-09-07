# LearnBox current work

**Scope:** only unfinished work on the current branch. Stable merged facts live in `PROJECT_STATE.md`; product truth lives in `docs/PRODUCT_STATUS.md`; milestone authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### M1-D sync readiness boundary

- Cursor/persistence foundations and the wire contract are merged and documented. Owner decisions O-1/O-2 are approved: conflicts remain pending and require a new event ID after resolution; M1 acknowledgement is strict one-step after atomic application. The reconciliation GET from PR #209 remains **dormant and fail-closed**; LB-DS-033 completed its API/security review and hardening in PR #219 at `82afe3b`. A separate client-composition/activation decision remains required.

### LB-DS-029 — dormant reconciliation read implementation

- **Status:** accepted and merged in PR #209 at `14ccaee` from `feature/m1d-reconciliation-read-direct`. The read-only GET handler, runtime boundary, route, and per-event cursor query are present and verified behind the existing disabled sync flag. No activation or migration is included.
- **Dependency:** security/contract review and hardening completed in PR #219; a separate
  activation/composition decision remains. Client/network sync is dormant.

### Active milestone

- **M1 — Online Learning Core:** slice 1 QA complete; milestone remains **partial and not production-ready**.
- **Learner Web review-session accessibility (LB-DS-034):** accepted and merged in PR #221 at
  `e7069b8`; keyboard focus is restored only when a review-stage transition removes the active
  control, covering start, flip, grade, completion and return. No server boundary changed.
- **Learner Web Words source filters (LB-DS-035):** accepted and merged in PR #223 at `bd44915`;
  accessible all/official/personal filtering composes with search, truthful visible counts and
  clear-search focus recovery. Android/server-backed parity remains incomplete.
- **Android Words offline search (LB-DS-036):** accepted and merged in PR #225 at `6efc2df`;
  German/Persian filtering, official visible counts, truthful no-result recovery and focus return
  are verified over bundled content.
- **Android device-local personal vocabulary (LB-DS-037):** implementation committed at `9f23c72`; follow-up hardening is pending commit after independent review found corrupt-payload truthfulness, storage-invariant, overlapping-retry and responsive-coverage gaps. Secure storage now fails closed on corrupt/oversized/duplicate/canonical-colliding records, the 30-record cap is enforced in storage and UI, retry completions are generation-bound, and search keeps local errors/retry visible. Full Flutter `193/193`, analyze and debug APK pass locally. Server acknowledgement and cross-device sync are not claimed and remain separately gated.
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
    event-stored cursor, never the current learner cursor); request cursor serialization merged in
    PR #184, the dormant reconciliation GET merged in PR #209, and its cursor/page security
    hardening merged in PR #219. Route/client flag enablement and client composition remain a
    separate serial, review-gated M1-D task; milestone stays partial/not production-ready.
- **M1-D route request-boundary integration (Slice 1d):** completed in PR #192 at merge
  commit `9c6c5e0` (2026-09-04): the dormant website `POST /api/reviews/mobile` boundary
  (`apps/website/lib/mobile-review-http.ts`) now calls the existing strict
  `parseMobileReviewBatchRequest` (`apps/api/dist/reviews/mobile-review-batch.request.js`)
  instead of a duplicated inline parser: optional decimal-string `reconciliationCursor` is
  accepted but never forwarded, duplicate `clientEventId`s and malformed cursor/items are
  rejected as 400 `validation` before `submit`, `userId` still comes only from the verified
  token. `MOBILE_REVIEW_SYNC_ENABLED` stays false/unset; route and runtime unchanged; network
  sync remains dormant. See `.ai/worker-reports/LB-DS-M1D-ROUTE-INTEGRATION.md` and
  `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md` (appendix Slice 1d).
- **M1-B Web slice 1:** completed in PR #156; Today was explicitly local-only until the server wiring slice.
- **M1-B Web slice 2 (LB-DS-022):** merged in PR #163 at `73cdb62` (2026-08-30); ADR 0012 route `GET /api/learner/state` (cookie subject = canonical `users.id`) plus truthful Today fetch are on `main` behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime (defaults false). The actionable Today figure stays tied to the local bundled session until the approved/published Start Pack seed/catalog rows are implemented and released (the Start Pack ↔ canonical `contentId` contract itself is recorded in ADR 0013; seed/catalog implementation remains a separate review-gated task).
- **Web learner-loop connectivity slice:** completed in PR #194 at merge commit `ab09dbd` (2026-09-04): Today's server-read label now tracks browser connectivity — an `offline` event drops the label to `offline`, an `online` event re-reads `GET /api/learner/state` (same fail-closed route/client, no reload). Device-local figure/copy and the no-acknowledgement rule are unchanged; regression tests added in `apps/website/test/learner-today-server-states.test.tsx`. Blocker unchanged: server-backed Today figures still require the reviewed Starter catalog seed decision.
- **Learner Web server-read error retry:** completed in PR #198 at merge commit `b5ba321` (2026-09-04). Today's failed `GET /api/learner/state` read (D1 §5 + ADR 0012 error state: inline banner with retry) now offers a «تلاش دوباره» button on the Today surface. Retry re-enters the loading state and re-reads through the existing fail-closed `fetchWebLearnerState` client; the server-read label returns only after a successful parsed read, and error/offline/unauthorized mapping is shared between the mount/online re-read and the retry path. Regression test in `apps/website/test/learner-today-server-states.test.tsx` (11 tests). No route, API, schema, migration, flag, seed or auth change.
- **M1-C Mobile slice 1:** completed in PR #155; Today local queue state is truthful, sync coordinator remains dormant.
- **M1-Q independent QA:** completed in PR #157; the current server-wired follow-up QA is recorded in `.ai/qa-reports/M1-Q3-CURRENT-WEB-SERVER-WIRED.md` and merged in PR #175. Functional checks are green; browser visual/AX/keyboard acceptance is not claimed — it can be verified only against a staging deployment running the current merged build (staging is not confirmed current; the Chrome permission dialog blocker also remains).
- **Starter Catalog 35 slice (ADR 0016):** completed in PR #193 at merge commit `73adc02` (2026-09-04; official free starter target reduced to ~35 words); the missing 15 pending drafts merged in PR #200 at `2aa5931` (LB-DS-STARTER-DRAFTS-15). Fail-closed catalog slice implemented: derived snapshot `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json` now records 35/35 drafted, 35 linguistically reviewed (product-owner confirmations 2026-07-27 for the original 20 and 2026-09-04 for the 15 pending drafts, both covering only german_linguistic and persian_translation), 0 release-approved (`seedable: false`, `publicationBlocked: true`), reusable seed gate `apps/api/src/catalog/start-catalog-seed-gate.ts` with tests, no migration and no publication. DB seeding stays blocked: ADR 0013 requires approved/published `card_versions`, and all remaining review dimensions still apply.
- **Next active work:** M1-D push reconciliation cursor/watermark policy is approved in
  ADR 0014 (per-learner monotonic version, incremented only on newly applied events,
  committed in the same transaction as event and schedule update); the server-core
  implementation merged in PR #169, the client-side cursor capture/persistence merged in
  PR #170, the read-side cursor exposure in `GET /api/learner/state` merged in PR #171
  (LB-DS-024, merge commit `0057419`), and the per-event cursor binding merged in PR #172
  (LB-DS-025, merge commit `caa3a39`); sending the
  stored cursor in a request merged in PR #184, the dormant reconciliation GET merged in PR #209,
  and its cursor/page security hardening merged in PR #219; route/client flag enablement and client
  composition remain a separate serial, review-gated M1-D queue task. The server request-boundary
  parser is covered by `apps/api/src/reviews/mobile-review-batch.request.ts`; seed/catalog
  implementation remains a separate review-gated task.

- **M2 Admin content-operations truthful review-preview slice:** completed in PR #195 at merge commit `229708a` (2026-09-04). The preview card, media
  state, provenance and review queue are derived from the committed Start Pack drafts
  (`content/packs/learnbox-start`); fabricated review claims (passed validation list, media-ready
  checks, `۹۲٪` model confidence, demo example `Das Haus ist groß.`) were removed. Unreviewed
  drafts always show pending gates and absent media; approve/return buttons only flip a local
  preview label; the six-dimensional gate, the 35-draft/0-release-approved queue and the release
  panel remain publication-blocked, and the ADR 0016 seed gate stays untouched. Admin owner
  bootstrap, canonical-user binding, `super_admin` role assignment and Passkey sign-in are now
  verified on staging; the workspace still reads committed local drafts and performs no database
  review writes. No seed or publication is enabled.
- **Start Pack 35-target pending drafts (LB-DS-STARTER-DRAFTS-15):** merged in PR #200 at merge
  commit `2aa5931` (2026-09-04; branch `content/starter-drafts-15`). The 15 target drafts (Fenster,
  Zimmer, Uhr, Milch, Kaffee, Ei, Tee, Stadt, Supermarkt, gehen, essen, trinken, groß, kalt, neu)
  are Goethe-evidenced editorial-queue items in
  `content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json` with matching
  candidate intake and provenance-ledger records; product-owner linguistic approval for all 15
  (german_linguistic and persian_translation only) was recorded on 2026-09-04 in
  `validation/start-a1-slice-linguistic-approval.json` (`product-owner-confirmation-2026-09-04`).
  The ADR 0016 catalog snapshot records 35/35 drafted, 35 linguistically reviewed, 0
  release-approved (`seedable: false`, `publicationBlocked: true`). The 15 still need all other
  review dimensions and release-approved `card_versions` before any ADR 0013 seed; no media,
  migration or publication merged.

## Immediate execution order

1. Admin owner bootstrap, canonical `users.id` binding, `super_admin` role assignment and Passkey sign-in are verified on staging. The current follow-up keeps the workspace truthful: authenticated staging is distinguished from local-prototype mode, all 35 committed drafts appear, and review actions remain local-only. Server-backed review reads/writes require a separate reviewed route/activation slice.
2. Start Pack ↔ canonical `contentId` contract is recorded in ADR 0013 and the bounded 35-item catalog/draft slice is merged (PRs #193 and #200); release-approved `card_versions` and all remaining review dimensions are required before seed/publication.
3. Implement the authenticated server-wired learner path completion and any remaining D1 fetch states.
4. Complete the separately review-gated M1-D push reconciliation activation/composition work. The cursor/watermark policy is approved in
   ADR 0014; server-core (PR #169), client-side cursor capture/persistence (PR #170),
   read-side cursor exposure (PR #171/LB-DS-024) and per-event cursor binding (PR #172/LB-DS-025)
   are merged, as are request serialization (PR #184) and the dormant review POST route
   request-boundary parser integration, Slice 1d (PR #192 at `9c6c5e0`); network sync remains
   dormant. The reconciliation GET and its hardened delta-response semantics are merged in PRs
   #209 and #219; flag enablement and client composition remain separate review-gated tasks.
5. Re-run browser visual and accessibility QA only against a staging deployment running the current merged build (staging is not confirmed current); the Chrome permission blocker must also be cleared. Do not treat the current functional QA as visual acceptance.

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
