# M1-D Sync Wire Contract — Proposed Pull-Based Reconciliation Read

**Status: PROPOSED / NOT IMPLEMENTED.** Decision-ready design contract only. No code,
schema, migration, route, flag, environment, auth, mobile/web surface, queue file or
deployment change is made by this document. All sync flags remain false
(`MOBILE_REVIEW_SYNC_ENABLED`, `MOBILE_AUTH_ENABLED`, `LEARNER_STATE_ENABLED`,
`WEB_LEARNER_STATE_ENABLED`); implementation requires a separately authorized serial M1-D
queue task (migration + service + route + tests).

**Basis:** `origin/main` at `4718f93` (PR #204 merged). Read with
`docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md` (§3, §5, §6, §8, §9, §12),
`docs/architecture/M1D_SYNC_PERSISTENCE_SLICE1.md` (Wire contract / Next steps /
appendixes 1b–1d), `docs/architecture/ADR/0014-push-reconciliation-cursor-policy.md`,
`apps/api/src/reviews/mobile-review-batch.request.ts`,
`apps/api/src/reviews/mobile-review-batch.service.ts`,
`apps/website/lib/mobile-review-http.ts`, `docs/architecture/OFFLINE_SYNC.md`.

## 1. Scope and current facts

Goal of the eventual M1-D implementation slice this contract describes: give a learner's
client a compact server-authoritative signal of _which of its locally queued review events
the server has applied_, so the client can reconcile after reconnect without guessing, and
with no risk of deleting an unacknowledged event.

Verified current facts (`origin/main` at `4718f93`):

- **POST exists, dormant:** `POST /api/reviews/mobile` is implemented behind
  `MOBILE_REVIEW_SYNC_ENABLED !== 'true'` → 503 `serverUnavailable`, no cookie, no-store
  (`apps/website/app/api/reviews/mobile/route.ts`,
  `apps/website/lib/mobile-review-http.ts`, `mobile-review-runtime.ts`). Body:
  `{ items: [{ contentId, grade, occurredAt, clientEventId }] }` plus optional
  non-negative decimal-string `reconciliationCursor` (validated at the boundary, **not**
  forwarded to the domain seam — Slice 1d). Max 20 items, ≤16 KiB body, Bearer token only,
  HTTPS outside bounded loopback, duplicate `clientEventId` within one batch → 400
  `validation`.
- **Response shape today:** 200 `{ "outcomes": [...] }` — exactly one top-level key
  (Flutter transport requirement). Per-item outcomes: `acknowledged` (with `eventId`,
  `idempotent`, `reconciliationCursor` — decimal string, never a number),
  `idempotencyConflict`, `validation`, `clockSkew` (no cursor on non-acknowledged
  outcomes).
- **Server core cursor exists:** migration 0014
  (`learner_reconciliation_cursors`, `advance_learner_reconciliation_cursor`) and 0015
  (`review_events.reconciliation_cursor` BIGINT, per-event binding) are merged; cursor
  advances only when an event is newly applied inside `writeAtomically`. Per-event cursor
  read back on idempotent replay via `COALESCE(e.reconciliation_cursor, 0)`; NULL legacy
  rows report `'0'`. Server core only — **no read route exposes the cursor.**
- **Client cursor capture exists, dormant:** Slice 1c added `ReconciliationCursorStore`
  and coordinator capture/persistence (write only after exact ack + successful queue
  acknowledge; a cursor alone never removes queue entries). Slice 1b/1c/1d all state:
  "Remaining (separate serial M1-D slices): delta response semantics, and production
  composition/flag enablement."
- **GET learner state exists, dormant:** `GET /api/learner/state` returns `schedules`,
  `plan`, `reviewEventsCount` (exact `COUNT(*)`, not a watermark) behind
  `LEARNER_STATE_ENABLED`. It is a read and carries **no** reconciliation cursor today
  (Slice 1b "Remaining").
- **No pull/delta endpoint exists anywhere.** No endpoint returns "events applied since
  cursor N" and no endpoint returns a learner's applied `clientEventId`s. ADR 0014 §Out of
  scope confirms no server-push channel; the decision is a client-pull watermark.
- **Open policies (must not be silently resolved):** `idempotencyConflict` resolution
  (retry with new ID vs tombstone; contract §6, ADR 0014 §Out of scope) and server
  filtering semantics for acknowledged-but-not-yet-applied events (Slice 1 "Next steps").

## 2. Proposed endpoints

**Recommendation: pull-based `GET` reconciliation paired with the existing `POST`.**
One new endpoint, additive, read-only, learner-scoped:

```
GET /api/reviews/mobile/reconciliation?after=<cursor>
```

- Query parameter `after`: optional non-negative decimal string; absent/`0` means "from the
  beginning of this learner's applied events".
- **This endpoint does not exist.** It is proposed here; implementing it (including its
  route file, flag gating, parser and tests) is a separate authorized serial M1-D queue
  task. Until then it returns nothing because it is not registered.
- Response returns applied events **newly applied since the learner's cursor value
  `after`** (cursor semantics per ADR 0014: per-learner monotonic integer version), in
  ascending applied order, plus the new authoritative cursor.
- The endpoint is **read-only**: it never applies, re-applies, schedules or deletes
  anything. The existing `POST /api/reviews/mobile` remains the only write path and stays
  the only place per-item outcomes are produced.
- Trust boundary identical to the existing review route: Bearer token only (subject `sub`
  is the learner; never a client-supplied user ID), HTTPS outside bounded loopback in
  development, `cache-control: no-store`, no cookies, strict JSON, §9 error taxonomy.
- Dormant by default: same fail-closed pattern as `POST` — without
  `MOBILE_REVIEW_SYNC_ENABLED=true` plus complete config the route returns 503
  `serverUnavailable`.

Why pull over push: ADR 0014 explicitly scopes the cursor as a client-pull reconciliation
watermark, not a push channel; the existing sync loop is already client-initiated
(foreground coordinator, bounded backoff, no background work allowed without a separate
queue task per M1-C 12.3); a pull read reuses the authenticated request path and needs no
connection/notification infrastructure. See §12 Alternatives.

## 3. Request/response JSON examples

No secrets in any example — tokens shown as `***`.

### 3.1 Existing POST (context; unchanged, already implemented)

Request:

```json
{
  "items": [
    {
      "clientEventId": "evt_a1b2c3d4",
      "contentId": "start-a1-haus",
      "grade": "remembered",
      "occurredAt": "2026-09-05T08:12:00.000Z"
    }
  ],
  "reconciliationCursor": "41"
}
```

Response `200`:

```json
{
  "outcomes": [
    {
      "status": "acknowledged",
      "clientEventId": "evt_a1b2c3d4",
      "eventId": "9f1c2c6e-3a44-4c7a-9e2b-000000000001",
      "idempotent": false,
      "reconciliationCursor": "42"
    }
  ]
}
```

Error responses keep the existing shape: 400 `{ "error": "validation" }`, 401
`{ "error": "invalidToken" }`, 503 `{ "error": "serverUnavailable" }`.

### 3.2 Proposed GET reconciliation (does not exist)

Request:

```
GET /api/reviews/mobile/reconciliation?after=42
Authorization: Bearer ***
```

Response `200` — exact proposed shape, one top-level key (keeps the single-key transport
constraint used by the Flutter HTTP transport):

```json
{
  "reconciliation": {
    "cursor": "42",
    "nextCursor": "47",
    "hasMore": false,
    "events": [
      {
        "clientEventId": "evt_b9f0e1d2",
        "eventId": "9f1c2c6e-3a44-4c7a-9e2b-000000000002",
        "appliedAt": "2026-09-05T08:20:01.000Z"
      },
      {
        "clientEventId": "evt_c3d4e5f6",
        "eventId": "9f1c2c6e-3a44-4c7a-9e2b-000000000003",
        "appliedAt": "2026-09-05T08:25:40.000Z"
      }
    ]
  }
}
```

Semantics of each field:

- `cursor` — echo of the requested `after` (authoritative projection version the response
  is relative to). Present even with zero events.
- `nextCursor` — authoritative per-learner projection version at the time the read
  executed; equal to `cursor` when nothing new was applied.
- `hasMore` — page flag; `true` when more applied events exist beyond this page
  (server-side page cap, e.g. 100 per page, pending the implementation slice).
- `events[]` — applied events with `appliedAt` newer than the position of `cursor` (see
  §5 for the exact boundary rule). `eventId` is the server event UUID; `appliedAt` is
  server-authoritative audit metadata, **never** the client cursor. **No content, grade,
  schedule or learner PII is returned** — the event log fields are the learner's own
  history and are out of scope for this contract until a separate decision; the
  reconciliation read needs only identity + timing to prove "applied".

Error responses (proposed, same taxonomy): 400 `{ "error": "validation" }` for malformed
`after` (non-decimal, signed, exponent, or exceeding the BIGINT string bound), 401
`invalidToken`, 503 `serverUnavailable` (flag off / incomplete config / DB fault), all
`no-store`.

## 4. Per-item acknowledgement and cursor semantics (ADR 0014)

The GET read never replaces per-item acknowledgement; it complements it.

- **Removal rule (unchanged, authoritative):** the client removes a local event **only**
  on an exact acknowledgement of its `clientEventId` in a complete, validated `POST`
  `outcomes` response (`acknowledgeSyncEvents` invariant). A cursor alone — including
  `nextCursor` from this GET — never authorizes queue removal (ADR 0014 §Response
  semantics; Slice 1c coordinator tests).
- **What the GET is for:** post-reconnect reconciliation of _what has been applied_ since
  the client's last confirmed position. A `clientEventId` present in
  `reconciliation.events` with `eventId` matching is server proof that event was applied;
  a client that lost its `outcomes` response (transport failure after server commit) can
  match `clientEventId` here and safely acknowledge it — because the event idempotently
  re-POSTs as `acknowledged`/`idempotent: true` anyway (see §6), matching is
  corroboration, not a second write path.
- **Response cursor = authoritative projection version at read time, not an
  acknowledgement list.** If the client's POST response was lost, the GET's `events`
  (not the bare cursor) is the evidence used; the client still applies its exact-ack
  removal invariant on the matched `clientEventId`s.
- **Idempotent replay does not advance the cursor** (ADR 0014; Slice 1b): re-POSTing an
  already-applied event returns the stored event with `idempotent: true` and its stored
  per-event cursor; `nextCursor` semantics therefore never double-count retries.
- **Cursor domain:** non-negative integer, decimal string over the wire, BIGINT server-side
  (`CHECK (cursor >= 0)`); per-learner, never global, never a timestamp, never a JS/Dart
  number (Slice 1b/1c enforce decimal-string transport). `appliedAt` stays audit
  metadata.
- **Cursor equality boundary (open detail for the implementation slice):** events are
  "since `after`" when the event's applied position is greater than the projection
  position `after` represents. Implementation must define the position source exactly —
  two candidate readings, both consistent with ADR 0014, must be picked in the queue task:
  (a) per-event `reconciliation_cursor` on `review_events` (migration 0015) — "events
  whose stored event cursor > after-cursor"; (b) learner cursor table — "events applied
  after the learner cursor equaled `after`". (a) is preferred (per-event binding already
  exists, NULL-legacy rows coalesce to `'0'`, no new join) but the exact SQL and its
  migration test belong to the implementation slice. Both readings must never return an
  event whose `clientEventId` the learner has not actually had applied, and must never
  return the same event twice across pages.

