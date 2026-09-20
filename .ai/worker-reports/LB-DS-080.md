# LB-DS-080 — canonical repository private-media attachment record

- Branch: `feat/s1-start35-private-media-attachment`
- Base commit: `7277e00f903b468d39678710deefb59a18c03654`
- Head commit: read live with `git rev-parse HEAD`; local commit only
- Draft PR: not created; push, PR and merge are not authorized
- Scope completed: canonical deterministic repository-only attachment record for the 35-item/105-asset Start package, source digest anchors, truthful tracked-public-copy disclosure and fail-closed default-off gates
- Files changed: canonical record; deterministic builder/validator/digest helper and focused tests; full-check wiring; queue/report; current/stable/product/roadmap/backlog/readiness/architecture/operations truth
- Checks run: focused attachment tests 72/72 across three consecutive runs; attachment validator; deterministic byte-identical rebuild (`--write` then staleness check); existing final-manifest, source-attestation, private-media-delivery, upload-boundary, review-packet, owner-decision, issue59-audio-gate, mobile and product-config validators; every remaining `pnpm check` stage run individually with `DEVELOPER_DIR=/Library/Developer/CommandLineTools` (58/58 pass, only two failing without it for the Xcode-license reason below); workspace Prettier `--check` on all changed paths, ESLint, typecheck; `git diff --check`; Gitleaks; exact local-commit verification. The exposure counts were also recomputed independently of the validator helper by hashing all 181 tracked media blobs with `git cat-file blob` + SHA-256: 60 assets/20 content IDs/63 tracked paths (20 per kind) exposed, 45/15 not.
- Checks unavailable: the aggregate `pnpm check` does not complete in this environment because two pre-existing app suites fail without any changed file under `apps/`. `apps/learnbox-website/tests/legal-pages.test.mjs` fails when its Next.js build cannot rename `.next/cache/webpack/...` or open `.next/server/app/robots.txt/route.js.nft.json` (`ENOENT` after successful compilation and static generation, including when rerun alone from a clean `.next`), and `apps/website` fails its own vitest run (23 failed / 286 passed, `Input not found: mobile-number` in `test/learner-today-server-states.test.tsx`). `git diff 7277e00..HEAD --stat -- apps/` is empty, so both suites see byte-identical inputs to base and neither failure is attributable to this change. `pnpm test:start-35-human-review-packet` and `pnpm verify:production-service-boundaries` fail only when spawned without `DEVELOPER_DIR` (the `/usr/bin/git` shim then demands an Xcode license agreement) and pass with it set. Every other `pnpm check` stage passes individually. External CI and independent PR review are outside the authorized local-only scope.
- Remaining work: separately authorize and execute Admin outcome persistence, any operational database/provider attachment, authenticated learner delivery activation, seed, deployment and publication
- Risks: `private_media_attached` is intentionally qualified as repository evidence only; 60/105 attested assets across 20/35 content IDs have byte-identical copies in the public repository and therefore are not private; public Git history is not remediated by this task
- Secrets or production changes: no; no secret, private locator, receipt, provider call, network write, database mutation, runtime flag, environment, deployment or Production change
- Bobo canonical status: unchanged; no Bobo asset, prompt or canonical-character usage changed

## Implemented truth

- The record binds exactly 35 content IDs and 105 assets: 35 images, 35 word-audio assets and 35 sentence-audio assets.
- It anchors the committed final manifest and source private-storage attestation by SHA-256 without copying per-asset paths, checksums, sizes or locators.
- Its authorization permits only `record_repository_attachment_state`; all operational and release actions remain explicitly unauthorized.
- `publicationBlocked` stays true; learner delivery, database media writes and provider calls stay false.
- Exposure is re-derived from tracked Git blobs by SHA-256: 60 attested assets across 20 content IDs match 63 tracked paths; 45 assets across 15 content IDs have no tracked byte-identical copy.
- The builder and validator reject drifted source state/digests, malformed or duplicate assets, unexpected fields, forbidden locator/secret vocabulary, changed exposure counts and weakened gates.

## TDD evidence

Tests were authored before the implementation modules existed (import-time RED), and RED was
reproduced on demand after GREEN: with the committed record removed,
`node scripts/validate-start-35-final-private-media-attachment.mjs` exits 1 and the staleness check in
`node scripts/build-start-35-final-private-media-attachment.mjs` exits 1, so a missing or regenerated
record cannot pass silently. After the minimal implementation the focused suite passes 72/72 across
three consecutive runs, and the mutation fixtures listed in the validator/build tests fail closed
(drifted source digests or lifecycles, missing/extra/duplicate asset IDs and delivery keys, canonical
manifest drift, locator or evidence duplication inside the new record, any database/provider/
deployment/activation/publication claim, exposure-count drift, stale generation).

## Boundary

This local commit changes repository evidence only. It does not rewrite the immutable source attestation's historical `private_storage_verified_not_attached` state, because that artifact records its own earlier verification event. It adds the distinct owner-authorized canonical attachment record while preserving every downstream operational and release gate.
