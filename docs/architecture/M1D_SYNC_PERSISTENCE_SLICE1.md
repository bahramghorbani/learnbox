# M1-D Sync and Persistence — Implementation Slice 1

**Status:** merged (PR #152); superseded for cursor semantics by **Slice 1b** (this file's
appendix below) and ADR 0014.
**Basis:** `origin/main` at `8806543` (M1-A contract PR #151 merged).
**Scope authority:** `.ai/WORK_QUEUE.md` M1-D workstream (W6, serial for migrations/auth,
separate worktree). **No production, payment, OTP, Preview, background sync or server
deployment is enabled by this slice.**

## What this slice implements

Contract section 12.3 (server-authoritative learner state read) with the smallest coherent
production path that reuses only verified M1-A seams:

- `GET /api/learner/state` — server-authoritative schedule snapshot + due-card plan +
  server-held review-event count, for post-reconnect reconciliation.
- Learner identity derived only from the verified native access token (`sub`); never from a
  client-supplied user ID.
- Fail-closed runtime behind an explicit `LEARNER_STATE_ENABLED=true` flag plus complete
  `DATABASE_URL` / `LEARNBOX_MOBILE_SESSION_SECRET` config — exactly the
  `MOBILE_REVIEW_SYNC_ENABLED` pattern. Default environment: route returns 503
  `serverUnavailable`, no cookie, no-store.
- The due-card plan comes from the same `createDailySessionPlan` learning-engine seam the
  review write path uses, so the response matches what the server would schedule next.
- Read-only PostgreSQL adapter: `card_schedules ⋈ cards` (via canonical `content_id`) and a
  `COUNT(*)` over `review_events`. No new schema, no migration (M1-D 12.5 requires migration
  coverage; this slice deliberately ships zero migrations so nothing new needs coverage).
- Same trust boundary as the review route: Bearer token only, HTTPS outside bounded loopback,
  strict JSON, typed errors from §9 taxonomy, `cache-control: no-store`.

## Why no migration in this slice

- `card_schedules` already carries `state/stability_days/difficulty/lapses/due_at` and the
  user-scoped due index; `review_events` already has the learner-scoped idempotency key. The
  read needs no new columns.
- The contract's only unresolved persistence questions are for a **push** reconciliation
  direction (server-persisted `acknowledgement` watermark / client-cursor), which the M1-A
  contract explicitly leaves open ("Proposed (M1-D): policy ... not specified today"). Adding
  a table for an unspecified push contract would be speculative schema.
- **Future push-reconciliation slice must be serial, additive and covered by a migration test
  (M1-D 12.5); it must implement the cursor/watermark policy approved in
  [ADR 0014](ADR/0014-push-reconciliation-cursor-policy.md): a per-learner monotonic integer
  version, incremented only when a review event is newly applied, committed in the same
  transaction as the event and schedule update. It will also need an explicit decision on
  what the server should do with events acknowledged-but-not-yet-applied vs applied.

## Wire contract (documented, matches implementation)

`GET /api/learner/state` with `Authorization: Bearer <access-token>`.

- `200`:
  ```json
  {
    "schedules": [
      {
        "cardId": "uuid",
        "contentId": "canonical content id",
        "state": "review",
        "stabilityDays": 2,
        "difficulty": 4.9,
        "lapses": 0,
        "dueAt": "2026-07-25T12:00:00.000Z"
      }
    ],
    "plan": {
      "mode": "normal",
      "reviewCardIds": ["uuid"],
      "newCardIds": [],
      "message": "امروز یک قدم کوچک و پیوسته کافی است."
    },
    "reviewEventsCount": 3
  }
  ```
- `400 validation` (non-GET, insecure transport); `401 invalidToken` (missing/malformed/invalid
  Bearer); `503 serverUnavailable` (runtime disabled/incomplete, DB fault) — all with
  `cache-control: no-store`, no cookies.

## Implementation notes and deliberate limits

- `newCards` is always `[]` and `suggestedNewCards` is `0`: new-card intake needs the catalog
  (content factory + pack membership) contract, which is a separate M1-B decision. The plan
  seam is already wired so adding it later is a service-level change only.
- `importance` is fixed to `1` per schedule row (`ponytail` comment in the service): the
  recovery risk score uses it, but `card_schedules` has no importance column and M1-A does not
  define one. Recovery-mode risk ordering is therefore flat until M1-B defines catalog
  importance.
- `reviewEventsCount` is an exact server count, not a pending/acknowledged delta; the client
  reconciles its local pending queue against it.
- No endpoint was invented beyond the documented snapshot; no route, flag, provider, migration,
  mobile/web surface or queue file was changed.

## Tests (TDD: failing first, then implementation)

- `packages/learning-engine/test/exact-acknowledgement.test.ts` — exact-match acknowledgement
  semantics (no loss of unacknowledged events; duplicates/unknown ids acknowledged → nothing
  removed) on the shared seam used by the sync contract (M1-D 12.4).
- `packages/learning-engine/test/reconnect-plan.test.ts` — server plan excludes acknowledged
  events and suspended/archived cards (M1-D 12.3 plan property).
- `apps/api/test/learner-state.service.test.ts` — plan composition from the server schedule
  projection, fixed clock injection, empty-learner fail-closed.
- `apps/api/test/learner-state-http.test.ts` — token/HTTPS/method boundary, exact response
  shape with no-store, typed `serverUnavailable` propagation.
- `apps/website/test/mobile-review-route.test.ts` — added fail-closed runtime assertions for
  `LEARNER_STATE_ENABLED` (mirrors the existing review-route fail-closed contract, M1-D 12.6).

## Check evidence

- `pnpm --filter @learnbox/learning-engine test` — 13 files / 36 tests passed.
- `pnpm --filter @learnbox/api test` — 23 files / 101 tests passed (includes both new suites).
- `pnpm --filter @learnbox/website test` — 24 files / 143 tests passed (after
  `pnpm --filter @learnbox/billing-core build`, a pre-existing workspace dist prerequisite).
- `pnpm --filter @learnbox/api typecheck`, `pnpm --filter @learnbox/learning-engine typecheck`
  — clean.
- `node scripts/validate-migrations.mjs` — 13 migrations validated (contiguous).
- `git diff --check` — clean.

## Next steps (not in this slice)

1. Push-reconciliation contract decision (server ack watermark / client cursor) with migration
   test coverage (M1-D 12.5) — serial, owner-reviewed. The cursor/watermark **policy** is
   approved in [ADR 0014](ADR/0014-push-reconciliation-cursor-policy.md); the migration +
   service implementation remains a separate serial M1-D queue task.
2. M1-B web client moves from `learnbox:review-sync:v1:local-prototype` to this authenticated
   read + the existing review-write protocol; versioned storage keys.
3. New-card catalog candidates for `createDailySessionPlan` once pack membership is defined.
4. Observability names for sync outcomes per `docs/architecture/OBSERVABILITY.md` intent.

---

## Appendix — Slice 1b: per-learner reconciliation cursor (ADR 0014)

**Status:** implementation **partial** — server core only, no route/client integration.
Basis `origin/main` at `491611b` (ADR 0014 merged, PR #168). ADR 0014 remains the authoritative
decision contract and is unchanged.

What Slice 1b implements:

- Additive migration `0014_learner_reconciliation_cursor.sql`: per-learner monotonic
  `learner_reconciliation_cursors` table (`user_id UUID PK REFERENCES users(id)`, `cursor BIGINT
NOT NULL DEFAULT 0 CHECK (cursor >= 0)`) and atomic `advance_learner_reconciliation_cursor`
  function (`INSERT ... ON CONFLICT DO UPDATE SET cursor = cursor + 1 RETURNING cursor`).
- `PostgresReviewEventStore.writeAtomically` advances the cursor **only** for a newly claimed
  event (`claimed.rows.length === 1`) whose schedule update succeeded, in the same transaction
  as the event insert and schedule update (`BEGIN` → `INSERT` → `UPDATE` → `SELECT
advance_learner_reconciliation_cursor` → `COMMIT`). Exact idempotent replay returns the
  existing authoritative cursor and does not advance; idempotency conflict, missing schedule,
  validation, unknown/unpublished content and clock skew never advance.
- `ReviewEventWriteResult` gains `reconciliationCursor`; `MobileReviewBatchItemOutcome`
  `acknowledged` carries `reconciliationCursor` (authoritative projection version after the
  item), while `idempotencyConflict` / `validation` / `clockSkew` outcomes carry no cursor.
- No route, flag, environment, mobile/web client or queue file changed; the HTTP response
  shape keeps a single `outcomes` key (Flutter transport still requires exactly one key) and
  per-item exact acknowledgements remain the only basis for local queue removal. A cursor alone
  never deletes queue entries.

Remaining (separate serial M1-D slices): reading the cursor in `GET /api/learner/state`,
client-side cursor storage/reconciliation, and any route/client integration. Until then the
cursor is server-core only and the milestone stays partial / not production-ready.

---

## Appendix — Slice 1c: client-side cursor capture and persistence (ADR 0014)

**Status:** implementation merged locally in this slice; client-side capture/persistence plus
request serialization. **Network sync remains dormant** — production composition
(`MobileAuthConfig.defaults()`) still returns `signedOut` + `DisabledReviewSyncTransport`.
Basis `origin/main` at `9ff7c99` (PR #169). ADR 0014 remains the authoritative decision
contract and is unchanged.

What Slice 1c implements (allowed paths: `apps/mobile/lib/features/sync/**`,
`apps/mobile/test/**` sync tests, this appendix, `CURRENT_WORK.md`):

- `ReviewUploadResponse` gains an optional `reconciliationCursor` decimal string
  (never a Dart double or JS number); `acknowledgedClientEventIds` is preserved.
- `HttpReviewSyncTransport` strictly parses the existing single-key `{ "outcomes": [...] }`
  shape. An acknowledged outcome must carry a non-empty exact `clientEventId` **and** a valid
  non-negative decimal-string `reconciliationCursor`; a malformed acknowledged cursor or a
  malformed response is retryable (`validation`) and produces no acknowledgements.
  Non-acknowledged outcomes stay non-acknowledged. The request body always contains `items` and
  includes optional `reconciliationCursor` only when the stored cursor is present and valid.
  The cursor is a non-negative decimal string and is never sent as a Dart number.
- New `ReconciliationCursorStore` seam (`Future<String?> read()`,
  `Future<void> write(String cursor)`), injected into `ReviewSyncCoordinator` (optional;
  production does not inject one). Implementations fail closed: an invalid stored cursor is
  treated as absent (`parseReconciliationCursor`). `write` is called only after the response
  acknowledgement was fully validated **and** the queue acknowledgement succeeded.
- `ReviewSyncCoordinator` reads the prior cursor and persists the response cursor only after
  exact acknowledgement validation and a successful queue acknowledge. A cursor alone never
  removes queue entries. With no acknowledged events the cursor is never written. In-flight
  serialization is unchanged.
- `ReviewSyncResult.Synchronized` carries the persisted cursor as a decimal string
  (`cursor`), null when the transport reported none. It claims only exact acknowledgements;
  it never claims server sync beyond them.
- A cursor write failure returns `RetryableFailure` (never `Synchronized`) and preserves
  queue safety: the queue acknowledgement has already durably removed only the exact
  acknowledged events, so a retry reports `nothingPending` and the server's idempotency +
  next-batch cursor recover the position. No event loss and no false synchronized claim.
  This ordering (queue acknowledge before cursor write) is deliberate and documented.

Tests (TDD: failing first, then implementation):

- `apps/mobile/test/reconciliation_cursor_store_test.dart` — fail-closed invalid stored
  cursors (empty, whitespace, sign, decimal, exponent, hex, non-ASCII), round-trip,
  no clearing on failed write.
- `apps/mobile/test/reconciliation_cursor_transport_test.dart` — valid decimal-string
  cursor parse, no cursor without an acknowledged outcome, one-key request shape with no
  cursor field, malformed/missing/negative/non-decimal/non-string cursor rejection,
  extra top-level key rejection.
- `apps/mobile/test/reconciliation_cursor_coordinator_test.dart` — exact ack + cursor
  persistence, invalid stored cursor fail-closed, no-ack no-write, cursor write failure is
  retryable and never deletes acknowledged events (recoverable on retry), cursor alone
  never authorizes queue removal, idempotent replay keeps acknowledged removal semantics.

Remaining (separate serial M1-D slices): server request parsing/route integration, delta response
semantics, and production composition/flag enablement. The milestone stays partial /
not production-ready; production sync remains disabled.
