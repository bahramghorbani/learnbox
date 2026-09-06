# LB-DS-030 — Admin authenticated-preview truthfulness

- Status: review_requested
- Base commit: `d81f7b50cf8ab0ab2781fdab610010eaf4ef99af`
- Branch: `fix/admin-authenticated-preview-truth`
- Head: this report is committed with the implementation
- Risk: low-risk truthful Admin UI

## Outcome

The Admin AuthGate now exposes whether the workspace is running as a local prototype or behind a verified server Passkey session. The content workspace uses that state to stop claiming “without login” after a real sign-in while continuing to state explicitly that review data and actions are local-only and publication is disabled.

The review queue now combines the original 20 committed Start Pack drafts with the 15 committed catalog-extension drafts, yielding the canonical 35-draft target without changing content records or approval state.

## Changed paths

- `apps/admin/app/components/AdminAuthGate.tsx`
- `apps/admin/app/components/ContentReviewWorkspace.tsx`
- `apps/admin/test/admin-auth-ui.test.tsx`
- `apps/admin/test/content-review-workspace.test.tsx`
- `CURRENT_WORK.md`
- `docs/PRODUCT_STATUS.md`
- `.ai/WORK_QUEUE.md`
- `.ai/worker-reports/LB-DS-030.md`

## Unchanged boundaries

- No database schema or migration.
- No server-backed review read or write route.
- No content approval, seed or publication.
- No Production deployment, environment or data change.
- Existing six-dimensional release gate remains fail-closed.

## TDD evidence

- RED: complete-queue test observed 20 items instead of 35.
- GREEN: focused workspace tests pass with 35 items and publication blocked.
- RED: authenticated workspace status test observed the stale local “without login” label.
- GREEN: focused auth UI tests pass with a server-authenticated context and truthful local-data limitation.

## Checks

- Focused Admin AuthGate/workspace tests: 14 passed.
- Full Admin suite: 121 passed.
- Admin typecheck: passed.
- Admin production build: passed.
- Prettier and `git diff --check`: passed.
- AI worker queue, documentation governance, continuity and dashboard validators: passed.
- GitHub secrets check: passed; remaining CI checks are tracked on PR #213.

## Rollback

Revert this PR. The existing Passkey/session backend and staging database remain unaffected.

## Next dependency

A separately reviewed, fail-closed server-backed Admin content-read route and staging activation slice. Review writes and publication remain later gates.