## 5. Idempotency and ordering

- **Idempotency stays keyed by `(user_id, client_event_id)` with payload equality**
  (migration 0013, contract §3.1). The GET adds no deduplication key and no second write
  path; it only reads.
- **Ordering within the response:** ascending applied order (by per-event cursor /
  applied position). The append-only `review_events` log and per-learner cursor make this
  deterministic; no client-supplied timestamp orders anything (device time is untrusted —
  `applied_at` is server-set).
- **Ordering across pages:** `after` + `nextCursor` chaining; `hasMore: true` means the
  client re-issues with `after=<nextCursor>`. The client must not assume a page boundary
  aligns with an acknowledgement boundary — per-item matching still governs removals.
- **No re-application:** nothing in the GET path re-runs `scheduleReview`,
  `writeAtomically` or `bootstrap_approved_card_schedules`. Read-only projection query.

## 6. Malformed/partial response and retry

- **POST (existing, unchanged):** malformed or partial `outcomes` (failed parse, missing
  item, server fault → 503 `serverUnavailable`) preserves the local queue unchanged and
  preserves the previously held cursor; client retries and reconciles, never discarding
  unacknowledged events (ADR 0014 §Response semantics; Slice 1c). `acknowledged` outcomes
  missing a valid decimal-string cursor are rejected as retryable `validation` with no
  acknowledgements (Slice 1c transport tests).
