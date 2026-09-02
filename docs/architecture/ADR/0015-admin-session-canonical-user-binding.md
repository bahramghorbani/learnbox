# ADR 0015 — Admin session canonical-user binding for content review

- **Status:** blocked design gate; implementation requires an owner-approved serial schema/auth task
- **Date:** 2026-09-02
- **Basis:** `origin/main` at `8ab2226`; `database/migrations/0003_content_review.sql`; `database/migrations/0009_owner_passkey_auth.sql`; `apps/admin/lib/server/admin-route-security.ts`; `apps/admin/lib/server/postgres-owner-auth-store.ts`

## Context

The Admin content-review queue has a truthful local preview and a server-only
`PostgresContentReviewStore` write seam. The next safe slice is an authenticated server read of the
review queue. That read must authorize the actor against `admin_role_assignments`, and future review
writes must record the same canonical actor in `reviewer_user_id` and `audit_logs.actor_user_id`.

The current Admin authentication schema deliberately models one passkey owner:

- `admin_owner.singleton_id` is the owner boundary;
- `admin_sessions.owner_singleton_id` binds a session to that owner boundary;
- `admin_sessions` has no `user_id` or canonical application-user foreign key;
- `loadAdminSession` therefore returns token/CSRF/session freshness, but no `users.id`;
- review roles and review/audit records require a UUID from `users.id`.

The singleton integer is not a valid substitute for a `users.id`. A browser-provided user id,
phone, OTP, role, or arbitrary actor value is also not an acceptable substitute.

## Decision

Keep the content-review server route fail-closed until every authenticated Admin session can resolve
to a canonical `users.id` through a server-owned, foreign-key-constrained relation.

The future implementation must satisfy all of these invariants:

1. The mapping is stored and resolved server-side, never supplied by the browser.
2. The relation is explicit and constrained by a foreign key to `users(id)`.
3. The session lookup returns the canonical user id together with the validated session.
4. Role authorization is evaluated from `admin_role_assignments` for that canonical user id.
5. Missing, ambiguous, revoked, expired, or unmapped identity returns an unauthenticated/forbidden
   response without reading or mutating review data.
6. Review reads are `no-store` and scoped to the authorized actor's permitted admin role boundary.
7. Review writes remain a separate task and continue to require CSRF, recent authentication,
   idempotency, complete six-dimension review, and publisher separation.

## Rejected shortcuts

- Treating `owner_singleton_id = 1` as a `users.id`.
- Selecting the first user, first role assignment, or first admin user.
- Accepting `userId`, role, phone, OTP, or authorization headers from the client as identity.
- Adding a route that returns the local draft fixture while presenting it as database-backed.
- Activating the route before the schema mapping and staging-only integration test exist.

## Required follow-up

A separate owner-approved serial task must choose and implement the mapping lifecycle, including:

- how the permanent Admin owner is linked to an existing canonical `users` row;
- whether the relation belongs on `admin_owner` or a separate constrained binding table;
- bootstrap and recovery rules without exposing secrets or allowing account takeover;
- migration and staging integration tests;
- session lookup and revocation behavior after binding changes;
- audit semantics for owner identity and role changes.

Until that task is approved and verified, the Admin review queue remains a local preview and the
server content-review read/write operations remain unavailable.

## Consequences

This prevents an authenticated Admin session from being misattributed to the wrong learner or
reviewer and keeps audit records truthful. It delays the server-backed review queue until the
identity boundary is explicit, but avoids an unreviewable security shortcut.

No migration, route, flag, environment, production, staging, content, or publication behavior is
changed by this ADR.
