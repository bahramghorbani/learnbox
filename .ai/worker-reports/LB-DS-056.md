# LB-DS-056 — Admin content-review visual completion

- Branch: `feature/admin-review-visual-completion`
- Base commit: `dd2200759cc0319f7429cc29e91fb20aa96aa5b6` (fresh `origin/main`, PR #265 merge)
- Head commit: `1632ead2fcbf3d12b1b451e3f6af2c8c8574a8de` (independently reviewed exact final head)
- Merged PR: #266 — `https://github.com/bahramghorbani/learnbox/pull/266`; merge commit `e4e80dcc74794f66312993853c4545bb678b8bd9`
- Scope completed: production-quality visual completion of the authenticated Admin content-review interior only. The `ServerBackedContentReview` ready state is now a labeled three-panel RTL operations dashboard (queue panel, selected-content panel, six-dimension review/decision panel) with a server-connected/publication-disabled context header whose three figures are derived solely from the current server `items`, the selected row's checks and its media count. A scoped CSS composition implements the D0 visual language inside the authenticated shell. Every fetch, CSRF, idempotency-key, check-write, decision-write, refresh and server-state path is unchanged.
- Files changed: `apps/admin/app/components/ContentReviewWorkspace.tsx`; `apps/admin/app/globals.css`; `apps/admin/test/content-review-workspace.test.tsx`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-056.md`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`; `docs/design/DESIGN_STATUS.md`; `docs/design/UI_QA.md`
- Checks run: initial focused Admin composition tests RED then 15/15 GREEN; contrast regression test RED then focused 16/16 GREEN; full Admin tests 28 files / 170 tests; Admin typecheck; Admin build; Prettier check on every touched file; repository queue/documentation/continuity/dashboard/security checks; `git diff --check`
- Browser evidence: after the implementation commit, a disposable detached-worktree harness rendered the exact component/CSS in a local production Next build with synthetic read-only queue data. At 1280px and 390px, `documentElement.scrollWidth === innerWidth`; the 390px panels measured 362px wide and queue controls measured 70px high. This follow-up caps the long queue at 320px on mobile so 35 rows do not bury the selected card. The harness is not part of the PR and does not prove authenticated staging, real data, full keyboard navigation, axe, contrast or owner acceptance.
- Staging/owner evidence: the exact merge commit was built as `learnbox-admin:e4e80dcc74794f66312993853c4545bb678b8bd9` and deployed only to isolated Admin staging. The container reached `running|healthy`; the public root returned 200; the deployed stylesheet returned 200 and contained `.server-review`, `.review-workspace`, `.review-workspace-grid` and retry-button rules; anonymous session/review requests remained 401/no-store and closed bootstrap remained 404/no-store. Learner staging and Production images remained unchanged. The authenticated owner then hard-refreshed, entered the interior and accepted the corrected visual result. No content check or decision was submitted.
- Checks unavailable: axe and a full assistive-technology matrix remain unverified and are not claimed. A real-Chromium independent probe found and blocked the initial shell-wide token override at `abe8a2a`; the merged follow-up restores the true-white canvas and legacy AA action colour, darkens tinted secondary text, and uses the D0 focus ring.
- Remaining work: LB-DS-056 is accepted. The next content-review operation is a separate owner-gated task because it would write human checks/editorial decisions; attachment, seed, release and publication remain independently gated.
- Risks: the change is presentation-only but touches the authenticated Admin interior. The first review proved that shadowing `--purple` at `.admin-shell` weakened existing navigation/splash/pack contrast; that override is now prohibited by a focused regression test. New presentation rules remain scoped to `.server-review`/`.review-workspace`, while the shell keeps its prior AA action colour and true-white canvas. Residual accessibility risk is limited to the still-unverified axe and full assistive-technology matrix; authenticated staging visual acceptance is complete.
- Secrets or production changes: none. No API route, auth/session, database, migration, content/media/evidence JSON, package manifest/lockfile, flag, secret, learner app, landing or Bobo asset was modified. Deployment changed only the isolated Admin staging image after merge; learner services and Production stayed unchanged. No check or decision was submitted and no content decision was made.
- Bobo canonical status: unchanged — no Bobo asset or appearance was touched.

## TDD evidence

### RED

Added a focused acceptance `describe` to `apps/admin/test/content-review-workspace.test.tsx` asserting the labeled queue/content/decision composition, the publication-disabled context, the derived-figure set, selection-driven re-derivation, absence of fabricated readiness figures, and truthful loading/unauthorized/error/empty/disabled states. Run before implementation:

```
pnpm --filter @learnbox/admin exec vitest run test/content-review-workspace.test.tsx

 FAIL  test/content-review-workspace.test.tsx > ServerBackedContentReview (authenticated review composition) > composes the ready state as labeled queue, content and decision panels
AssertionError: expected null not to be null  (test/content-review-workspace.test.tsx:573, `[data-review-state="ready"]`)
 FAIL  test/content-review-workspace.test.tsx > ServerBackedContentReview (authenticated review composition) > derives every workspace figure from the server rows, checks and media
AssertionError: expected  to have a length of 3 but got +0  (test/content-review-workspace.test.tsx:621, `[data-review-metric]`)
 FAIL  test/content-review-workspace.test.tsx > ServerBackedContentReview (authenticated review composition) > marks loading, unauthorized, error, empty and disabled states without review panels
AssertionError: expected null not to be null  (test/content-review-workspace.test.tsx:655)
 Test Files  1 failed (1)
      Tests  3 failed | 12 passed (15)
```

The 12 pre-existing tests already passed against base, so RED is caused only by the new composition assertions. No CSS text snapshot and no behaviour assertion was weakened.

### GREEN

```
pnpm --filter @learnbox/admin exec vitest run test/content-review-workspace.test.tsx
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## Required check results

| #   | Check                                       | Result                                                                 |
| --- | ------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | focused Admin content-review workspace test | PASS after RED — 15/15, single file                                    |
| 2   | full Admin tests                            | PASS — 28 files, 170 tests                                             |
| 3   | Admin typecheck and build                   | PASS — `tsc --noEmit` clean; `next build` emitted the full route table |
| 4   | Prettier check on touched files             | PASS — all touched files use Prettier code style                       |
| 5   | `pnpm verify:ai-worker-queue`               | PASS                                                                   |
| 6   | `pnpm verify:documentation-governance`      | PASS                                                                   |
| 7   | `pnpm verify:ai-continuity`                 | PASS                                                                   |
| 8   | `pnpm test:dashboard`                       | PASS                                                                   |
| 9   | `git diff --check`                          | PASS — no whitespace errors                                            |

`pnpm --filter @learnbox/admin build` was run before the documentation commit; the recorded results are the real command outputs from this worktree. The workspace had to install dependencies (`pnpm install --frozen-lockfile --offline`) and build `@learnbox/content-models` before the Admin toolchain could resolve, which is a pre-existing worktree setup requirement rather than a change in this task.

## Behaviour preservation

- No fetch, URL, method, header, CSRF-token read, idempotency-key generation, or request body changed.
- `submitCheck`, `submitDecision`, `loadQueue` and `refreshAfterMutation` are byte-identical in observable behaviour; the only code change outside markup is deriving `passedDimensions` from the same predicate the approval gate already used, so `allChecksPassed` keeps identical semantics and final approval still stays disabled until all six dimensions are `passed`.
- The local-only preview, `ReviewGateSummary`, `ReviewQueueOverview`, `PackReleasePanel` and `SplashReplacementPanel` markup and behaviour are untouched.
