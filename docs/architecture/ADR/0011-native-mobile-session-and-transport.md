# ADR 0011 — Native mobile session and authenticated transport

- **Status:** proposed; design review required before implementation
- **Date:** 2026-08-22

## Context

A native Flutter learner app owns an encrypted offline review queue and a foreground, max-20 sync
coordinator (`docs/architecture/OFFLINE_SYNC.md`). To upload reviews it needs authenticated learner
identity and a typed transport, but today only `signedOut` identity and a disabled transport are
composed. The web flow uses browser cookies and is not suitable for a native token session.

## Decision

- Add native OTP request/verify endpoints (`/api/auth/mobile/otp/request`, `/verify`) distinct from
  the browser cookie flow; they never set a cookie and do not require or trust browser `Origin` as a
  native-auth control. HTTPS, strict JSON/body limits, generic errors and server phone/IP abuse
  controls are mandatory; browser OTP retains its separate same-origin check.
- Verify resubmits phone, code, challenge and an app-generated installation ID. In one transaction the
  server normalizes/hashes and constant-time binds the phone to the locked challenge, verifies and
  consumes it, upserts `users.phone_e164`, and creates the mobile session. The client never sends a
  user ID; authenticated handlers derive it only from the access-token subject and live session.
- Access uses a signed, versioned, audience-scoped 15-minute token and checks the live session row.
  Refresh uses an opaque 256-bit token with keyed server hash, 7-day idle and 30-day absolute limits;
  one-time atomic rotation advances a generation, and reuse revokes the session family with a generic
  failure.
- Tokens and the app-generated installation ID (never a hardware ID) live only in secure storage.
  Installation ID supports session management but is never an authenticator. No provider secret
  reaches the mobile client.
- Authenticated review transport accepts a strict maximum-20 batch with no client user/DB IDs. Before
  activation, migrate base64url mobile event IDs from the current incompatible UUID column to text,
  scope uniqueness to `(user_id, client_event_id)`, require payload equality on replay, add immutable
  canonical content-ID mapping/schedule bootstrap and use a server-authoritative monotonic
  `applied_at` while preserving untrusted device occurrence time.
- Acknowledgements contain exact durably committed or payload-matching IDs only; any unacknowledged
  event remains encrypted locally. Transport/auth errors, timeouts and rollback never drop the queue.
- `MOBILE_AUTH_ENABLED` and `MOBILE_REVIEW_SYNC_ENABLED` both default to `false`. No background sync,
  UI trigger, native network permission, Preview/Production activation or real cohort is authorized
  by this decision.

## Consequences

Native identity stays aligned with MASTER_SPEC §5.1 and the existing fail-closed OTP core, but it
requires explicit schema and trust-boundary work before any route can be enabled. The current global
UUID review-event key and browser-only `Origin` assumptions are recorded incompatibilities, not
implementation shortcuts. Work proceeds through the serial NI-001–NI-007 slices in the linked design;
NI-001 is a pure server contract with fake stores and no route, database or network path.

## Reversal trigger

Re-open this decision if the native OTP/session contract diverges from the browser identity mapping,
if refresh-token rotation or reuse detection cannot be made fail-closed, or if the secure token store
cannot be satisfied on a supported platform. Reversal must never lose queued review events.
