# ADR 0010: AI continuity governance

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

LearnBox must remain safely resumable when implementation moves between capable coding agents.
Chat history, model-specific tools and provider memory are not durable product authority. The
existing monorepo already contains the product specification, storyboard, ADRs, PDRs, tests and CI;
the decision is to standardize those existing sources rather than rebuild the product or its docs.

## Decision

The repository is the single source of truth. `AI_BOOTSTRAP.md`, `AI_HANDOFF.md`,
`PROJECT_STATE.md`, `CURRENT_WORK.md` and `.ai/` define a provider-neutral continuation contract.
Agents resolve abstract capabilities rather than depending on a particular vendor skill name.

Meaningful changes use named non-`main` branches and normally reach `main` by pull request with
green CI. `PROJECT_STATE.md` records only stable-main facts; `CURRENT_WORK.md` records only
unfinished, unmerged work. The continuity validator is part of `pnpm check` so documentation drift
fails the main quality gate.

The current storyboard, existing application boundaries and canonical Bobo governance remain
unchanged. Provider replacement is not approval to regenerate or redesign Bobo.

## Consequences

Every merged milestone must leave project state and handoff material accurate. The added documents
reduce reliance on chat context while keeping technical choices autonomous and preserving owner
gates for credentials, paid services, legal, irreversible and production actions.

## Reversal

This governance can be revised through a future ADR and PR. Until then, it applies to all
meaningful repository changes.
