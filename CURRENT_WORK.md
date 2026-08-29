# LearnBox current work

**Scope:** only unfinished work on the current branch. Stable merged facts live in `PROJECT_STATE.md`; product truth lives in `docs/PRODUCT_STATUS.md`; milestone authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### Active milestone

- **M1 — Online Learning Core:** active after owner approval.
- **D0/D1 design gates:** completed for the current learner implementation surfaces (D0 PR #150, D1 PR #153).
- **M1-A contract audit:** completed in PR #151.
- **M1-D slice 1:** completed in PR #152; learner state snapshot exists behind fail-closed configuration and is not Web-wired yet.
- **Next active implementation:** M1-B Web learner core and M1-C Mobile learner core, each in a separate worktree.
- No production, payment, provider credential, real OTP or server activation is implied by starting these slices.

## Immediate execution order

1. M1-B Web learner core: wire the authenticated learner state/read and review flow without inventing endpoints.
2. M1-C Mobile learner core: implement the approved learner UI and preserve local queue/fail-closed sync boundaries.
3. M1-D slice 2: decide and implement push-reconciliation only after the unresolved cursor/watermark policy is approved.
4. M1-Q independent product, visual, accessibility and documentation QA.

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