- **GET (proposed):** any non-200, failed parse, malformed `events[]` entry, or
  `nextCursor` that is not a valid non-negative decimal string (or is numerically less
  than the requested `after` — server fault signal) is retryable and changes no local
  state: no queue removal, no cursor write. A `500`-class or `503` failure keeps the
  stored cursor and the client retries with the same `after`; the read is side-effect
  free, so retries are safe at any backoff (existing bounded exponential backoff,
  `retryAfter`).
- **Partial page:** if the client disconnects mid-page, the whole page is discarded
  (response is atomic in the sense that it is one JSON document); the client re-requests
  from the same `after`. No per-item partial state on the client from the GET.
- **Timeout policy:** bounded request timeout identical to the POST transport default
  (15 s in `HttpReviewSyncTransport`); timeout → retryable, no state change.

## 7. Offline/reconnect

- Queue survives restart; corrupt queue fails closed to empty and never reaches the server
  (`OFFLINE_SYNC.md`; `offline-sync-storage.ts`).
- **Reconnect sequence (proposed):** (1) POST pending queue events in persisted order,
  batches of ≤20; (2) remove only exactly acknowledged `clientEventId`s; (3) persist the
  last acknowledged `reconciliationCursor` only after a fully validated response and a
  successful queue acknowledge (Slice 1c ordering); (4) when the queue reports
  `nothingPending`, GET reconciliation with `after=<stored cursor>` to close the
  gap of events whose POST response was lost; match `events[].clientEventId` against
  local history; (5) update stored cursor to `nextCursor` only when the response was fully
  validated. Steps 4–5 are the proposed use of the new endpoint; steps 1–3 exist today
  (dormant).
