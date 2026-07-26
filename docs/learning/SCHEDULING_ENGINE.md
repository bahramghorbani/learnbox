# Scheduling engine

Track history, grade, latency, lapses, stability, difficulty, due time, state, skill performance, source, and content version. The initial deterministic engine is intentionally replaceable; decisions are captured in ADR 0002.

## v0 policy boundary

The current implementation is deterministic and conservative rather than a claim of optimal SRS:

- every response produces a future due time;
- `forgot` enters `relearning`, increments lapses and lowers stability;
- `hard`, `remembered` and `mastered` apply bounded interval multipliers;
- a new card remains in `learning` after its first answer; only long-term stability can enter `mastered`;
- difficulty remains between 1 and 10;
- a daily session never repeats a card or presents a due card again as new;
- the client records immutable, idempotent review events; the server is the reconciliation authority.

Before any algorithm replacement, replay synthetic histories against both engines, inspect interval/backlog changes, feature-flag the rollout and retain rollback to the old policy.
