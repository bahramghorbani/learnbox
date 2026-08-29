# LearnBox current work

**Scope:** only unfinished work on the current branch. Stable merged facts live in `PROJECT_STATE.md`; product truth lives in `docs/PRODUCT_STATUS.md`; milestone authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### Active milestone

- **M1 — Online Learning Core:** active after owner approval.
- **Design gates D0/D1:** active and required before implementation of affected screens.
- M0 Product truth and delivery reset is merged in `origin/main` through PR #146.
- No production, payment, provider credential, real OTP or server activation is implied by starting M1.

## Immediate execution order

1. D0 visual language contract and review evidence.
2. M1-A online learning API/domain contract audit.
3. D1 learner UI kit and state boards, using D0 tokens.
4. M1-D sync/persistence implementation after contract review.
5. M1-B Web and M1-C Mobile implementation in separate worktrees where paths are disjoint.
6. M1-Q independent QA, visual parity and documentation freshness review.

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
