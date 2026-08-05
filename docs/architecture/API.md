# API principles

REST/OpenAPI boundary, versioned endpoints, short-lived access tokens, rotated refresh tokens, idempotency keys for writes, structured errors, and rate limits. No production endpoint is exposed by this foundation.

The server-side OTP request coordinator creates the short-lived code and opaque challenge, persists
the phone/IP rate-limit event, and only then calls the delivery client. It returns only the opaque
challenge metadata. SMS.ir remains disabled and no HTTP route exposes this coordinator yet.

The OTP verification coordinator hashes the submitted code against the opaque challenge before
calling the atomic store. Unknown, incorrect, locked, expired and already-used challenges all
collapse to one generic rejection; only a consumed valid challenge returns its opaque phone hash
to the future internal learner-identity mapper.

The learner web app exposes same-origin JSON-only `POST /api/auth/otp/request` and
`POST /api/auth/otp/verify` routes. They reject cross-origin requests before touching persistence,
normalize Persian/Arabic digits on the server, derive opaque IP and phone hashes, return generic
provider/verification errors, disable caching, and issue the signed HttpOnly learner cookie only
after the atomic store consumes a valid challenge. The runtime remains fail-closed while
`SMS_IR_ENABLED` is false or any required server secret is absent.

The review-write boundary accepts one authenticated learner's grade, occurrence time and `client_event_id`. Its PostgreSQL adapter claims that idempotency key before updating `card_schedules` in the same database transaction. The HTTP controller remains disabled until real authentication is connected; clients must not send a user identifier as a substitute for authentication.

The server-side admin review core derives authorization from `admin_role_assignments`, never from a
browser request. Its future authenticated route will supply only the session-derived actor ID, an
idempotency key, the version to review, an approve/return/reject action and an optional editorial
reason. One PostgreSQL transaction locks the version, appends the decision and audit log, and then
changes a reviewable version only to `approved` or durable `rejected`. It has no publication
operation: publishing remains a separate, role-gated boundary for a content publisher or super
admin.
