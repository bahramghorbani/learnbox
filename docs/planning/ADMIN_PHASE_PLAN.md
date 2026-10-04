# Admin phase plan — operational control plane

**Opened:** 2026-10-04
**Status:** plan only. No implementation started. No Production change.

## 0. Framing

Two goals, in priority order:

1. **Make Admin a real operational control plane** over the existing backend and database as the
   single source of truth. No duplicated business logic, no fabricated dashboard numbers.
2. **Redesign the Admin UI/UX** into a complete, professional management panel.

Goal 1 outranks goal 2: a beautiful panel over fake or wrong data is worse than no panel. Where
they conflict, correctness of the data path wins.

Out of scope for this phase: Store/commerce, Native release, Scheduler V2 activation, any
unrelated future feature. Admin stays non-public.

## 1. Current state (verified 2026-10-04, not assumed)

**Exists and is real:**

- Passkey/WebAuthn auth (`@simplewebauthn`), `__Host-` session cookie, hashed session tokens,
  timing-safe comparison, CSRF header check, reauth recency, bootstrap enrolment.
- Persisted content review: `content_review_checks` (210 rows), `content_review_decisions` (35).
- Splash management with versioning and an audit trail.
- A rendered RTL Persian workspace shell with an icon rail.

**Weak or missing:**

- One real page (`app/page.tsx`, 11 lines) plus `/bootstrap`. The sidebar's `content`, `reports`
  and `settings` entries all point at `#review` — placeholder navigation.
- Legacy route group — `banners`, `packs` write paths, `gateways`, `transactions`, `users` —
  holds raw SQL and duplicated rules, and is **fail-closed to 404 in any production build**
  via `legacyAdminRouteGate()`.
- `users/[userId]` selects `rating` and `created_at`; the real `review_events` columns are
  `grade` and `occurred_at`. This route is **broken against the real schema** (LB-B34).
- No `dev` script in `apps/admin/package.json`.
- Admin and the learner app share one owner DSN (LB-B32).

**Deployment topology:**

- Production `admin.learnboxapp.com` → Caddy `respond "Not Found" 404`. Deliberate, reversible
  containment from 2026-09-30 (LB-B30/B31); the pre-containment Caddyfile is preserved on the
  host under `/home/ubuntu/learnbox/evidence/admin-containment-*/`.
- The admin container runs healthy with **no published ports**; the `(admin_app)` proxy block
  exists but is not referenced by any site.
- `NODE_ENV=production`, `ADMIN_LEGACY_ROUTES_DISABLED=true`,
  `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=false`.
- The Vercel admin preview returns 503.

**Verdict:** Admin is contained, not production-ready, and not publicly reachable. The earlier
anonymous-bundle and unauthenticated-`/api/banners` findings are mitigated by the containment
plus the fail-closed legacy gate.

## 2. Information architecture

Derived from real tables, not invented. Every module names the tables it reads.

| Module                          | Real backing                                                                                                                       | Phase  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Overview**                    | aggregates of the tables below                                                                                                     | 2      |
| **Content review**              | `content_review_checks`, `content_review_decisions`, `cards`, `card_versions`                                                      | exists |
| **Cards & packs**               | `cards`, `card_versions`, `packs`, `pack_cards`                                                                                    | 1      |
| **Users**                       | `users`, `invite_codes`, `invite_consents`, `account_deletion_events`                                                              | 1      |
| **Learner state** (read-mostly) | `card_schedules`, `review_events`, `learner_daily_plans`, `learner_reconciliation_cursors`, `review_event_rejections`              | 2      |
| **Sessions & access**           | `admin_sessions`, `admin_owner`, `admin_passkey_credentials`, `admin_role_assignments`, `revoked_sessions`, `user_session_cutoffs` | 2      |
| **Operations**                  | `audit_logs`, `otp_challenges`, `otp_request_events`, `schema_migrations`, `private_media_cleanup_jobs`                            | 2      |
| **Presentation**                | `banners`, `current_splash`, `splash_versions`, `splash_replacement_actions`                                                       | 3      |

**Deliberately excluded this phase** (tables exist but are commerce//Store):
`billing_products`, `payment_gateways`, `payment_logs`, `purchase_events`,
`purchase_ownership_claims`, `user_packs`, `entitlement_tiers`, `mobile_learner_sessions`.

Learner state is **read-mostly**. Any mutation of learner data goes through the existing
learning-engine services and an audit record — Admin never writes schedules with raw SQL.

## 3. Phases

**Phase A — safe access and a truthful foundation.** Local dev path, a real `dev` script, and
the users route fixed against the real schema. No new UI yet.

**Phase B — read-only control plane.** Overview, Users, Cards & packs, Learner state as
read-only views built on shared services. Every number traceable to a query.

**Phase C — guarded mutations.** Only the mutations launch actually needs, each behind auth +
CSRF + reauth recency + an `audit_logs` entry, each with a test.

**Phase D — UI/UX redesign.** Real multi-route navigation replacing the `#review` placeholders,
consistent RTL layout, loading/empty/error states.

Phase ordering is deliberate: correctness of the data path first, presentation last.

## 4. Non-negotiables

- Admin stays non-public. No Caddy change without explicit owner authorization.
- No learner-data mutation without an owner gate and an audit record.
- Legacy routes stay fail-closed until rebuilt on shared services.
- Production untouched this phase.
- No duplicated business logic: Admin calls the same services the learner app uses.

## 5. Known debt carried, not activated

- **LB-B32** Admin and learner share one owner DSN — should become a least-privilege Admin role.
- **LB-B34** legacy route schema drift — fixed for `users` in Phase A, rest when rebuilt.
- Residual FV debt: F-1 (unprecached Bobo expressions), D-FV-2 («دقت» UX wording).

These remain recorded and non-active.
