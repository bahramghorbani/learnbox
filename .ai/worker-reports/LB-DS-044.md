# LB-DS-044 — Starter Catalog 35 release-readiness audit

- Status: review_requested
- Branch: `docs/starter-catalog-release-readiness-audit`
- Base commit: `bb6c6d6ca1b0af1b0a96a771c4f29a6aabe73d4e`
- Head commit: `75bac3a` (stable audit artifact commit)
- Draft PR: #240 (draft) — https://github.com/bahramghorbani/learnbox/pull/240
- Scope completed: yes — decision-ready, fail-closed audit of the 35-item Starter Catalog; no content approval or release operation
- Files changed: `docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-044.md`; `CURRENT_WORK.md`; `docs/PRODUCT_STATUS.md`
- Checks run: structured 35-item/hash audit (`STARTER_CATALOG_35_AUDIT_OK`); Prettier; `format:check`; `verify:ai-worker-queue`; `verify:documentation-governance`; `verify:ai-continuity`; dashboard tests 21/21; `git diff --check`
- Checks unavailable: human visual/audio/content release review is intentionally unavailable and cannot be replaced by repository validators
- Remaining work: reconcile stale pre-approval wording across both draft batches and the 15-item provenance ledger; with separate cost authorization, produce candidate-only media and QA for the remaining 15; then obtain per-item owner release decisions before any attachment, seed, flag enablement, participant invitation or publication
- Risks: candidate-stage evidence may be mistaken for release approval; mitigated by explicit 20/15 matrix, 0/35 approved count and fail-closed boundaries
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Findings

- All 35 target IDs are drafted and have recorded product-owner approval only for
  `german_linguistic` and `persian_translation`.
- The original 20 have candidate-stage provenance, visual, audio and local app-flow evidence. Their
  60 V1 assets and 20 V2 image assets are privately attested but deliberately unattached.
- The remaining 15 have lexical-scope provenance records but no requested visual/audio candidates and
  no app-flow approval.
- No item has an approved/published `card_versions` row. The derived catalog snapshot remains
  `seedable: false`, `publicationBlocked: true`, with 0/35 release-approved.
- Both draft batches retain pre-approval status/source wording for the later-approved linguistic
  dimensions, and the 15-item provenance ledger still lists those dimensions as pending; the audit
  treats this as chronology drift and does not infer any additional approval.
