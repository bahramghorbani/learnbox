# ADR-0007: Separate public marketing website subproject

## Status

Accepted — 2026-07-29

## Decision

`apps/website` remains the learner web app. `apps/learnbox-website` is its separate public marketing subproject. It owns only public UI and local, checksum-verified derivatives of the canonical BuBu v2 assets. The original assets remain untouched. DuDu's supplied official image is stored as a reference only until scene-ready artwork is approved.

The marketing site uses its own `vercel.json` and must be connected as a separate
Vercel project whose Root Directory is `apps/learnbox-website`. The repository-root
Vercel project continues to target `apps/website` and must not be repurposed.

Upload readiness has two explicit gates:

- `check:preview` permits honest unavailable states and is safe for a private
  review URL.
- `check:release` requires every official destination plus owner-approved product
  screenshots, QR codes and branded Open Graph artwork.

Public destinations are configured only through documented `NEXT_PUBLIC_*`
variables. Unknown or malformed destinations resolve to a non-link unavailable
state instead of a guessed URL.

## Consequences

Public links default to transparent unavailable status until validated destinations are supplied. Rollback is the marketing deployment's prior commit; no learner data is affected.

The first public production deployment remains blocked until `check:release`
passes. A preview deployment cannot be promoted merely because its build is
healthy.

## Reversal trigger

Revisit this decision only if the learner web app and marketing surface receive an
approved shared routing architecture that preserves separate release and rollback
boundaries.
