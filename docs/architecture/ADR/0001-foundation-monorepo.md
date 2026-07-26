# ADR 0001: Foundation monorepo

## Context

LearnBox requires mobile, public web, admin, API, shared learning logic, and operational services.

## Decision

Use a pnpm workspace monorepo. Flutter remains an independent app directory but shares contracts and tokens by documented generated/export boundaries.

## Consequences

Shared TypeScript packages get a single quality gate; Flutter needs its own SDK and CI job. This can be split later if independent release cadence demands it.
