# PDR-007 — Web-only masked identity read

- **Status:** approved
- **Date:** 2026-09-08

## Context

The accepted M3 Profile and Settings contract defers authenticated identity presentation to M3-A1. Learner Web already has a signed HttpOnly learner session whose subject is the canonical `users.id`, and the server stores `users.phone_e164`. Android native authentication remains dormant until a non-SSO gateway is available.

Exposing both platforms now would either fabricate Android identity or silently expand native-auth scope. Returning a raw phone number to the browser would expose more personal data than Profile needs. The nullable `users.first_name` field is not a dependable current learner identity because the closed-alpha sign-in flow does not collect or verify it.

## Decision

M3-A1 is a Web-only, read-only slice:

1. Add a separately reviewed authenticated learner-profile endpoint derived only from the signed HttpOnly learner cookie. The browser cannot supply a user ID, phone number or bearer token.
2. Read the matching canonical `users` row and return only a server-masked Iranian phone identity. Never serialize `phone_e164`, `first_name`, session payloads or internal identifiers.
3. Present the masked phone on Web Profile only after a valid successful response. Keep device-local goal and pending-review facts independent of the network request.
4. Fail closed for disabled/incomplete runtime configuration, invalid or expired session, missing learner, malformed server data, offline state and server failure. Use generic errors, `cache-control: no-store`, and a bounded retry for the failed identity read.
5. Keep the endpoint and composition behind a dedicated default-off runtime boundary. This decision does not enable Preview or Production.

## Explicit exclusions

- Android/mobile UI or native transport
- authentication, OTP, session format or cookie changes
- profile editing, display-name collection or avatar support
- sign out, account deletion or account-scoped local-data partitioning
- review-sync activation, server preference sync, purchases, reminders or analytics
- database migrations, seed changes, deployment, secrets, Preview or Production activation

## Acceptance consequences

The Web Profile may replace the neutral `حساب LearnBox` label with a truthful masked phone only in the authenticated success state. Loading affects only the identity card. Unauthorized state exposes no account-specific value; offline/error states retain all local Profile facts and never reuse stale identity as current server evidence. Android remains on its neutral local-only account label until a separately authorized native identity path exists.

## Reversibility

The dedicated runtime boundary can remain disabled or be rolled back without changing sessions, learner data or local preferences. A future display-name or Android identity slice requires a new reviewed decision and must not infer authorization from this record.
