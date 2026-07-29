# ADR-0007: Separate public marketing website subproject

## Status

Accepted — 2026-07-29

## Decision

`apps/website` remains the learner web app. `apps/learnbox-website` is its separate public marketing subproject. It owns only public UI and local, checksum-verified derivatives of the canonical BuBu v2 assets. The original assets remain untouched. DuDu's supplied official image is stored as a reference only until scene-ready artwork is approved.

## Consequences

Public links default to transparent unavailable status until validated destinations are supplied. Rollback is the marketing deployment's prior commit; no learner data is affected.
