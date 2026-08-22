# Native Identity + Authenticated Transport Design

**Status:** Draft — design and contract boundary only, no implementation
**Storyboard:** 24 of 30 — Beta and load testing
**Scope:** Native learner identity and authenticated review transport; server contract; default-disabled
**Recording:** ADR [0011](../../architecture/ADR/0011-native-mobile-session-and-transport.md)

## Goal

Define the security-first, default-disabled native learner identity and authenticated review
transport boundary. It authenticates a physical Android/iOS learner and uploads the offline review
queue, without enabling any network path, UI activation, background work, real cohort, or
production service in the first implementation.

This design is deliberately separate from the existing browser OTP-cookie flow. Native identity
uses its own OTP endpoints and its own session/token contract.

## Security posture

- Native OTP request/verify endpoints are distinct from the browser cookie flow and reuse no
  browser Cookie/SameSite machinery. Native requests normally have no trustworthy browser `Origin`;
  the routes therefore do **not** require or trust `Origin`, CORS, a custom client header, or an
  installation ID as authentication. They require HTTPS outside loopback development, exact
  JSON schemas and body limits, and the existing server-side phone/IP abuse controls before provider
  delivery. Browser cookie routes retain their separate same-origin CSRF check.
- OTP request accepts a phone number only as challenge input. OTP verify resubmits the phone and code;
  the server normalizes the phone to E.164, hashes it with the OTP challenge secret, constant-time
  compares it to the consumed challenge's `phone_hash`, and only then resolves the learner. The phone
  is never accepted as an authorization claim, and the client never sends a user ID.
- Learner lookup/upsert and one-time challenge consumption must occur in one database transaction;
  the current store consumes before identity mapping, so implementation must introduce this atomic
  boundary rather than composing the existing calls non-atomically.
- Default-disabled: `MOBILE_AUTH_ENABLED` and `MOBILE_REVIEW_SYNC_ENABLED` both default to `false`.
  All mobile code fails closed while either flag is off or any required secret is absent.
- No SMS/OTP provider secret ever reaches the mobile client, logs, or repository.

## Selected approach

Extend the existing provider-neutral final coordinator boundary (`OFFLINE_SYNC.md`, the mobile sync
coordinator) with a real authenticated transport for the first implementation, keeping identity,
queue, and transport as separate seams. Production composition enables nothing until flags are
owner-on.

## Architecture

### Native OTP endpoints (distinct from browser cookies)

- `POST /api/auth/mobile/otp/request` and `POST /api/auth/mobile/otp/verify` (JSON-only).
- Do not apply the browser route's mandatory same-origin `Origin` check to native requests. Enforce
  HTTPS outside an explicitly bounded loopback development mode, exact `Content-Type`, strict body
  size/schema validation, generic errors, server-side phone/IP rate limits and fail-closed runtime
  configuration. `Origin`, CORS, app-version headers and installation IDs are telemetry/routing hints
  at most, never authentication or abuse-proof identity.
- Normalize Persian/Arabic digits server-side and reuse the existing fail-closed OTPChallenge and
  SMS.ir delivery seams (ADR 0006). A successful delivery is not identity; verification remains
  inside LearnBox.
- These endpoints never set a browser cookie. Verify returns a native token response only after the
  submitted phone hashes to the challenge's phone hash and the atomic identity/session transaction
  succeeds.

### Server-derived identity and challenge-bound phone

- Verify input contains `challengeId`, `code`, the phone entered for that challenge, and the opaque
  app-generated installation ID. The server normalizes and hashes the phone, constant-time compares
  it to the locked challenge row, verifies the code, upserts `users.phone_e164`, consumes the
  challenge, and creates the mobile session in one transaction.
- The response and later review requests contain no client-selected user ID. The access token's
  server-issued subject is the only learner source for authenticated handlers.
- Retrying a successfully consumed challenge returns the same generic verification failure and never
  creates a second learner or session.

### Session contract

- Access token: signed, versioned, audience-scoped token with only `sub` (learner UUID), `sid`
  (mobile session UUID), `iat`, `exp` and a random token ID; 15-minute default lifetime. Every
  authenticated handler verifies signature/version/audience/expiry and loads the session row so
  revocation is effective immediately. The mobile client may use `exp` only to decide when to
  refresh; it never treats local token parsing as authorization.
- Refresh token: opaque 256-bit random value, 30-day absolute lifetime and 7-day idle window by
  default. Store only a keyed hash server-side. A successful refresh atomically compares the current
  hash, rotates to a new token/hash, advances a generation and returns a new pair. Concurrent use or
  reuse of an old generation revokes the session family and returns one generic authentication
  failure.
- The session row is scoped to learner plus app-generated installation ID and records creation,
  last-used, absolute/idle expiry, rotation generation and revocation metadata. Installation ID is a
  session-management handle, never an authenticator.
- Logout deletes local tokens first and best-effort revokes the server session; account/device session
  management can revoke server rows without possessing the device.

### Secure storage

