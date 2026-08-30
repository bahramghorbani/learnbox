# LearnBox current work

**Scope:** only unfinished work on the current branch. Stable merged facts live in `PROJECT_STATE.md`; product truth lives in `docs/PRODUCT_STATUS.md`; milestone authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### Active milestone

- **M1 — Online Learning Core:** slice 1 QA complete; milestone remains **partial and not production-ready**.
- **D0/D1 design gates:** completed for current learner surfaces.
- **M1-A contract audit:** completed in PR #151.
- **M1-D slice 1:** completed in PR #152; server snapshot remains fail-closed and not Web-wired.
- **M1-B Web slice 1:** completed in PR #156; Today was explicitly local-only until the server wiring slice.
- **M1-B Web slice 2 (LB-DS-022):** merged in PR #163 at `73cdb62` (2026-08-30); ADR 0012 route `GET /api/learner/state` (cookie subject = canonical `users.id`) plus truthful Today fetch are on `main` behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime (defaults false). The actionable Today figure stays tied to the local bundled session until the Start Pack ↔ canonical `contentId` join exists.
- **M1-C Mobile slice 1:** completed in PR #155; Today local queue state is truthful, sync coordinator remains dormant.
- **M1-Q independent QA:** completed in PR #157; report `.ai/qa-reports/M1-Q-INDEPENDENT-QA.md`. Independent acceptance/visual/accessibility QA remains pending for the merged server-wired slice.
- **Next active work:** resolve the Start Pack ↔ canonical `contentId` catalog contract (unresolved, owner/review-gated), then design and implement M1-D push reconciliation only after its cursor/watermark policy is approved (blocked pending policy approval).

## Immediate execution order

1. Fix M-L1: add a Dart format gate and normalize the two reported drift files in a dedicated fix.
2. Fix M-L2/M-L3: align Web Today numerals and pending-sync parity, with tests.
3. Decide the Start-pack ↔ canonical `contentId` catalog contract; server `contentId` is authoritative and the local review path is unchanged until it is approved. Unresolved and owner/review-gated.
4. Implement the authenticated server-wired learner path completion and any remaining D1 fetch states.
5. Decide and implement M1-D push reconciliation only after cursor/watermark policy approval. Blocked pending policy approval.
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
