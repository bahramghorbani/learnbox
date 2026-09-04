# LB-DS-STARTER-DRAFTS-15 handoff

- Branch: content/starter-drafts-15
- Base commit: f63538c549e7376d70ebd8708d22660f3cc60611 (origin/main)
- Head commit: 8010de7baac16521a10c0c5c7959793e18dc456b (content commit; this report is recorded in a follow-up metadata commit on the same branch)
- Draft PR: none opened (verified local commit only; parent reviews independently, no push)
- Scope completed: bounded, additive, fail-closed drafting of the 15 missing Start A1 target items (catalog target 35, ADR 0016) plus regeneration of the derived 35-catalog snapshot and seed-gate expectations. The 15 items are Goethe-evidenced pending drafts (`status: needs_review`, `media: []`, every review dimension pending); no linguistic approval, release approval, media, migration or publication is implied or added.
- Files changed:
  - content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json (new; 15 pending drafts: Fenster, Zimmer, Uhr, Milch, Kaffee, Ei, Tee, Stadt, Supermarkt, gehen, essen, trinken, groß, kalt, neu)
  - content/packs/learnbox-start/validation/start-a1-catalog-35-pending-candidates.json (new; candidate intake, official Goethe source)
  - content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json (new; per-item Goethe PDF page evidence)
  - content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json (regenerated: counts 35 drafted / 20 linguistically reviewed / 0 release-approved / 0 missing, union draftedItemIds, pendingDraftsSha256 integrity anchor, truthful blockers)
  - apps/api/test/start-catalog-seed-gate.test.ts (updated expected counts and blocker assertions for the 35-draft real catalog)
  - .ai/worker-reports/LB-DS-STARTER-DRAFTS-15.md (this file)
  - CURRENT_WORK.md (branch-unmerged record only)
- Checks run:
  - apps/api seed-gate focused vitest: RED observed (2 failed: missing pending-drafts file + stale snapshot counts) before content landed, then 10/10 GREEN
  - services/content-factory batch-validation: 13/13 pass
  - pnpm run verify:start-slice / verify:start-drafts / verify:linguistic-approval / verify:source-scope / verify:start-provenance-ledger / verify:start-candidate-qa / verify:media-handoff / verify:start-attachment-draft / verify:start-v2-image-attachment-draft / verify:start-private-media-attestation / verify:start-v2-images-private-media-attestation / verify:private-media-delivery / verify:website-start-slice / verify:start-local-media-preview / verify:start-pack-v2-contract — all pass
  - pnpm run test:mobile-start-content pass
  - JSON parse and structural sanity of every new/changed JSON file (15 unique canonical `start-a1-*` ids, no overlap with existing 20, nouns carry article, media arrays empty)
  - git diff --check clean; prettier check on changed files clean (eslint clean on the changed test file)
- Checks unavailable: full-repo `pnpm check`/`pnpm format:check` is not fully green at this branch baseline (pre-existing format failures on apps/admin components, BACKLOG.md, docs/storyboard/STATUS.md, ROADMAP.md recorded in LB-DS-STARTER-CATALOG-35); no path outside the authorized scope was touched. apps/website full suite needs the workspace package build chain (learning-engine/billing-core/api); see Results below if it completed.
- Remaining work: the 15 pending drafts still need product-owner German/Persian linguistic review, then provenance/visual/audio/app-flow dimensions, before any ADR 0013 seed of cards/card_versions. DB seed stays blocked: approvedForReleaseItemCount = 0, seedable = false, publicationBlocked = true.
- Risks: the pack-level snapshot and seed-gate test are now the enforcement point for drift between the two vocabulary sources (slice 20 + pending 15); content-factory, website staging, mobile and the v1/v2 media chains intentionally continue to consume only the 20-item vertical slice, which is unchanged and remains green. The pending batch is consumed by the catalog gate/snapshot only.
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Design note (why the 15 drafts are a separate pending batch)

The approved single-batch option (append 15 items to `start-a1-vertical-slice-drafts.json`) is provably infeasible under the authorized file scope: the media-handoff → attachment-draft → private-media-attestation builders and the content-factory real-batch tests consume that file and are not in the allowed-edit list, so a 35-item slice file would make `verify:media-handoff`, `verify:start-attachment-draft` and the content-factory suite fail closed without a generator/builder change. The 15 pending drafts therefore live in a dedicated pending batch that only the catalog-35 gate and snapshot consume; all existing 20-item semantics, approval ledgers and media gates are untouched.

## Evidence pages (Goethe-Zertifikat A1 Wortliste PDF, PDF page numbers)

fenster [23, 26], zimmer [13, 26], uhr [7, 24], milch [20, 26], kaffee [18, 20], ei [13, 15], tee [20, 24], stadt [9, 23], supermarkt [19], gehen [15, 16], essen [14, 24], trinken [13, 26], groß [16, 23], kalt [18, 23], neu [18, 20]. Source: https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf (direct PDF text extraction, manual contextual review; recorded per item in the pending provenance ledger).
