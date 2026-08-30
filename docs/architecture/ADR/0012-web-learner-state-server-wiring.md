# ADR 0012 — Web learner-state server wiring

- **Status:** accepted design contract; route implemented and merged in PR #163 at `73cdb62` (2026-08-30) behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime; Start Pack seed/release remains a separate owner/review-gated decision
- **Date:** 2026-08-30
- **Basis:** `origin/main` at `0edd338` (M1-B Web slice 1, PR #156; M1-D slice 1, PR #152; M1-A contract, PR #151)

## Context

The Web learner surface (`apps/website`) is deliberately not server-wired. `LearnerHome.tsx`
persists a device-local queue under `learnbox:review-sync:v1:local-prototype`, and the Today
surface labels counts as local-only (`apps/website/README-M1B-WEB-SLICE1.md`, PR #156). The
server-side snapshot read `GET /api/learner/state` exists in `apps/api` behind the
fail-closed `LEARNER_STATE_ENABLED` runtime (M1-D slice 1, PR #152), but it is served only by
the API module's own HTTP controller and demands a `Bearer` token from the **native mobile**
session contract (`LEARNBOX_MOBILE_SESSION_SECRET`, audience `learnbox-mobile`). The Web
surface authenticates with the **browser** HttpOnly learner cookie
(`learnbox_alpha_session`, HMAC-signed by `LEARNBOX_SESSION_SECRET`, `lib/server-session.ts`,
issued by the gated `server-otp` flow). No Web route and no Web credential can satisfy the
snapshot route today. No Next.js route in `apps/website/app/api/**` exposes the snapshot.

User approved: wire Web server state via **Web HttpOnly learner cookie → Next.js server
route → server-side identity mapping → existing `LearnerStateService`/repository**. Start
Pack seed/release remains a separate owner/review-gated decision.

## Decision

- **Exact proposed Web route:** `GET /api/learner/state` in `apps/website/app/api/learner/state/route.ts`
  (Next.js, `runtime = 'nodejs'`). It mirrors the API-module controller's behavior but with the
  Web trust boundary:
  - The route resolves identity **only** from the browser learner cookie via
    `readLearnerSession(request)` (`lib/server-session.ts`); it never accepts a client-supplied
    user/DB identifier, an `Authorization` header, or a native mobile access token.
  - On cookie miss/invalid/expired signature or scope → `401` `{ error: 'invalidToken' }`,
    `cache-control: no-store`, no cookie mutation.
  - Non-GET or insecure transport (HTTP outside bounded loopback `localhost`/`127.0.0.1`/`::1`
    in development) → `400` `{ error: 'validation' }`, `no-store`.
  - The route reuses the existing `LearnerStateService` + `PostgresLearnerStateRepository`
    (`apps/api/src/learner-state/`) unchanged. No new service, repository, pool or schema.
  - Module mounting: the route imports the existing API package (same pattern as
    `apps/website/lib/mobile-review-runtime.ts`, which imports `../../api/dist/...`). The
    API module is not mounted inside `apps/website`; the route depends on the API package's
    built `dist` artifacts and its own `DATABASE_URL` pool.
  - **Fail-closed flag:** a new `WEB_LEARNER_STATE_ENABLED=true` environment variable plus
    complete `DATABASE_URL` and `LEARNBOX_SESSION_SECRET` (≥ 32 chars) configuration is
    required. Any deviation → route returns `503` `{ error: 'serverUnavailable' }`, no-store,
    no cookies — exactly the `MOBILE_REVIEW_SYNC_ENABLED` / `LEARNER_STATE_ENABLED` pattern.
    Default environment stays disabled; nothing activates.
- **Cookie-derived identity boundary:** the session cookie's `subject` is an **opaque phone
  hash** (`createLearnerSession(outcome.phoneHash)` in `lib/otp-http.ts`), **not** `users.id`.
  The snapshot read is keyed by `user_id` on `card_schedules`/`review_events`. Therefore the
  route must map cookie `subject` → `users.id` server-side before calling
  `readLearnerState(userId)`. This mapping is an explicit, unresolved blocker (below); the
  route must fail closed (`invalidToken`/`serverUnavailable`) until it exists. The mapping is
  never exposed to the client and never accepts a client-supplied user ID.
- **Response shape:** the route returns the snapshot exactly as
  `handleLearnerStateGet`/`LearnerStateService` serialize it — `{ schedules, plan,
reviewEventsCount }`, `200`, `cache-control: no-store`,
  `content-type: application/json; charset=utf-8`. The Web client performs **no server-side
  caching** of learner state; every read is fresh, and the Today surface treats a snapshot as
  server-backed only after the fetch succeeds and the response parses (`lib/learner-state-web-client.ts`).
- **Typed errors:** only the taxonomy from `M1_ONLINE_LEARNING_CONTRACT.md` §9:
  `validation` (400), `invalidToken` (401), `serverUnavailable` (503). No raw phone, OTP,
  token, hash or secret ever appears in responses or logs.
- **Schedule `cardId`/`contentId` join rule:** `schedules[].cardId` is the DB `cards.id`
  (UUID); `schedules[].contentId` is the canonical `cards.content_id` (`TEXT`, immutable,
  `'legacy-' || id` backfill, migration 0013). The repository already joins
  `card_schedules ⋈ cards` on `cards.id`. The Web client must treat `contentId` as the
  stable key for local-queue/Start-pack correlation and `cardId` only as the schedule row
  identity returned by the server. The bundled-Start mapping is resolved for M1 in
  [ADR 0013](ADR/0013-start-pack-contentid-contract.md): `start-a1-*` IDs **are** canonical
  `cards.content_id` values, so no inference is needed for bundled content; the equality
  rule replaces the earlier "unsolved catalog contract" blocker. Catalog-added content with
  any other ID scheme remains a future decision.
- **`reviewEventsCount` semantics:** exact server count of `review_events` rows for the
  learner (`COUNT(*)` in `postgres-learner-state.repository.ts`). It is **not** a
  pending/acknowledged delta and not a "synced" proof. The client reconciles its local
  pending queue against it; a count of zero does not mean the local queue is empty, and a
  non-zero count does not mean the local queue is acknowledged. The server-side push
  acknowledgement watermark policy is decided in
  [ADR 0014](ADR/0014-push-reconciliation-cursor-policy.md) (per-learner monotonic version
  incremented only on newly applied events); until it is implemented, no UI may claim server
  persistence of local events. The Start Pack ↔ canonical `contentId` mapping is resolved for M1 in
  [ADR 0013](ADR/0013-start-pack-contentid-contract.md): bundled IDs **are** canonical
  `cards.content_id` values; clients send `contentId`, the server resolves `cards.id`.
- **Loading / offline / error truth states (D1 §5, M1-B §12.2):** when the route is wired,
  the Today surface must render the D1 state board truthfully:
  - Loading: skeleton figures, no "0" flash, no partial numbers.
  - Empty: no due cards → Bobo recovery still + «کارتی برای مرور نیست» + CTA to Words.
  - Error: typed-code inline banner with retry; keep last good content when present.
  - Offline: hairline banner; figures show last-synced snapshot labelled
    «آخرین همگام‌سازی»; CTA still starts a local review session from the device-local
    queue.
  - Sync: pending chip «N رویداد در انتظار همگام‌سازی» only when locally true.
  - No state may claim server-backed figures or acknowledgement until the read
    succeeds and the response is parsed; any fetch failure falls back to the truthful
    local-only label. A route that does not exist yet must not render these states as if
    wired.

## Explicit blockers (this document records them; it does not resolve them)

1. **Route not yet implemented (resolved).** `apps/website/app/api/learner/state/route.ts` is
   implemented behind the fail-closed `WEB_LEARNER_STATE_ENABLED` runtime and merged in PR #163
   at `73cdb62`.
2. **Web session → `users.id` mapping (resolved).** PR #162 ("bind OTP sessions to canonical
   users") resolved this: the Web OTP verification resolves `users.id` server-side and issues
   the signed cookie with the canonical UUID subject, so the read route maps the cookie
   `subject` directly to `users.id` with no lookup and no client-supplied identifier.
3. **Start Pack seed/release.** New-card intake (`newCards`, `suggestedNewCards`,
   `bootstrap_approved_card_schedules` for Start-pack content) requires the catalog and
   pack-membership contract plus approved content. This is a **separate owner/review-gated
   decision** and is out of scope here. Until then the plan always returns `newCardIds: []`
   and `suggestedNewCards: 0` (M1-D slice 1 `ponytail` comment), and the Web surface keeps
   its bundled device-local Start pack with local-only labels.
4. **API module mounting / DB access (resolved).** The Next.js route imports the existing
   API package's built `dist` artifacts (`apps/website/lib/learner-state-web-runtime.ts`,
   same pattern as `lib/mobile-review-runtime.ts`) and a shared verified-TLS
   `DATABASE_URL` pool (`requireVerifiedDatabaseTls`). DB access stays server-side only;
   nothing reaches the client.

## Security constraints

- Identity is derived **only** from the signed HttpOnly cookie (`HttpOnly`, `SameSite=Lax`,
  `Secure` in production, 8h lifetime, HMAC-SHA256, constant-time comparison,
  `timingSafeEqual`, `lib/server-session.ts`). No client-supplied user ID, no Bearer token,
  no `Origin`/CORS trust on the read route (same-origin Next.js route).
- Fail-closed flag `WEB_LEARNER_STATE_ENABLED !== 'true'` (or incomplete
  `DATABASE_URL`/`LEARNBOX_SESSION_SECRET`) → 503 `serverUnavailable`, no-store, no cookies.
- HTTPS outside bounded loopback; no-store on every response; typed errors only; no raw
  phone/OTP/token/secret in logs or bodies; no cookie mutation on read.
- The mobile session contract (`learnbox-mobile` audience, `LEARNBOX_MOBILE_SESSION_SECRET`)
  stays exclusively native; the Web route never accepts or issues mobile tokens.
- No production, payment, OTP delivery, Preview or server activation is authorized by this
  decision.

## Migration constraints

- **No migration is added by this decision.** The read needs no new schema
  (`card_schedules` + `cards.content_id` + `review_events` already carry everything; M1-D
  slice 1 shipped zero migrations for the same reason).
- Any future migration touching sync keys must be additive, contiguous
  (`scripts/validate-migrations.mjs`), learner-scoped where it touches sync keys, and
  covered by a migration test (M1-D §12.5). The unresolved push-reconciliation watermark is
  a serial, owner-reviewed M1-D decision, not part of Web wiring.
- If the Web session → `users.id` mapping needs a table or column, it must be a separate
  serial, additive, migration-tested decision (blocker 2).

## Consequences

- Web Today moves from `local-only` to server-backed figures only when the read succeeds and
  is parsed; the truthful local labels, loading/error/offline fallbacks and pending chip (PR
  #156, this slice) remain otherwise. Start Pack seed/release (blocker 3) and API-module
  pool wiring (blocker 4) remain open; the route is merged (PR #163).
- The Web read reuses the verified M1-D service/repository seam, so plan and schedules
  match what the server would schedule next (`createDailySessionPlan`), and
  `reviewEventsCount` is exact server truth.
- The cookie boundary (phone-hash subject) and the DB key (`users.id`) are different
  namespaces; the identity mapping is the critical security seam and must be reviewed as
  such.

## Out of scope

- Route code, migrations, seed data, auth activation, secrets, deployments and product UI
  changes — none are added by this ADR.
- Start Pack seed/release and new-card catalog intake (owner/review-gated).
- Push-reconciliation acknowledgement watermark (serial M1-D decision).
- Personal vocabulary and progress/streak server contracts (own decisions, M1-A §13).
- Native mobile auth/session changes (ADR 0011 boundary).
- Analytics implementation (OBSERVABILITY intent only, M1-A §10).

## Reversal trigger

Re-open this decision if the Web session contract diverges from the cookie boundary (e.g. a
switch to the native token contract on Web), if the identity mapping cannot be made
fail-closed and constant-time, or if the API module mounting changes the pool/secret
boundary. Reversal must never lose queued review events or claim server persistence
without an acknowledgement.