- A GET response proving an event was applied must never cause the client to _delete_ the
  local event unless the exact-acknowledgement invariant is honored — the proposed client
  behavior is to re-POST the unmatched event (server returns `idempotent: true` +
  per-event cursor) and let the POST acknowledgement perform removal. This keeps one
  removal authority. (Alternative — direct removal on GET match — is listed in §12 as
  rejected: it would create a second, unvalidated removal path.)
- UI truthfulness: the client reports "pending / synced" only from its own
  unacknowledged queue and validated responses; a GET match alone may update "server has
  this event" indicators only with exact `eventId` corroboration (M1-D 12.4; contract
  §5.3 / M1-B 12.4 "no false synchronized claim").

## 8. Concurrent devices

- Cursor is **per-learner**, shared across a learner's devices: two devices syncing the
  same account observe one monotonic projection version. Whichever device's POST wins the
  idempotency race first advances it; the loser's identical-payload replay returns
  `idempotent: true` with the stored cursor (Slice 1b) and does not double-apply.
- A device that was offline while another device synced will, on reconnect, GET a
  `nextCursor` far ahead of its stored `after` and see the other device's applied
  `clientEventId`s. That device's own queue holds only its own locally generated events
  (each device generates its own `clientEventId`s; learner-scoped uniqueness means a
  cross-device collision is a genuine conflict → `idempotencyConflict`, see §9/§13) —
  the foreign events are informational, not local-queue removals.
- No cross-device ordering guarantee beyond per-learner monotonic cursor; no global
  counter (ADR 0014 §Exclusions). If a learner's events must be attributed to a device,
  that requires the separate anonymous-device-identity decision (contract §1.2 — open,
  not in this contract).

## 9. Unknown/unpublished content

- Server resolves `contentId` → `cards.id` only for content with an `approved`/`published`
  `card_versions` row (`resolveCardId`); unknown or unpublished content → per-item
  `validation` on POST, never applied, never advancing the cursor (ADR 0014; contract §4).
- Unpublished content therefore never appears in GET reconciliation `events` — only
  applied events are listed. If content is unpublished _after_ events were applied, the
  applied events remain applied and remain listed; the GET is a statement about the event
  log, not about current content publishability. Client consequences (e.g. hiding a card)
  are a content-surface decision, out of scope here.
- **Server filtering semantics are owner-resolved for M1:** acknowledge is issued only after application, so there is no acknowledged-but-not-yet-applied state and no deferred filtering behavior. Future deferred server states would require a new decision.

## 10. Server identity boundary

- Learner identity derived **only** from the verified Bearer access token subject (`sub`)
  (`mobile-session.ts` HMAC-SHA256, `v:1`, audience `learnbox-mobile`, 15-minute
  lifetime). The client never sends a user/DB identifier; the GET path resolves
  `after` against the token subject's own cursor table only.
- Bearer syntax and limits as today: `^Bearer ([A-Za-z0-9._-]{1,2048})$`; invalid →
  401 `invalidToken`. No browser Origin/CORS/cookie/installation-ID trust on the review
  surface (contract §7).