- Access and refresh tokens live in the platform secure store (iOS Keychain / Android Keystore or
  equivalent encrypted device store), never in plain files, logs, analytics, or shared preferences.
- Installation identity lives in durable secure storage and is app-generated.

### Installation ID — app-generated, not hardware

- The app generates a random installation ID on first launch (cryptographically strong), persists it
  in secure storage, and sends it only as an opaque device handle. It is not a hardware ID, IMEI,
  Android ID, MAC, or any vendor identifier, and it carries no learner account claim.

### Revocation and reuse detection

- Server records of sessions allow owner/account revocation.
- Token reuse on an already-rotated refresh token, or a reused OTP challenge, collapses to a generic
  rejection and logs an audit event (server-side). Client never sees which check failed.

### Review transport

- Authenticated max-20 review batch in persisted order, matching the existing coordinator's
  maximum-20 foreground attempt. The JSON body has an exact schema/version and contains only
  canonical content ID, grade, device occurrence time and `clientEventId`; `userId` and DB card IDs
  are forbidden fields.
- The current mobile queue emits a 128-bit secure base64url ID (22 characters), while the database
  column is `UUID`; server transport must not be enabled until a migration changes
  `review_events.client_event_id` losslessly to constrained text and replaces the global unique key
  with `(user_id, client_event_id)`. Existing UUID values convert to text. No queued mobile event is
  rewritten or discarded.
- Exact client-event acknowledgements: a `200` response contains each durably committed or matching
  idempotent event ID exactly once. Validation rejects the whole batch before writes. If processing
  fails after any commit, return no acknowledgement; a retry safely resolves committed events by the
  learner-scoped idempotency contract. Unknown, duplicate or partial response IDs remain a client-side
  retryable failure and never delete unacknowledged queue entries.
- A duplicate `(learner, clientEventId)` is acknowledged only when canonical card, grade and device
  occurrence time exactly match the stored payload; a mismatch is an idempotency conflict and is
  never acknowledged.

### Canonical content-ID to DB-card mapping

- The current `cards` table has only a UUID primary key and lemma. Before upload activation, a
  migration adds immutable unique `content_id` text, seeds/maps only approved canonical content, and
  provides initial `card_schedules` for a newly resolved learner through an idempotent server-owned
  bootstrap. The route rejects unknown/unpublished content IDs before any review write.
- The client references cards by canonical content ID; the server resolves that value to the DB card
  UUID inside the authenticated transaction. The client never guesses, receives or persists DB
  primary keys.

### Idempotency scoped to learner/payload

- Idempotency is scoped to `(server-derived learner UUID, client_event_id)` and payload equality. The
  existing global `client_event_id` lookup is insufficient and must not back the native endpoint.
- The PostgreSQL adapter claims the learner-scoped key before updating the projection in one
  transaction. A collision owned by another learner is unrelated; a same-learner ID with different
  payload returns a conflict without mutating schedule state.

### Clock skew and offline behavior

- Server time is authoritative for token/OTP expiry and scheduling application. Device
  `occurredAt` is preserved as untrusted event metadata, never used for token/session decisions.
- Process validated events in persisted queue order. Add a server `applied_at`; derive it
  monotonically as no earlier than the learner/card projection's prior application time and no later
  than server receive time. This prevents a future or backward device clock from moving the schedule
  backward/forward while retaining the learner's original timestamp for audit.
- Do not expire otherwise valid old queued reviews merely because the device was offline. Reject only
  malformed/non-UTC timestamps or values outside a documented representable bound; preserve the
  queue and surface a non-acknowledged validation conflict for manual recovery.
- Offline review continues on-device. No retry fires outside a user-initiated foreground attempt;
  concurrent token refresh and sync calls share one in-flight refresh, use bounded backoff and never
  run from a timer, connectivity listener or background worker in this slice.

### Errors and timeouts

- Strict typed errors: `authenticationRequired`, `invalidChallenge`, `invalidToken`,
  `rateLimited`, `idempotencyConflict`, `serverUnavailable`, `clockSkew`, `validation`.
- Client transport uses bounded, strict timeouts and fails closed; a timeout is retryable and never
  drops events.

## Out of scope for first implementation

- No background sync and no UI activation (no connectivity listener, timer, worker, or in-app action
  that triggers transport on its own).
- No provider onboarding, no Preview/Production enablement, no real cohort.

## Flags

- `MOBILE_AUTH_ENABLED` — default `false`. Enables native OTP/session endpoints and secure-store
  identity. Disabling it leaves all native auth traffic fail-closed.
- `MOBILE_REVIEW_SYNC_ENABLED` — default `false`. Enables authenticated review upload. Requires the
  auth flag to be true; otherwise transport stays `DisabledReviewSyncTransport`.

## Rollback

- Rollback disconnects mobile identity and transport composition while preserving the encrypted
  `ReviewQueue` and all pending events. No source change restores the queue, and no event is ever
  deleted by a transport change.

## Implementation plan — bounded serial tasks

