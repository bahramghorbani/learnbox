# M1 Online Learning Contract

**Status:** evidence-based contract audit for M1-A. Implementation of any proposal below
requires a separately authorized queue task (M1-D for sync/persistence, M1-B/M1-C for
surface work). **No production, payment, OTP, Preview or server activation is authorized by
this document.**

**Audit basis:** `origin/main` at `ed4a1a5` (M1/D0/D1 activation, PR #149).
**Status vocabulary (matches `docs/PRODUCT_STATUS.md`):**

- **Implemented (verified):** code/migration/test exists on `main` and is covered by current
  tests or docs.
- **Dormant:** implemented but deliberately disabled or unreachable in default builds.
- **Partial:** meaningful pieces exist, but the end-to-end user journey is not complete.
- **Proposed / not implemented:** contract statement is a recommendation for a future
  task (M1-D/M1-B/M1-C/M1-Q); no code on `main` implements it yet.
- **Unknown:** no evidence found; must be resolved before implementation starts.

---

## 1. Canonical entities

### 1.1 Verified on `main`

| Entity                                                            | Source of truth                                                    | Notes                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                                           | `database/migrations/0001_initial.sql`                             | `id UUID PK`, `phone_e164 TEXT UNIQUE NOT NULL`, `first_name`.                                                                                                                                                                                                                                                                           |
| `cards`                                                           | `0001_initial.sql` + `0013_native_review_transport.sql`            | `id UUID PK`; **canonical `content_id`** added in 0013: `TEXT NOT NULL`, 1–128 chars, unique, immutable via trigger `cards_content_id_immutable`, backfilled `'legacy-' \|\| id::text`.                                                                                                                                                  |
| `card_versions`                                                   | `0003_content_review.sql`                                          | Immutable versioned editorial content; `status content_status` enum; `UNIQUE (card_id, version)`.                                                                                                                                                                                                                                        |
| `card_schedules`                                                  | `0002_card_schedules.sql` + `0013`                                 | Mutable learner projection, `PK (user_id, card_id)`, fields `state`, `stability_days`, `difficulty`, `lapses`, `due_at`, `last_reviewed_at`, `updated_at`. Partial due index on `(user_id, due_at)` excluding `suspended`/`archived`.                                                                                                    |
| `review_events`                                                   | `0001_initial.sql` + `0013`                                        | **Append-only** event log. `0013` widens `client_event_id` UUID→TEXT (1–128 chars) and changes uniqueness from global to `UNIQUE (user_id, client_event_id)`; adds `applied_at TIMESTAMPTZ NOT NULL DEFAULT now()` (server-authoritative monotonic application time). Grade is a text CHECK: `forgot`, `hard`, `remembered`, `mastered`. |
| `mobile_learner_sessions`                                         | `0012_mobile_learner_sessions.sql`                                 | Hash-only mobile sessions: `user_id`, `installation_id`, `refresh_token_hash` (unique), `family_generation`, `absolute_expires_at`, `idle_expires_at`, `revoked_at`/`revoked_reason`, refresh-family checks.                                                                                                                             |
| `otp_challenges` / `otp_request_events`                           | `0007_otp_challenges.sql`, `0008_otp_request_events.sql`           | Opaque challenge + hash-only phone/IP rate-limit records; no raw phone/OTP persisted.                                                                                                                                                                                                                                                    |
| `content_review_decisions`, `content_review_checks`, `audit_logs` | `0003_content_review.sql`, `0006_content_review_quality_gates.sql` | Admin content review; reviewer/publisher separation (`approve` → `approved`; publishing is a separate role).                                                                                                                                                                                                                             |

### 1.2 Proposed / not implemented

| Entity                                                      | Proposal                                                                                                                                                                                                                                                       | Notes |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Device/installation identity as a learner-scoped identifier | `installation_id` already exists on `mobile_learner_sessions`; it is **never an authenticator** (ADR 0011). M1-D must decide whether an anonymous-device review identity is in scope. **Decision needed, not implemented.**                                    |
| Server-owned "Today"/due-card selection and session plan    | Learning engine exports `createDailySessionPlan`/`createRecoveryPlan` (`packages/learning-engine/src/session.ts`, `recovery.ts`), but no server route or persistence exposes them. **Proposed (M1-D)**, and must respect `card_schedules` due index semantics. |

---

## 2. Learning engine (shared scheduling seam)

**Implemented (verified):** `packages/learning-engine/src/index.ts`.

- Grades: `'forgot' | 'hard' | 'remembered' | 'mastered'` (factor map 0.35 / 0.8 / 1.8 / 3.0).
- `scheduleReview(schedule, grade, now)` is deterministic and conservative: stability floor
  10 minutes, interval floor 1 minute, `forgot` → `relearning` + lapse + difficulty +0.5,
  `mastered` only when stability ≥ 21 days, else `review`.
- Exported client-independent seam: `CardSchedule { state, stabilityDays, difficulty, lapses, dueAt }`.
- **Contract rule (verified):** the server is the only component that persists schedule
  projections. Clients never compute the authoritative schedule.

**Proposed:** the exact algorithm is replaceable server-side without changing clients
(comment in `index.ts`); any replacement must remain deterministic and keep
`CardSchedule` shape stable.

---

## 3. Review event schema and idempotency

### 3.1 Event identity and deduplication (verified)

Wire shape of one review item (server accepts `contentId`, not DB `card_id`):

```ts
interface ReviewEventInput {
  userId: string; // derived from access token, never sent by client
  cardId: string; // resolved server-side from canonical contentId
  grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
  occurredAt: Date; // untrusted device time, bounded server-side
  clientEventId: string; // client-generated, 1–128 chars, unique per learner
}
```

Evidence: `apps/api/src/reviews/mobile-review-batch.service.ts` and
`postgres-review-event.store.ts`, `packages/learning-engine/src/review-event.ts`.

**Idempotency rules (verified):**

- `clientEventId` uniqueness is **learner-scoped** (`UNIQUE (user_id, client_event_id)` in
  0013; legacy global UUID uniqueness replaced).
- `recordReviewEvent` checks `findByClientEventId` first; on hit returns existing event +
  schedule with `idempotent: true`, without scheduling again
  (`packages/learning-engine/src/review-event.ts`).
- `PostgresReviewEventStore.writeAtomically` claims the key inside one transaction
  (`INSERT ... ON CONFLICT (user_id, client_event_id) DO NOTHING`), then updates
  `card_schedules` in the same transaction; if the claim loses the race it re-reads and
  requires **payload equality** (`payloadMatches`: same cardId, grade, occurredAt,
  clientEventId). Different payload on replay → typed `ReviewIdempotencyConflictError` →
  per-item outcome `idempotencyConflict`.
- `applied_at` is server-authoritative: `GREATEST(COALESCE(MAX(applied_at) for card, now()),
LEAST(occurred_at, now()))` — monotonic, never before prior applied_at for that card, never
  in the future.
- Batch-level guard: duplicate `clientEventId` within one batch → whole-batch `validation`
  error (`MobileReviewBatchService.validateBatch`).

### 3.2 Proposed / gaps (M1-D must decide)

- **Offline event payload identity — DECIDED (ADR 0013):** for M1, bundled Start Pack IDs
  are canonical immutable `cards.content_id` values. `PendingReviewEvent.cardId` (e.g.
  `start-a1-haus`) is the same value as `cards.content_id` for the corresponding card; clients
  send `contentId`, and the server resolves it to `cards.id` (`resolveCardId`). No inference,
  mapping table or rename exists. Future aliases/taxonomy are separate ADR decisions, and the
  reconciliation cursor/watermark policy remains a separate M1-D decision.
- **Event read API:** no endpoint returns a learner's review events or due cards to a client.
  All "Today"/due selection endpoints are **proposed**, not implemented.

---

## 4. Server-authoritative state

**Verified contract (implemented):**

- `card_schedules` is the authoritative mutable projection; `review_events` is append-only
  history (`0002_card_schedules.sql` header comment).
- The server resolves canonical `contentId` → `cards.id` **only for content with an
  `approved`/`published` `card_versions` row** (`PostgresReviewEventStore.resolveCardId`);
  unknown content → per-item `validation` outcome.
- `bootstrap_approved_card_schedules(user_id)` is a server-owned, repeatable SQL function:
  idempotent insert of schedules for approved/published cards only
  (`0013_native_review_transport.sql`). Invoked once per authenticated batch
  (`MobileReviewBatchService.submit`).
- Schedules must exist before an event can be applied: `findSchedule` miss → per-item
  `validation`; store refuses to update a missing schedule (`writeAtomically` throws).

**Proposed (M1-D):** server-side snapshot/state endpoint (e.g. due cards + schedules +
pending-count reconciliation) so clients can rebuild state after reconnect; the exact shape
is not implemented.

---

## 5. Offline queue and reconnect

### 5.1 Shared queue helpers (verified)

`packages/learning-engine/src/offline-sync.ts`:

- `queueForRetry`: returns due events sorted by `nextAttemptAt`, then `clientEventId`
  (deterministic).
- `acknowledgeSyncEvents`: removes only exact acknowledged `clientEventId`s.
- `retryAfter`: bounded exponential backoff — `min(5 min, 1s * 2^min(attempts, 8))`.

`offline-sync-storage.ts` (`loadSyncQueue`/`saveSyncQueue`): versioned serialized queue;
malformed/corrupt data fails closed to an empty queue (see `docs/architecture/OFFLINE_SYNC.md`
"Device persistence" section).

### 5.2 Mobile (Flutter) — verified, dormant

- `apps/mobile/lib/features/review/review_queue.dart`: encrypted `ReviewQueue`, schema
  `{schemaVersion: 1, events: [...]}`; IDs from `Random.secure()` base64url (no padding);
  serialized mutations; corrupt queue discarded fail-closed; records
  `PendingReviewEvent{clientEventId, cardId, grade, occurredAt(UTC ISO)}`.
- `apps/mobile/lib/features/sync/review_sync_coordinator.dart`: foreground-only, provider-neutral
  coordinator; refuses signed-out calls before storage read; one in-flight attempt shared
  between concurrent callers; batch size 20 in persisted order; acknowledges only exact IDs
  after `validateAcknowledgements` (valid subset, no duplicates; otherwise
  `InvalidReviewAcknowledgement` → nothing acknowledged).
- `apps/mobile/lib/features/sync/http_review_sync_transport.dart`: HTTPS-only (HTTP only on
  loopback in development), positive timeout (default 15s), max-20 batch, strict JSON response
  parse; any non-200 or malformed body → typed `MobileReviewTransportException`; extracts only
  `status == 'acknowledged'` outcomes.
- **Production composition is deliberately closed:** `MobileAuthConfig.defaults()` sets
  `authEnabled=false`, `reviewSyncEnabled=false`; identity state is `signedOut`;
  `DisabledReviewSyncTransport` throws on use. No native HTTP path is composed. No background
  sync, connectivity listener or analytics exists.

### 5.3 Web (prototype) — verified as local-prototype only

- `apps/website/app/LearnerHome.tsx` persists a local queue under
  `learnbox:review-sync:v1:local-prototype` with `clientEventId` like
  `review-<timestamp>-<random>`; reports pending count; **does not attempt server delivery**.
- Learner auth mode resolves to `local-prototype` unless `LEARNER_AUTH_MODE=true`
  (`apps/website/app/learner-auth-mode.ts`); `server-otp` gates the browser OTP routes
  (`/api/auth/otp/*`), which are present but not production-activated.
- Device-local keys: review session resume, daily review count, calm streak, onboarding goal,
  personal vocabulary + sync queue (all `:v1:local-prototype`).

**Proposed (M1-B/M1-D):** web client must move from local-prototype queue to the
authenticated server protocol once activated; storage keys versioned; the "never delete
before acknowledgement" invariant must hold across surfaces.

---

## 6. Conflict rules

**Implemented (verified):**

1. Same learner re-sends same `clientEventId` with identical payload → idempotent replay,
   `status: 'acknowledged'`, `idempotent: true`, no schedule double-apply.
2. Same `clientEventId` with different payload → `status: 'idempotencyConflict'`; client must
   NOT overwrite or delete the event; it stays pending and requires client-side resolution.
3. Concurrent claim race → `ON CONFLICT DO NOTHING` + payload equality re-check, single
   transaction; no lost update to `card_schedules`.
4. Unknown `contentId` or missing schedule → `validation` outcome; client keeps the event
   (coordinator retains all events when acknowledgements are invalid).
5. Clock skew: `occurredAt` > now + 5 min → `clockSkew` outcome; `occurredAt` older than
   90 days → `validation`. Device time is never trusted for scheduling (server applies
   `applied_at` itself).

**Proposed (M1-D):** policy for `idempotencyConflict` events (retry with new ID after
resolving payload mismatch vs. permanent tombstone), and conflict surface between concurrent
devices editing the same personal vocabulary. Not specified today.

---

## 7. Authentication boundary assumptions

**Verified (implemented):**

- Server derives `userId` **only** from the verified access token subject (`sub`); clients
  never send a user/DB identifier (`apps/website/lib/mobile-review-http.ts`,
  `mobile-review-runtime.ts`).
- Native access token: HMAC-SHA256 signed, versioned (`v:1`), audience `learnbox-mobile`,
  15-minute lifetime, claims `{sub, sid, iat, exp, jti}` (`apps/api/src/auth/mobile-session.ts`).
- Refresh: opaque 256-bit base64url, keyed HMAC hash, 7-day idle / 30-day absolute limits,
  one-time rotation advancing `family_generation`; reuse revokes the session family
  (ADR 0011, `mobile-identity.service.ts`, `0012_mobile_learner_sessions.sql`).
- Runtime flags fail closed: `MOBILE_AUTH_ENABLED !== 'true'` or `SMS_IR_ENABLED !== 'true'`
  → no mobile auth runtime; `MOBILE_REVIEW_SYNC_ENABLED !== 'true'` → review route returns
  503 `serverUnavailable`, no cookie, no-store (`mobile-auth-runtime.ts`,
  `mobile-review-runtime.ts`, `apps/website/test/mobile-review-route.test.ts`).
- Review route: Bearer token only (`^Bearer ([A-Za-z0-9._-]{1,2048})$`), no browser
  Origin/CORS/cookie/installation-ID trust; HTTPS outside bounded loopback
  (`mobile-review-http.ts`).
- OTP boundaries: browser same-origin JSON routes (`/api/auth/otp/*`) vs native cookie-free
  routes (`/api/auth/mobile/otp/*`); native never sets a cookie and does not trust browser
  `Origin` (ADR 0011).

**Proposed / open:**

- **Browser learner authentication** for the web surface: `server-otp` mode exists but is
  gated and not production-activated; the exact learner cookie/session contract for M1-B is
  not final.
- **Observability of token/session failures** (see §9).

---

## 8. API request/response contracts

### 8.1 Existing endpoints (verified; do not invent others)

All route handlers exist; all are **dormant or gated** — none are production-enabled.

| Method & path                           | Status (implemented)                                                        | Request                                                                                         | Success response                                      | Errors (JSON `{ "error": code }`)                                            |
| --------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/otp/request`            | Implemented, gated (`LEARNER_AUTH_MODE=true` + server config)               | JSON `{ phone }`                                                                                | `201` `{ challengeId, expiresAt, resendAvailableAt }` | 400 `validation`; 429 `rateLimited` + `retry-after`; 503 `serverUnavailable` |
| `POST /api/auth/otp/verify`             | Implemented, gated                                                          | JSON `{ challengeId, code, phone }`                                                             | 200 signed HttpOnly learner cookie                    | 400 `validation`; 401 `invalidChallenge`; 503 `serverUnavailable`            |
| `POST /api/auth/mobile/otp/request`     | Implemented, dormant (`MOBILE_AUTH_ENABLED=false` + `SMS_IR_ENABLED=false`) | JSON `{ phone }`                                                                                | `201` `{ challengeId, expiresAt, resendAvailableAt }` | 400 `validation`; 429 `rateLimited` + `retry-after`; 503 `serverUnavailable` |
| `POST /api/auth/mobile/otp/verify`      | Implemented, dormant                                                        | JSON `{ challengeId, code, installationId, phone }`                                             | 200 `{ accessToken, refreshToken }`                   | 400 `validation` / `invalidChallenge`; 503 `serverUnavailable`               |
| `POST /api/auth/mobile/session/refresh` | Implemented, dormant                                                        | JSON `{ refreshToken, sessionId }`                                                              | 200 `{ accessToken, refreshToken }`                   | 400 `validation`; 401 `invalidToken`; 503 `serverUnavailable`                |
| `POST /api/auth/mobile/session/revoke`  | Implemented, dormant                                                        | empty body + `Authorization: Bearer <access>`                                                   | `204` no body                                         | 400 `validation`; 401 `invalidToken`; 503 `serverUnavailable`                |
| `POST /api/reviews/mobile`              | Implemented, dormant (`MOBILE_REVIEW_SYNC_ENABLED=false`)                   | JSON `{ items: [{ contentId, grade, occurredAt, clientEventId }] }`, max 20 items, ≤16 KiB body | 200 `{ outcomes: [...] }`                             | 400 `validation`; 401 `invalidToken`; 503 `serverUnavailable`                |

Per-item outcome shapes (`mobile-review-batch.service.ts`):

```ts
type Outcome =
  | { status: 'acknowledged'; clientEventId: string; eventId: string; idempotent: boolean }
  | { status: 'idempotencyConflict'; clientEventId: string }
  | { status: 'validation'; clientEventId: string }
  | { status: 'clockSkew'; clientEventId: string };
```

### 8.2 Proposed endpoints (NOT implemented — M1-D/M1-B/M1-C decide)

- `GET` due-card/“Today” session endpoint returning server-computed due set + schedules.
- `GET`/`POST` learner state/sync snapshot for post-reconnect reconciliation.
- Personal vocabulary add/list endpoints (web prototype queues locally today).
- Any endpoint changing or reading learner progress for progress/streak surfaces (server-backed
  analytics remain partial/planned per `docs/PRODUCT_STATUS.md`).

All proposals must reuse the authenticated token boundary and typed error codes below.

---

## 9. Error taxonomy

**Implemented (verified) error codes across the review/auth HTTP boundaries:**

| Code                | HTTP status | Meaning                                                                                                                                   |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `validation`        | 400         | Malformed body, schema violation, unknown contentId, missing schedule, duplicate clientEventId in batch, occurredAt outside 90-day window |
| `invalidToken`      | 401         | Missing/malformed/expired/invalid Bearer token; refresh rejected or family revoked                                                        |
| `invalidChallenge`  | 400         | OTP verification failed (generic; unknown/incorrect/locked/expired/used collapse to one rejection)                                        |
| `rateLimited`       | 429         | OTP request rate limit; includes `retry-after` header                                                                                     |
| `serverUnavailable` | 503         | Runtime not configured/disabled (fail-closed), DB or provider fault, interrupted batch; `cache-control: no-store`                         |

Per-item service-level outcomes (not HTTP errors): `acknowledged`, `idempotencyConflict`,
`validation`, `clockSkew` (see §8).

**Proposed (M1-D):** client-facing retry classification (retryable vs non-retryable) and
localized user messages; observability linkage (see §10). Mobile transport currently maps all
non-200 to `serverUnavailable` (`http_review_sync_transport.dart`) — a deliberate conservative
simplification.

---

## 10. Observability intent

**Implemented (verified intent only):** `docs/architecture/OBSERVABILITY.md` — structured
logs omit secrets and sensitive content; track request errors, OTP abuse, queue latency, sync
conflicts, media failures, migrations, client crashes; define production alert thresholds
before launch. No production observability stack is deployed (product is not activated).

**Proposed (M1-D/M6 hardening):** concrete event/metric names for sync outcomes
(`acknowledged`, `idempotencyConflict`, `clockSkew`, `validation`), queue depth/retry
distribution, auth failure classes (never raw phone/OTP/token values), and alert thresholds
per `docs/architecture/SCALING.md`/OBSERVABILITY. Nothing is implemented beyond the intent doc.

---

## 11. Migration safety

**Verified (implemented):**

- Sequential numbered SQL migrations `0001`–`0013` under `database/migrations/`; runner
  (`apps/api/src/database/migration-runner.ts`) applies with advisory lock, records
  `version` + `checksum` in `schema_migrations`, verifies TLS (`verify-full`) via
  `requireVerifiedDatabaseTls`.
- `scripts/validate-migrations.mjs` enforces contiguous numbering (CI gate).
- `0013_native_review_transport.sql` is a backward-compatible additive change: widens
  `client_event_id` UUID→TEXT preserving values, moves uniqueness to `(user_id,
client_event_id)`, adds nullable-then-filled `cards.content_id` with deterministic
  `'legacy-' || id` backfill before `NOT NULL`, immutable-content_id trigger, and idempotent
  `bootstrap_approved_card_schedules` function.
- Existing migration tests: `apps/api/test/native-review-migration.test.ts`,
  `mobile-session-migration.test.ts`, `invite-migration.test.ts`, `owner-passkey-migration.test.ts`.

**Proposed / rules for future migrations (M1-D):**

- Additive only until release; no destructive column drops without owner-approved
  backfill/rollback plan.
- Any new unique constraint that touches sync keys must be learner-scoped.
- Migration must be safe to run on a populated DB with existing UUID event IDs (0013 already
  demonstrates the pattern).
- A future M1-D migration must be serial (queue rule: "Serial for migrations/auth").

---

## 12. Acceptance criteria — M1-D / Web / Mobile

Status legend: **[E]** = verifiable against implemented evidence now; **[P]** = proposed
contract for the future task.

### M1-D — Sync and persistence (API, migrations, sync tests)

1. **[E]** `clientEventId` uniqueness is learner-scoped (`(user_id, client_event_id)`) and
   replay returns the stored event with `idempotent: true`; payload mismatch returns
   `idempotencyConflict` and never mutates the schedule. (Already covered by
   `postgres-review-event.store.test.ts`, `mobile-review-batch.service.test.ts`.)
2. **[E]** The review route fails closed: `MOBILE_REVIEW_SYNC_ENABLED !== 'true'` → 503
   `serverUnavailable`, no cookie, no-store.
3. **[P]** A learner can fetch server-authoritative due cards and schedule state after
   reconnect; the response matches what the server would schedule, and local pending events
   are not dropped or duplicated in the process.
4. **[P]** All pending events survive app restart and are removed only after an exact
   acknowledgement of their `clientEventId`; a corrupt local queue fails closed and never
   reaches the server.
5. **[P]** New migrations are additive, contiguous, learner-scoped where they touch sync
   keys, and covered by a migration test; `scripts/validate-migrations.mjs` stays green.
6. **[P]** Every new endpoint returns typed errors from the taxonomy in §9 with
   `cache-control: no-store`; no raw phone/OTP/token/secret in logs or responses.

### M1-B — Web learning core (learner Web components/routes/tests)

1. **[P]** The web client moves from `learnbox:review-sync:v1:local-prototype` to the
   authenticated protocol (same idempotency semantics) with versioned storage migration;
   local prototype keys are not silently reused as server-backed state.
2. **[P]** Every screen the web surface ships (Today, Review, Words, Progress, Profile,
   Settings) has loading, empty, error, offline and sync states per D1 boards; RTL-first with
   LTR isolation for German/code/URLs.
3. **[P]** Server-OTP learner sign-in path is activated only behind its explicit flag and
   config, with generic errors and no sensitive data in responses.
4. **[P]** Reconnect shows truthful pending/sync state and does not claim server persistence
   before an acknowledgement.
5. **[E]** Existing `learner-auth-gate`/`mobile-review-http` boundary tests remain green after
   web changes.

### M1-C — Mobile learning core (Flutter learner screens/tests/assets)

1. **[P]** The dormant `ReviewSyncCoordinator` path can be activated only with an authenticated
   transport and only behind explicit owner-approved flags; default composition stays
   `signedOut` + `DisabledReviewSyncTransport` until then.
2. **[P]** `HttpReviewSyncTransport` strictness is preserved (HTTPS/loopback-only, max-20,
   exact acknowledgement subset, typed failures); any new state surface reports
   `ReviewQueue.pendingCount()` truthfully.
3. **[P]** No background sync, connectivity listener, analytics or new dependency is added
   without a separate queue task.
4. **[E]** Flutter tests (`flutter test`), `flutter analyze`, `dart format` remain green.

### M1-Q — Independent QA

1. **[P]** QA evidence must show the complete journey on Web and Android with **no lost or
   duplicate review events** (ROADMAP M1 exit criterion), including forced offline/reconnect
   and clock-skew cases.
2. **[P]** QA must not approve its own implementation; it records evidence only.

---

## 13. Explicit out of scope (this audit)

- No production/payment/OTP/Preview/server activation; no secrets; no deployments.
- No admin/content-factory contracts beyond the review-gate boundary referenced in §1.
- No commerce/entitlement contract changes.
- No changes to product code, design docs, queue files, or deployment config.
- Personal vocabulary and progress/streak server contracts are referenced only as proposed
  endpoints; they need their own design decisions.

## 14. Evidence index (implemented only)

| Claim                                         | Evidence                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Learner-scoped idempotency + payload equality | `database/migrations/0013_native_review_transport.sql`; `apps/api/src/reviews/postgres-review-event.store.ts`                                                                                                                                                                                                                      |
| Batch service outcomes & limits               | `apps/api/src/reviews/mobile-review-batch.service.ts` (max 20, 90-day past window, 5-min skew)                                                                                                                                                                                                                                     |
| Shared queue/backoff/ack                      | `packages/learning-engine/src/offline-sync.ts`; `offline-sync-storage.ts`                                                                                                                                                                                                                                                          |
| Scheduling seam                               | `packages/learning-engine/src/index.ts`                                                                                                                                                                                                                                                                                            |
| Review route + runtime fail-closed            | `apps/website/app/api/reviews/mobile/route.ts`; `apps/website/lib/mobile-review-http.ts`; `mobile-review-runtime.ts`                                                                                                                                                                                                               |
| Mobile dormant sync/queue                     | `apps/mobile/lib/features/sync/*`, `apps/mobile/lib/features/review/review_queue.dart`                                                                                                                                                                                                                                             |
| Web local-prototype queue                     | `apps/website/app/LearnerHome.tsx`                                                                                                                                                                                                                                                                                                 |
| Native session/token contract                 | `apps/api/src/auth/mobile-session.ts`; `mobile-identity.service.ts`; `0012_mobile_learner_sessions.sql`; ADR 0011                                                                                                                                                                                                                  |
| Migration runner + numbering gate             | `apps/api/src/database/migration-runner.ts`; `scripts/validate-migrations.mjs`                                                                                                                                                                                                                                                     |
| Tests                                         | `apps/api/test/{postgres-review-event.store,mobile-review-batch.service,native-review-migration,mobile-session-migration}.test.ts`; `apps/website/test/{mobile-review-http,mobile-review-route,mobile-auth-http,mobile-auth-routes}.test.ts`; `apps/mobile/test/review_sync_contract_test.dart`; `packages/learning-engine/test/*` |
