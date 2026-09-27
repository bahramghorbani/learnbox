# PDR-001 — Product tiers

- **Status:** approved
- **Date:** 2026-07-27

## Context

LearnBox is one product, one codebase and one user-account system. A learner must not be split
between separate free and paid apps.

## Decision

Use stable entitlement tier IDs `learnbox_start` (permanent free) and `learnbox_plus` (paid).
Plus supports the stable billing periods `monthly`, `three_month` and `annual`. Public labels,
prices, limits and feature presentation are remote-configurable; stable IDs are never localized.

## Rationale

Stable IDs keep database, provider adapters, analytics and clients interoperable while allowing
safe product experiments without a client release.

## Affected systems

Database, entitlement service, billing, remote configuration, flags, analytics, admin, mobile,
PWA, website pricing, paywall and tests.

## Consequences and implementation notes

`@learnbox/billing-core` now exposes the tier and subscription identifiers plus a safe access
resolver. `config/product-experience.json` is the versioned default configuration contract.
The existing provider-neutral billing tables remain valid; provider product mapping stays outside
the client catalog. A later migration may add an auditable tier/config assignment only when a
real provider integration is scheduled.

## Metrics

Track eligible, viewed, dismissed and completed subscription events without personal content.

## Reversibility

Remote configuration and inactive products allow rollback. Tier IDs are append-only contracts and
must not be renamed.
