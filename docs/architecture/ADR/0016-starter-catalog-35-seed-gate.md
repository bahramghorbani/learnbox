# ADR 0016 — 35-word Start catalog slice and fail-closed seed gate (M1)

- **Status:** accepted decision contract; the reusable seed gate and catalog snapshot are
  implemented on `feature/starter-catalog-35`; DB seeding, migrations and publication remain
  blocked and separately review-gated
- **Date:** 2026-09-04
- **Basis:** `feature/starter-catalog-35` at commit `94cb729` (official free starter target reduced
  to approximately 35 words). Read with ADR 0013, `docs/product-decisions/PDR-004`, and
  `content/packs/learnbox-start/manifest.json` (`targetItemCount: 35`,
  `releaseStatus: "draft"`).

## Context

The owner-approved product decision (recorded in `CURRENT_WORK.md` owner decisions and commit
`94cb729`) sets the free Start collection at approximately 35 complete A1 German words. The
content factory owns exactly 20 structured linguistic drafts
(`content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json`), all still
`needs_review`. The editorial packet
(`docs/content/START_A1_EDITORIAL_REVIEW_PACKET.md`) and the recorded
`validation/start-a1-slice-linguistic-approval.json` confirm only the German linguistic and
Persian translation dimensions for those 20 items (product owner, 2026-07-27); provenance,
visual, audio and app-flow validation remain required before publication. ADR 0013 makes bundled
`start-a1-*` ids the canonical `cards.content_id` values, but a card becomes resolvable content
only after an `approved`/`published` `card_versions` row exists — and none exists for any Start
item.

No DB seed system, catalog module or `cards`/`card_versions` row exists for the Start pack. A
safe seed therefore has two preconditions that the repository does not meet: 35 released items
(only 20 drafts exist) and approved/published card versions (zero).

## Decision

Implement the bounded Starter Catalog/seed slice for the 35-word target as a **fail-closed,
additive slice that cannot mark content approved or published**:

- **Canonical derived snapshot.** `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`
  records the truth for the 35-item target: 20 drafted, 20 linguistically reviewed, 0
  release-approved, 15 missing drafts, `seedable: false`, with the exact blockers and SHA-256
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

Seeding the DB (adding a migration or seed runner that inserts Start-pack rows into `cards` /
`card_versions`) is NOT authorized by this record and remains blocked by ADR 0013's preserved
gate until the repository holds at least 35 items that each pass every review dimension and reach
`approved`/`published`.

## Preserved gates (unchanged)

- **Editorial content required:** no bundled or draft item becomes resolvable content until its
  `card_versions` row is `approved`/`published` (ADR 0013; enforced by
  `PostgresReviewEventStore.resolveCardId` and `bootstrap_approved_card_schedules`).
- **No seed/release:** no migration, seed SQL, catalog membership, price, media attestation,
  publication or server activation is added here. `releaseStatus` stays `"draft"` and all 20
  draft items stay `needs_review`.
- **No production activation:** no route, flag, deployment or environment change is included.
- **No fabrication:** the snapshot and tests contain only repository-recorded state; nothing is
  invented (no extra lemmas, approvals, media claims, prices or user data).

## Consequences

- The 35-word target now has one canonical, integrity-anchored catalog snapshot and one
  fail-closed seed gate that the future, separately authorized seed task must satisfy before any
  DB write.
- The documented limitation is exact: the repository cannot safely seed 35 items today because 15
  target drafts are missing and none of the 20 existing drafts is release-approved.

## Out of scope

- Drafting the missing 15 items, further editorial review dimensions, media production or
  attachment, DB migrations, seed runners, catalog APIs/routes, flags, deployments and content
  publication. Those remain separate owner/review-gated tasks.

## Reversal trigger

Re-open this decision if a bundled Start-pack id must differ from its canonical `cards.content_id`
(see ADR 0013), or if a seed is ever attempted without every target item being release-approved.
