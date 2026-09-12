# LB-DS-066 — Web-first 30-day release reset

- Branch: `docs/web-first-30-day-release`
- Base commit: `32aad4c4cffdbdd6211263d9fe5f7ed2d9f191ee`
- Head commit: read live with `gh pr view <PR> --json headRefOid` before readiness or merge
- Draft PR: #278 — https://github.com/bahramghorbani/learnbox/pull/278
- Scope completed: owner-selected Web/PWA-only official v1.0 finish line and 2026-09-12 through 2026-10-12 S0–S5 calendar are reconciled across canonical release, product, storyboard, queue and execution views.
- Files changed: `ROADMAP.md`; `BACKLOG.md`; `CURRENT_WORK.md`; `PROJECT_STATE.md`; `PRODUCT.md`; `.ai/WORKSTREAMS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-066.md`; `docs/PRODUCT_STATUS.md`; `docs/product/PRD.md`; `docs/product/MASTER_SPEC.md`; `docs/product/FEATURE_CATALOG.md`; `docs/product/MONETIZATION.md`; `docs/storyboard/STATUS.md`; `docs/storyboard/MASTER_PROJECT_STORYBOARD.md`; `docs/operations/AGENT_ACTIVE_BRIEF.md`.
- Checks run: full `pnpm check` passed after the documentation change; focused `pnpm verify:ai-worker-queue` reported 62 tasks, documentation governance reported 6 documents, Web security and AI continuity passed, dashboard tests passed 21/21, Prettier passed, `git diff --check` passed and schedule arithmetic reconstructed 30 elapsed days.
- Checks unavailable: none for the previous head; checks and replacement independent review must rerun after this repair commit.
- Remaining work: push the repair; obtain replacement exact-head independent PASS; require all seven GitHub/Vercel contexts terminal-success on that head before merge; then start S1.
- Risks: the 30-day date is aggressive and becomes at risk if any owner gate misses its dated latest start; content approval, staging activation and public rollout remain genuine human gates.
- Secrets or production changes: none; this is documentation-only and authorizes no provider write, upload, attachment, migration, flag activation, deployment or publication.
- Bobo canonical status: unchanged.

## Decision evidence

The owner selected official Web/PWA v1.0 with 35 free words and deferred Android and payment to v1.1. The plan also defers premium packs because paid entitlement is outside the chosen v1.0 finish line.

## Schedule model

S1, S2 and S3 overlap only after their interfaces are stable and their paths are disjoint. S4 requires all three exits. S5 requires S4 exit. Calendar checkpoints and one-for-one slippage rules are explicit in `ROADMAP.md`; no security, human-review or production gate is compressed away.