These tasks are dependency-ordered and must run **serially** even where file paths do not overlap;
identity and schema evidence from an earlier task is a prerequisite for the next. Each begins with a
failing direct test and stops at a Draft PR. No task enables either flag, provider delivery,
Production, background work or UI.

1. **NI-001 — pure server identity/session contract.** Allowed paths:
   `apps/api/src/auth/mobile-session.ts`, `apps/api/src/auth/mobile-identity.service.ts`,
   `apps/api/test/mobile-session.test.ts`, `apps/api/test/mobile-identity.service.test.ts`.
   Use fake stores only to lock token claims/lifetimes, phone-hash binding, atomic-store interface,
   generic failure, rotation/reuse and server-derived subject. No HTTP, PostgreSQL or flag.
   Checks: API build/typecheck and the two direct tests.
2. **NI-002 — atomic PostgreSQL identity/session persistence.** Allowed paths:
   `database/migrations/0012_mobile_learner_sessions.sql`,
   `apps/api/src/auth/postgres-mobile-identity.store.ts`,
   `apps/api/src/auth/postgres-otp-challenge.store.ts`,
   `apps/api/test/mobile-session-migration.test.ts`,
   `apps/api/test/postgres-mobile-identity.store.test.ts`. Lock the challenge row; compare normalized
   phone hash, verify/consume, upsert learner and create/rotate/revoke the hashed session in one
   transaction. Checks: direct tests plus migration validation and API typecheck.
3. **NI-003 — default-disabled native auth HTTP boundary.** Allowed paths:
   `apps/website/lib/mobile-auth-http.ts`, `apps/website/lib/mobile-auth-runtime.ts`,
   `apps/website/app/api/auth/mobile/otp/request/route.ts`,
   `apps/website/app/api/auth/mobile/otp/verify/route.ts`,
   `apps/website/app/api/auth/mobile/session/refresh/route.ts`,
   `apps/website/app/api/auth/mobile/session/revoke/route.ts`,
   `apps/website/test/mobile-auth-http.test.ts`, `apps/website/test/mobile-auth-routes.test.ts`.
   `MOBILE_AUTH_ENABLED` remains false; native routes use the non-browser trust model above and never
   set a cookie. Checks: focused website tests, typecheck, security validator.
4. **NI-004 — review schema and learner-scoped server core.** Allowed paths:
   `database/migrations/0013_native_review_transport.sql`,
   `apps/api/src/reviews/postgres-review-event.store.ts`,
   `apps/api/src/reviews/mobile-review-batch.service.ts`,
   `apps/api/test/native-review-migration.test.ts`,
   `apps/api/test/postgres-review-event.store.test.ts`,
   `apps/api/test/mobile-review-batch.service.test.ts`. Add canonical `content_id`, schedule bootstrap,
   text client IDs, `(user_id, client_event_id)`, payload equality and server `applied_at`; no route.
   Checks: direct/API tests, typecheck and migration validation.
5. **NI-005 — default-disabled authenticated review route.** Allowed paths:
   `apps/website/lib/mobile-review-http.ts`, `apps/website/lib/mobile-review-runtime.ts`,
   `apps/website/app/api/reviews/mobile/route.ts`,
   `apps/website/test/mobile-review-http.test.ts`, `apps/website/test/mobile-review-route.test.ts`.
   Derive learner only from access token/session; exact max-20 request/ack contract;
   `MOBILE_REVIEW_SYNC_ENABLED` remains false. Checks: focused website tests, typecheck and security
   validator.
6. **NI-006 — dormant Flutter credential/transport adapters.** Allowed paths:
   `apps/mobile/lib/features/identity/mobile_session.dart`,
   `apps/mobile/lib/features/identity/mobile_session_store.dart`,
   `apps/mobile/lib/features/identity/secure_mobile_session_store.dart`,
   `apps/mobile/lib/features/sync/http_review_sync_transport.dart`,
   `apps/mobile/test/mobile_session_test.dart`,
   `apps/mobile/test/secure_mobile_session_store_test.dart`,
   `apps/mobile/test/http_review_sync_transport_test.dart`. Reuse `flutter_secure_storage`; add no
   dependency, endpoint, native host permission, composition, trigger or UI. Checks: format, analyze,
   focused and full Flutter tests.
7. **NI-007 — separately reviewed dormant composition.** Allowed paths:
   `apps/mobile/lib/main.dart`, `apps/mobile/lib/features/identity/mobile_auth_config.dart`,
   `apps/mobile/test/mobile_auth_composition_test.dart`, `apps/mobile/README.md`,
   `docs/architecture/OFFLINE_SYNC.md`. Both compile/runtime defaults remain false and production
   still composes signed-out/disabled behavior. Android/iOS network permission, Preview verification
   and any user-visible activation remain later owner-gated work. Checks: all Flutter checks/builds,
   full repository checks and independent high-reasoning security review.

Every task also runs `git diff --check`; feature-boundary tasks run `pnpm check`, `pnpm build` and
`node scripts/validate-migrations.mjs` before merge.
