# API principles

REST/OpenAPI boundary, versioned endpoints, short-lived access tokens, rotated refresh tokens, idempotency keys for writes, structured errors, and rate limits. No production endpoint is exposed by this foundation.

The review-write boundary accepts one authenticated learner's grade, occurrence time and `client_event_id`. Its persistence adapter must claim that idempotency key and update `card_schedules` in the same database transaction. The HTTP controller remains disabled until real authentication is connected; clients must not send a user identifier as a substitute for authentication.
