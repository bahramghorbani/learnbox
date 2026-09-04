# PDR-005 — Learning Content Factory

- **Status:** approved
- **Date:** 2026-07-27

## Context

The 35-item Start pack is the first use of a reusable system that must later support thousands
of items, advanced levels, specialist packs and other languages.

## Decision

Use `services/content-factory/`, `packages/content-models/`, `apps/content-admin/`,
`content/packs/` and `docs/content/` as the factory boundaries. The pipeline is candidate →
normalization → duplicate check → linguistic generation → schema/German/Persian/CEFR validation
→ visual concept/prompt → image and Bobo/semantic QA → audio/QA → staging → app validation →
approved versioned release.

## Rationale

A controlled pipeline makes scale repeatable and preserves editorial accountability.

## Affected systems

Content model, pipeline jobs, admin review, pack storage, media, versioning, publishing,
rollback, analytics and user reports.

## Consequences and implementation notes

The status model includes `draft`, `ai_generated`, `auto_validated`, `needs_review`, `approved`,
`published`, `deprecated` and `rejected`. AI output is never trusted merely because it succeeds:
human review and a separate publisher remain mandatory. Paid providers/API keys require local
preparation, cost estimate, alternatives and explicit owner approval before activation.

## Metrics

Track stage durations, validation/rejection reasons, reviewer load, asset retry rate, publish
rollback rate and user-reported issues.

## Reversibility

Immutable versions, staging and explicit publish gates support rollback. Factory adapters remain
provider-neutral.
