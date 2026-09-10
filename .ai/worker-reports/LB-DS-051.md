# LB-DS-051 — Learner Web Today no-due state

- Branch: `feature/web-today-no-due-state`
- Base commit: `05222eeab3b3c144bb6effb2d4d1a726cb6b99d6` (`origin/main`; PR #256 merge commit)
- Head commit: resolve from `origin/feature/web-today-no-due-state` after the single review-request push; the Draft PR body binds the exact pushed SHA
- Draft PR: #257 (Draft) — https://github.com/bahramghorbani/learnbox/pull/257
- Scope completed: D1 §5 no-due Today state, truthful device-local copy, recovery Bobo, one Words action and focus recovery
- Files changed: the bounded Website component/shell/style and focused/core-flow tests, plus `.ai/WORK_QUEUE.md`, this report, `CURRENT_WORK.md`, `docs/PRODUCT_STATUS.md`, `docs/design/DESIGN_STATUS.md`, and `docs/design/UI_QA.md`
- Checks run: focused Today suites 17/17; affected Today/core-flow tests 30/30; full Website tests 276/276; Website typecheck and production build; exact-head final checks rerun after independent-review corrections
- Checks unavailable: none
- Remaining work: obtain an exact-head independent code/product/accessibility review, wait for all exact-head GitHub/Vercel contexts, then merge only if every required gate succeeds
- Risks: stale zero-card actions, misleading device-local copy and focus loss; mitigated by state-specific integration tests, preserved sync labels and focus assertions
- Secrets or production changes: none. No credential, server state, database row, migration, seed, catalog membership, publication, deployment, Vercel setting or feature flag was changed
- Bobo canonical status: unchanged asset set; the existing approved `recovery-v2.png` expression is reused for the no-due state
- Runtime boundaries: no server state, catalog, sync, migration, seed, publication, deployment or feature flag was activated

## TDD and functional evidence

The focused no-due test was introduced before production changes and failed because Today rendered the zero-card start prompt instead of the D1 empty state. After implementation, the focused Today suites pass 17/17. The affected Today/core-flow set passes 30/30, and the full Website suite passes 276/276. Existing core-flow assertions now verify the empty copy and focused Words action after the three-card session completes.

Website typecheck and the optimized Next.js production build pass. The loading skeleton, server-backed/offline/error truth labels, non-empty three-card flow and pending-sync chip remain covered. The due count remains explicitly device-local until the approved server-card join exists.

## Visual and accessibility evidence

A real local browser session completed the three-card review and returned to Today at a 390×844 mobile viewport. The settled page showed `کارتی برای مرور نیست`, the recovery Bobo, the truthful device-local and pending-sync labels, and one `رفتن به واژه‌ها` action. The action received keyboard focus after returning from completion. The viewport had no horizontal document overflow after constraining the small-screen shared navigation width. A 195 CSS-pixel viewport (390px at a 200% reflow equivalent) also retained the empty state and full-width action without horizontal overflow.

## Remaining review gate

Independent code/product/accessibility review and exact-head GitHub/Vercel checks remain required before merge. The Draft PR must not be merged while any required context is pending or failing.
