# API principles

REST/OpenAPI boundary, versioned endpoints, short-lived access tokens, rotated refresh tokens, idempotency keys for writes, structured errors, and rate limits. No production endpoint is exposed by this foundation.

The review-write boundary accepts one authenticated learner's grade, occurrence time and `client_event_id`. Its PostgreSQL adapter claims that idempotency key before updating `card_schedules` in the same database transaction. The HTTP controller remains disabled until real authentication is connected; clients must not send a user identifier as a substitute for authentication.

The planned admin review boundary will derive the editor identity and roles from the authenticated session, not from request fields. It will accept only an idempotency key, the version to review, an approve/return action, and an optional editorial reason. It must atomically append the decision and audit log, then update the version only if it is still in the review queue. Publishing is a separate, role-gated operation.