- The GET must return an empty/`cursor == nextCursor` result — never an error — for a
  valid learner with no cursor row yet (cursor defaults to `0`, migration 0014
  `DEFAULT 0`); a missing row is the zero state, not a fault.

## 11. No-data-loss invariants

Restated as acceptance invariants for the implementation slice (each maps to an ADR 0014
rule):

1. A local event is removed only by exact acknowledgement of its `clientEventId` in a
   complete validated POST `outcomes` response. (I1)
2. No cursor value, from POST or GET, ever authorizes removal of an unacknowledged event.
   (I2)
3. A malformed/partial/failed POST or GET response preserves the local queue and the
   previously held cursor. (I3)
4. Cursor and applied projection move in the same transaction on the write path
   (migration 0014/0015 already implement this); the GET never observes or reports an
   inconsistent pair. (I4)
5. Idempotent replay and every non-applied outcome (`validation`,
   `idempotencyConflict`, `clockSkew`) never advance the cursor. (I5)
6. GET paging never skips or duplicates an applied event across pages for a fixed
   `after` (ascending position + `nextCursor` chaining + `hasMore`). (I6)
7. Unmatched local events survive every reconnect sequence and stay retryable. (I7)

## 12. Alternatives considered

- **A. Push channel / server-sent event delivery (rejected):** ADR 0014 explicitly
  scopes out server push; M1-C forbids background work/connectivity listeners without a
  separate queue task; adds notification infrastructure with no M1 payoff. The client is
  already the sync initiator with bounded backoff.
- **B. Client asks "are these N event IDs applied?" POST (rejected for now):** would
  require the client to retain unbounded local history to ask about; the cursor read is
  O(applied-since-position) server-side and needs no client history beyond its stored
  cursor. Could be reconsidered later if content-level detail is needed in responses
  (see open decision O-3).
- **C. Reuse `GET /api/learner/state` and add the cursor there (rejected for this
  slice):** `reviewEventsCount` is an exact `COUNT(*)`, not a watermark, and the state
  snapshot answers "what is due now", not "what was applied since N". Mixing both
  contracts couples the due-plan read to event-log paging and grows that response; the
  state endpoint can gain a top-level `reconciliationCursor` field later if a client
  wants one round trip (Slice 1b "Remaining" already lists it).
- **D. Cursor-less full replay: client re-POSTs entire queue every reconnect (rejected):**
  correct only because idempotency exists, but wasteful and it cannot distinguish
  "applied on another device" from "never seen" without extra round trips; ADR 0014 exists
  precisely to avoid it.
- **Recommendation:** the §2 GET reconciliation read (pull, paired with existing POST),
  implemented as a serial M1-D queue task with migration test coverage, additive,
  learner-scoped, dormant behind the existing sync flag.

- **Owner-approved O-1:** on `idempotencyConflict` (same learner-scoped `clientEventId` with a different payload), keep the conflicting local event pending; do not overwrite or delete the previously applied event. After client-visible resolution, retry requires a new `clientEventId`. No silent automatic retry or tombstone behavior is added.
- **Owner-approved O-2:** M1 uses strict one-step semantics. Acknowledge only after the review event and schedule are applied atomically in the same transaction. There is no accepted-but-not-yet-applied state in M1, and deferred server filtering semantics are not implemented.
- **Implementation boundary:** these decisions do not implement or enable the proposed GET endpoint; implementation remains a separate serial task requiring API/security/migration review.
- **O-3 Event detail in reconciliation responses:** this contract returns `clientEventId`/`eventId`/`appliedAt` only. Whether the GET should later carry content, grade, schedule or per-device attribution requires the anonymous-device-identity and event-read-API decisions (contract §1.2, §3.2) and a privacy review — the response contains learner-identifying event history.
- **O-4 Page size** for `hasMore` paging (proposed 100, unbounded beyond the current flag-gated rollout) and whether the response cap should be a route constant mirroring the POST 16 KiB body cap.
- **O-5 Whether `GET /api/learner/state` should also expose the learner cursor** for a one-round-trip client (additive field, deferred).

## 14. Observability without PII

Proposed event/metric names for the implementation slice (per `OBSERVABILITY.md` intent;
contract §10 — nothing implemented today):

