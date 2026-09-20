# LB-DS-080 — canonical repository private-media attachment record

- Branch: `feat/s1-start35-private-media-attachment`
- Base commit: `7277e00f903b468d39678710deefb59a18c03654`
- Head commit: read live with `git rev-parse HEAD`; local commit only
- Draft PR: not created; push, PR and merge are not authorized
- Scope completed: canonical deterministic repository-only attachment record for the 35-item/105-asset Start package, source digest anchors, truthful tracked-public-copy disclosure and fail-closed default-off gates
- Files changed: canonical record; deterministic builder/validator/digest helper and focused tests; full-check wiring; queue/report; current/stable/product/roadmap/backlog/readiness/architecture/operations truth
- Checks run: focused attachment tests 72/72; attachment validator; deterministic byte-identical rebuild; existing final manifest/source attestation/private-delivery validators; queue/documentation/security/continuity validators; workspace Prettier, ESLint and typecheck; `git diff --check`; Gitleaks; exact local-commit verification. Full `pnpm check` reached the existing marketing-site suite and then failed because its legal-page fixture's Next.js build could not rename shared `.next` artifacts (`ENOENT` after successful compilation/static generation), including when rerun alone from a clean `.next`; no changed file is under `apps/learnbox-website`.
- Checks unavailable: the full aggregate `pnpm check` did not complete past that unrelated marketing-site Next.js filesystem failure; external CI and independent PR review are outside the authorized local-only scope.
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

The focused tests were written first and observed RED because the attachment builder/validator modules did not exist. After the minimal implementation and refactor, the focused suite passed 72/72.

## Boundary

This local commit changes repository evidence only. It does not rewrite the immutable source attestation's historical `private_storage_verified_not_attached` state, because that artifact records its own earlier verification event. It adds the distinct owner-authorized canonical attachment record while preserving every downstream operational and release gate.
