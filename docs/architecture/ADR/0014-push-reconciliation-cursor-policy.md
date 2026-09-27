# ADR 0014 — M1-D push reconciliation cursor/watermark policy

- **Status:** accepted decision contract; implementation requires a separately authorized
  serial M1-D queue task (migration + service + tests)
- **Date:** 2026-08-30
- **Basis:** `origin/main` at `6b8617f` (ADR 0013, PR #167). Read with
  `docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md` (§3–§6, §8, §12),
  `docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md`, ADR 0011, ADR 0012 and
  `database/migrations/0013_native_review_transport.sql`.

## Context

The push reconciliation problem (M1-D open item): after a client uploads a batch of review
events, the client needs a compact server-side signal that lets it remove acknowledged events
from its local queue without losing unacknowledged ones, and that lets it reconcile its local
pending state after reconnect. ADR 0012 and M1-D slice 1 both record that no server-side push
acknowledgement watermark exists yet, that `reviewEventsCount` is **not** that watermark, and
that no UI may claim server persistence of local events until the policy is decided.
`M1_ONLINE_LEARNING_CONTRACT.md` §3.2 and §6 leave the policy open ("Proposed (M1-D): policy …
not specified today"). `.ai/WORK_QUEUE.md` and `CURRENT_WORK.md` record push reconciliation as
blocked pending cursor/watermark policy approval.

Verified implementation facts the policy must respect (`origin/main`):

- `review_events` is an append-only log with a learner-scoped idempotency key
  (`UNIQUE (user_id, client_event_id)`, migration 0013) and a server-authoritative monotonic
  `applied_at`.
- `PostgresReviewEventStore.writeAtomically` claims the idempotency key and updates
  `card_schedules` in **one transaction**; an idempotent replay (same `clientEventId`,
  identical payload) returns the existing event with `idempotent: true` and does **not**
  re-apply the schedule. A replay with a different payload throws
  `ReviewIdempotencyConflictError` (per-item outcome `idempotencyConflict`).
- Per-item outcomes already exist: `acknowledged` (with `idempotent`), `idempotencyConflict`,
  `validation` (unknown contentId, missing schedule, out-of-window `occurredAt`),
  `clockSkew` (`mobile-review-batch.service.ts`).
- The client queue removes **only** the exact acknowledged `clientEventId`s
  (`packages/learning-engine/src/offline-sync.ts`, `acknowledgeSyncEvents`; Flutter
  `ReviewSyncCoordinator`); invalid/partial acknowledgements retain all events and return a
  retryable outcome. The shared queue serializer fails closed to an empty queue on corrupt
  data (`offline-sync-storage.ts`; `docs/architecture/OFFLINE_SYNC.md`).
- `GET /api/learner/state` returns `reviewEventsCount` (an exact `COUNT(*)`, not a
  pending/acknowledged delta) plus schedules/plan; it is a **read** and carries no push
  watermark.

## Decision

Record the approved M1-D push-reconciliation cursor/watermark policy. This is a decision
contract only: no code, schema, seed, API, route, flag or environment change is made by this
ADR.

### Per-learner monotonic integer version/cursor

- Each learner has one monotonic integer cursor/version that increases by 1 per newly applied
  review event (a per-learner "projection version" watermark). It is per-learner, never
  global, never a timestamp, and never shared across learners.
- The cursor is incremented **only** when a review event is newly applied to the server
  projection. "Newly applied" means the event passed validation and conflict checks and its
  write claim won the idempotency race inside `writeAtomically` (`claimed.rows.length === 1`).
- The following do **not** increment the cursor:
  - idempotent replay of the same `(learner, clientEventId)` with an identical payload
    (existing event returned, `idempotent: true`, schedule not re-applied);
  - `validation` outcomes (unknown contentId, missing schedule, out-of-window payload);
  - `idempotencyConflict` (same `clientEventId`, different payload — nothing is applied);
  - `clockSkew` outcomes;
  - unpublished/unapproved content (`resolveCardId` only resolves cards with an
    `approved`/`published` `card_versions` row).
- The cursor/version is committed in the **same transaction** as the event insert and the
  schedule update, so the cursor is always consistent with the applied projection: one atomic
  unit either applies the event, advances the schedule and bumps the cursor, or applies none
  of them.

### Response semantics

- A response cursor (e.g. the cursor returned after a successful batch) is the
  **authoritative projection version at the time the batch was applied** — it is not proof
  that every local event was acknowledged. Local events that returned `validation`,
  `idempotencyConflict` or `clockSkew`, and events omitted from the response, are not
  acknowledged regardless of the cursor value.
- The client removes a local event **only** on an exact acknowledgement of its
  `clientEventId` (the existing `acknowledgeSyncEvents` invariant). A cursor alone never
  authorizes removal.
- A malformed or partial response (transport failure, failed parse, interrupted batch,
  missing outcomes, server fault → `serverUnavailable`) preserves the local queue unchanged
  and preserves the previously held cursor; the client retries and reconciles, never
  discarding unacknowledged events.
- On reconnect, the client uses the stored cursor only to request "what has been applied since
  my last confirmed position"; it never treats the cursor as a per-event acknowledgement list.

### Exclusions and boundaries

- The cursor is **never** a timestamp. Timestamps are untrusted device input and
  `applied_at` is audit metadata only — it records when the server applied an event and is not
  the reconciliation watermark.
- The cursor is **never** global: there is no cross-learner ordering or shared counter.
- The cursor does **not** replace idempotency. Idempotency remains keyed by
  `(user_id, client_event_id)` with payload equality (migration 0013, §3.1 of the contract);
  the cursor is an additional per-learner projection version for reconciliation, not a
  deduplication key.
- `applied_at` remains audit metadata: monotonic server time per event, never used as the
  client cursor, never exposed as a sync signal.
- The cursor is not exposed as "all local events are acknowledged" proof anywhere in the API
  or UI; the truthful pending queue is the client's own unacknowledged events, and no UI may
  claim server persistence without exact acknowledgements.

## Implementation constraints for the future M1-D task

- The future slice is serial, additive, learner-scoped where it touches sync keys, covered by
  a migration test, and reuses the existing transaction (`writeAtomically`) rather than adding
  a second write path (`M1_ONLINE_LEARNING_CONTRACT.md` §11, §12.5;
  `M1D_SYNC_PERSISTENCE_SLICE1.md` "Next steps").
- No production, payment, OTP, Preview, server activation or flag enablement is authorized by
  this decision. `MOBILE_REVIEW_SYNC_ENABLED`, `MOBILE_AUTH_ENABLED`,
  `LEARNER_STATE_ENABLED` and `WEB_LEARNER_STATE_ENABLED` defaults are untouched.

## Consequences

- Clients get a compact, authoritative reconciliation signal while the exact-acknowledgement
  invariant stays intact; a cursor can never cause loss of a local event.
- The transaction boundary guarantees the cursor and the projection move together; no
  "event applied but cursor not advanced" or vice versa.
- The response-cursor semantic prevents clients from deleting unacknowledged events on
  partial/malformed responses.
- The boundary rules keep the cursor orthogonal to idempotency and to `applied_at`, so the
  existing 0013 semantics remain authoritative for deduplication and audit.

## Out of scope

- Migration, schema, service, route, API, seed, catalog, flag, environment, mobile or web
  code — none are added by this ADR.
- The `idempotencyConflict` resolution policy (retry with new ID vs tombstone) remains open
  (`M1_ONLINE_LEARNING_CONTRACT.md` §6).
- Server-push notification/delivery of changes to clients (this is a client-pull
  reconciliation watermark, not a push channel).
- Personal vocabulary and progress/streak server contracts (own decisions).

## Reversal trigger

Re-open this decision if the server ever needs cross-learner ordering, if the cursor becomes
timestamp-derived, if the cursor is used as an acknowledgement list, or if a second write path
would decouple the cursor from the event+schedule transaction.
