# ADR 0002: Conservative scheduling seam

## Decision

Start with a deterministic, typed scheduling interface and conservative intervals. Persist review events rather than only derived card state.

## Consequences

The algorithm can evolve with evidence without breaking offline clients or losing learning history.
