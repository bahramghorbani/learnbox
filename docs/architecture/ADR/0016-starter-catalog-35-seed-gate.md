# ADR 0016 — 35-word Start catalog slice and fail-closed seed gate (M1)

- **Status:** accepted decision contract; the reusable seed gate and catalog snapshot are
  implemented. PDR-008 supersedes only the pre-approval row prohibition by authorizing all 35
  drafts as non-learner-visible `needs_review` candidates; publication and learner catalog seeding
  remain blocked and separately review-gated. The PDR-008 persistence slice is implemented but
  dormant in LB-DS-049 (draft PR #251): migration `0017` and the default-off Admin review
  runtime; the migration is not executed and the runtime flag is not enabled anywhere.
- **Date:** 2026-09-04
- **Basis:** `feature/starter-catalog-35` at commit `94cb729` (official free starter target reduced
  to approximately 35 words). Read with ADR 0013, `docs/product-decisions/PDR-004`, and
  `content/packs/learnbox-start/manifest.json` (`targetItemCount: 35`,
  `releaseStatus: "draft"`).

## Context

The owner-approved product decision sets the free Start collection at approximately 35 complete
A1 German words. The content factory now owns exactly 35 structured drafts across the original
20-item vertical slice and the 15-item completion batch, all still `needs_review`. The editorial
packet and `validation/start-a1-slice-linguistic-approval.json` confirm only the German linguistic
and Persian translation dimensions for all 35 items (product-owner confirmations on 2026-07-27
and 2026-09-04); provenance, visual, audio and app-flow validation remain required before
publication. ADR 0013 makes bundled
`start-a1-*` ids the canonical `cards.content_id` values, but a card becomes resolvable content
only after an `approved`/`published` `card_versions` row exists — and none exists for any Start
item.

No `cards`/`card_versions` row exists for the Start pack. A learner-visible catalog still requires
35 released items and approved/published card versions; all 35 drafts exist, but zero are
release-approved.

## Decision

Implement the bounded Starter Catalog/seed slice for the 35-word target as a **fail-closed,
additive slice that cannot mark content approved or published**:

- **Canonical derived snapshot.** `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`
  records the current truth for the 35-item target: 35 drafted, 35 linguistically reviewed, 0
  release-approved, `seedable: false`, with the exact blockers and SHA-256
  integrity anchors over the draft and linguistic-approval files it is derived from. It is a
  snapshot, not an approval; it creates no migration and no `cards`/`card_versions` row.
- **Reusable seed gate.** `apps/api/src/catalog/start-catalog-seed-gate.ts` exposes
  `evaluateStartCatalogSeed`, the precondition check a future seed task must run. It reports a
  catalog as `seedable` only when the item count equals the target and every item is
  linguistically reviewed and release-approved (approved/published `card_versions`). It contains
  no transition that approves or publishes content; partial or draft catalogs stay blocked with
  explicit blockers.
- **Test-enforced freshness.** `apps/api/test/start-catalog-seed-gate.test.ts` locks the gate
  behavior and re-derives the committed snapshot from the real draft and approval files
  (including SHA-256 comparison), so a changed draft batch fails the test instead of silently
  drifting.
- **No schema change.** No migration is added. The seed gate is pure code with no route, flag,
  provider, database connection or runtime wiring.

PDR-008 now authorizes a separately reviewed, default-off ingestion slice that inserts the 35
committed drafts into `cards` / `card_versions` strictly as `needs_review` candidates so Admin can
persist the six review dimensions. This does not make them learner-resolvable: existing learner
paths continue selecting only `approved`/`published` versions. Pack membership, learner catalog
seeding, schedule bootstrap and publication remain blocked until every release gate passes.

## Preserved gates (unchanged)

- **Editorial content required:** no bundled or draft item becomes resolvable content until its
  `card_versions` row is `approved`/`published` (ADR 0013; enforced by
  `PostgresReviewEventStore.resolveCardId` and `bootstrap_approved_card_schedules`).
- **No learner seed/release:** PDR-008 permits only deterministic `needs_review` review-candidate
  rows and pending review checks. No catalog membership, price, publication, learner schedule
  bootstrap or learner-route activation is authorized. `releaseStatus` stays `"draft"`.
- **No production activation:** no route, flag, deployment or environment change is included.
- **No fabrication:** the snapshot and tests contain only repository-recorded state; nothing is
  invented (no extra lemmas, approvals, media claims, prices or user data).

## Consequences

- The 35-word target now has one canonical, integrity-anchored catalog snapshot and one
  fail-closed seed gate that the future, separately authorized seed task must satisfy before any
  DB write.
- The documented limitation is exact: all 35 target drafts exist, but none is release-approved;
  provenance, visual, audio and app-flow gates remain open.

## Out of scope

- Further editorial review dimensions, media production or attachment, learner catalog
  APIs/routes, flags, deployments and content publication. Those remain separate
  owner/review-gated tasks; only the bounded PDR-008 review-candidate migration is now authorized.

## Reversal trigger

Re-open this decision if a bundled Start-pack id must differ from its canonical `cards.content_id`
(see ADR 0013), or if a seed is ever attempted without every target item being release-approved.