- Counters by sync outcome: `sync.review.batch.acknowledged`,
  `sync.review.batch.idempotency_conflict`, `sync.review.batch.validation`,
  `sync.review.batch.clock_skew`, `sync.review.batch.server_unavailable` (POST, existing
  intent); new: `sync.review.reconciliation.ok`, `sync.review.reconciliation.empty`,
  `sync.review.reconciliation.page` (hasMore true), `sync.review.reconciliation.error`.
- Dimensions: outcome/status only. **Never log or metric raw phone, OTP, token,
  `clientEventId`, `eventId`, content identifiers, timestamps of learner activity, or
  cursor values** — cursor values are learner-state signals and must stay out of logs.
- Alert thresholds: reconciliation error rate and paging-depth distribution per
  `SCALING.md`/OBSERVABILITY guidance; set before launch, not in this slice.

## 15. Versioning/compatibility

- **Server:** additive only. New route + response shape; existing POST request/response
  unchanged. The optional request `reconciliationCursor` stays validated-but-unused on the
  POST until a later slice (Slice 1d behavior preserved).
- **Client:** transport parses strictly (exact single-key shape). New GET parsing is a new
  transport capability; unknown extra keys rejected, missing required keys retryable —
  matching `HttpReviewSyncTransport` strictness. Cursor stays decimal string end to end.
- **Wire stability:** response field names and semantics in §3.2 are the contract; adding
  optional fields later is backward compatible; changing `nextCursor`/`hasMore` semantics
  is a versioned contract change requiring its own decision.
- **Legacy rows:** NULL `reconciliation_cursor` events (pre-0015) coalesce to `'0'`
  (LB-DS-025); the GET must page them consistently with the (a) reading in §4 or document
  the boundary chosen in the implementation slice.

## 16. Rollout/rollback

- **Rollout:** implementation slice lands dormant behind the existing
  `MOBILE_REVIEW_SYNC_ENABLED` fail-closed flag (default unset/false → 503). No client
  sends GET traffic until the separate composition/enablement task flips flags with
  owner approval. Server-side, the read needs only the merged 0014/0015 schema — no new
  migration is required if the (a) reading (§4) is chosen; if (b) requires an index, that
  additive index migration ships with its own migration test in the queue task.
- **Rollback:** delete route registration (or leave flag false) → endpoint 503s; no
  client behavior change because no client is composed against it. Client-side, drop the
  GET call and stored cursor use → existing POST-only flow, unchanged semantics. No
  destructive schema change at any step; no backfill needed (legacy NULL coalescing
  already defined).
- **Security review:** required before any flag enablement — the GET returns a learner's
  applied-event history, so authorization (token subject scoping), the §14 no-PII
  logging rule, and the page-size cap must be reviewed. Route-file and parser tests must
  cover the §9 taxonomy and §10 boundary before the route is composed. Per ADR 0014
  §Implementation constraints: serial, additive, learner-scoped, migration-test-covered,
  reusing the existing transaction/write path rather than a second one.

## 17. Future implementation acceptance criteria

The eventual serial M1-D queue task is accepted when (each maps to this contract):

1. `GET /api/reviews/mobile/reconciliation?after=N` exists behind the sync flag, returns
   exactly the §3.2 shape, and 503s fail-closed when the flag/config is absent
   (mirroring the POST route tests).
2. Response events are exactly the learner's newly applied events since `after`, in
   ascending applied order, with no skips/duplicates across `hasMore` pages (I6) — proven
   by a migration test where required and service tests with a mocked store.
3. Removing events requires exact POST acknowledgements; GET responses never remove queue
   entries (I1/I2) — client coordinator tests extended for the reconnect sequence §7.
4. Legacy NULL-cursor rows and a fresh learner with no cursor row behave per §4/§10.
5. Malformed `after`, non-decimal cursors, oversized pages, token faults and DB faults map
   to the §9 taxonomy with `no-store` (M1-D 12.6).
6. No new write path, no flag flip, no production enablement, no PII in logs (I4/I5,
   §11/§14) — `MOBILE_REVIEW_SYNC_ENABLED`, `MOBILE_AUTH_ENABLED`,
   `LEARNER_STATE_ENABLED`, `WEB_LEARNER_STATE_ENABLED` all remain false.
7. `scripts/validate-migrations.mjs` stays green; any new migration is contiguous,
   additive, learner-scoped, migration-test-covered, and its numbering follows 0015.
8. Owner decisions O-1/O-2 recorded (even if "unchanged, still open") in the task report.
