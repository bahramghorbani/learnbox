# Admin compatibility and gap audit against v1.2.1

**Status:** audit record (evidence, not a plan and not a scope freeze). Recorded 2026-09-30.
**Audited source:** tag `v1.2.1` = `4ade0a885fa93a418db8cde94b81a206bcd80860`.
**Method:** read-only. Source read from the tag; canonical migrations `0001`–`0022` applied to a
throwaway Postgres 17 with the runner's per-file transaction semantics; anonymous `GET`s to the
public Admin origin; read-only, rolled-back catalog queries and `docker inspect` on the VPS.
**No Production mutation was performed.** No secret, credential value, phone number or learner data
is recorded here.

Companion plan: [`ADMIN_P0_PATCH_PLAN.md`](ADMIN_P0_PATCH_PLAN.md).

## Long-term principle (owner direction)

The Learner App and Admin must be two interfaces over **one** canonical backend, database,
migrations, repositories/services and business rules. Admin must not keep duplicate business logic,
raw parallel definitions, build-time fake or stale data, or a second definition of progress,
content or users. Eventually all Admin data is real Production-backed data and Admin manages the
app through shared authenticated and authorized backend operations, with auditability and
provenance.

Path: Audit → P0 Security → Compatibility/Data Unification → Admin Redesign → Feature Parity →
Integration/E2E Verification → Production.

## Severity classes

- **Critical** — exposure or unauthenticated mutation reachable on Production today.
- **High** — must be fixed before Admin is re-enabled; latent because Admin is effectively offline.
- **Debt** — drift or duplication that can recreate the consistency problems already fixed.
- **Missing feature** and **Redesign** — not compatibility defects.

## Critical (reachable today)

**C1. Learner card content is served anonymously by Admin.**
`GET https://admin.learnboxapp.com/` returns 200 without a session and is edge-cacheable
(`cache-control: s-maxage=31536000`, `x-nextjs-prerender: 1`). The HTML and one JS chunk contain
all 35 Start items in full (lemma, Persian meanings, examples). Cause: the review workspace
imports repository draft JSON at build time
(`apps/admin/app/components/ContentReviewWorkspace.tsx` → `content/packs/learnbox-start/…`), and
the login gate only hides the UI client-side. Media files are not referenced in the bundle, so the
exposure is text only. This contradicts the standing rule that no learning content is public.

**C2. `/api/banners` has no authentication.**
The source and the compiled Production route contain no session check. Anonymous `GET` returns 200
with the sample banner row. `POST`, `PUT` and `DELETE` are equally unguarded in code (inferred from
source and from the compiled route; deliberately **not** exercised, because a test would mutate
Production). The route builds its own DB pool per request, returns `String(err)` in 500 bodies,
and validates no URLs. Nothing in the learner app reads `banners`, so current impact is deface and
data integrity, not learner exposure.

**C3. A second, separately reachable Admin deployment exists on Vercel.**
The Vercel project `learnbox-admin-preview` (team `learn-box`) has Ready **Production-target**
deployments, and its alias `https://learnbox-admin-preview.vercel.app` answers publicly with no
Vercel protection (the per-deployment and `*-learn-box`/`git-main` URLs redirect to Vercel SSO; the
short alias does not). It carries no Git metadata (deployed from a local upload, not from `main`).
Anonymous probes, the same set as against the VPS Admin, show:

- `/` returns 200 and its JS bundles contain all 35 Start items (36 `start-a1-*` ids, 40
  `persianMeanings`), i.e. C1 applies here too;
- `/api/banners` returns 200 with the **same** `banner_sample1` row as the VPS Admin, which proves
  this deployment is wired to the same Production database (`C2` applies here too);
- `/api/auth/session` returns **401** here but **404** on the VPS Admin, so this is a different
  build and/or a different Admin auth configuration. Its environment variable names and values were
  **not** inspected in this audit; whether passkey login is enabled there is unverified;
- the Vercel alias list also claims `admin.learnboxapp.com`, but DNS for that host resolves to the
  VPS (`185.204.168.178`), so the Vercel alias is dormant, not serving.

The repository documents state that Production Admin is the VPS deployment and that Vercel is
preview only. This deployment contradicts that: it is an unrecorded, second Production-facing
Admin with database access. It must be enumerated and brought under the same restriction as the
VPS Admin (see the plan, step 0).

## What currently contains the exposure

`LEARNBOX_ADMIN_PASSKEY_ENABLED=false`, `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=false`,
`LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED=false`; `admin_owner` is not bound to a user and there are
0 role assignments. As a result `users`, `packs`, `gateways` and `transactions` return 401 to
everyone and the users screen shows a fetch error. Admin is effectively offline, except for C1 and
C2. **Enabling passkey login would activate every High item below.** This containment statement is
proven for the VPS Admin only; it is **unverified** for the Vercel Admin (C3).

## High

**H1. No mutation guard on the legacy Admin mutations.**
Admin already has its own guard: `assertTrustedAdminMutation` (exact-`Origin` and `Content-Type`
allow-list, `admin-auth-policy.ts`) plus a per-session CSRF token (`x-learnbox-csrf-token`, verified
by `verifyAdminCsrf`). Both are applied only inside the newer handler factories (login, bootstrap,
reauth, logout, content-review check/decision, splash replace). They are **absent** from
`users/[userId]` (PATCH), `packs` (POST, PATCH), `packs/generate`, `packs/import`, `gateways`
(POST, PATCH) and `banners` (POST, PUT, DELETE), and from `auth/add-passkey/verify` (POST, which
registers a new credential and checks only the session). Admin cookies are `SameSite=Strict`, which
is defence in depth but not a substitute. There is no route-inventory test (the learner app has one
after LB-B29) that would fail when a mutating route is added without a guard, and no shared
`guardMutation`-style entry point, so Admin has a second, divergent guard definition.

**H2. Account-deletion / progress-erase bypass.**
`PATCH /api/users/[userId]` with `action: "reset_progress"` issues three separate `DELETE`s
(`review_events`, `card_schedules`, `learner_reconciliation_cursors`) with no transaction, no CSRF,
no Origin guard, no re-auth, no owner/self/privileged-account check, no audit row and no session
revocation. The canonical erase path (`account-deletion.ts`, `account-deletion-store.ts`) defines
a full erase set (also `mobile_learner_sessions`, `user_packs`, `payment_logs`), an
`assert_deletable` step that refuses owner and reviewer identities, idempotency and a minimal audit
event. Admin re-implements 3 of those tables by hand and enforces none of the safeguards. The
learner-side reset route is deliberately hard-disabled in Production; Admin still has it.

**H3. Pack publish bypasses the six-dimension review gate.**
`PATCH /api/packs` accepts any of `draft`, `ai_generated`, `needs_review`, `approved`, `published`
for any `pack_id` and runs `UPDATE packs SET status = $1 … WHERE id = $2`. On `published` it then
runs `UPDATE card_versions SET status = 'published', published_at = now() WHERE card_id IN (SELECT
card_id FROM pack_cards WHERE pack_id = $1) AND status != 'published'`. That promotes **every**
card version in the pack regardless of its review state (draft, `needs_review`, `rejected`). The
content-review store states that approval only ever moves a version to `approved`, never
`published`, and the learner catalog serves versions whose `card_versions.status = 'published'` in
`packs.status = 'published'`. The two statements are not in a transaction and neither checks the
review decisions. Read in full from the source; not exercised.

**H4. Admin and the learner app use the same all-powerful database role.**
Read-only, rolled-back inspection of both Production containers' DSNs (identity compared by hash,
never printed): the DSNs are **identical**. The role is the Neon project owner (`neondb_owner`),
member of `neon_superuser`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, owner of all 38 public tables,
with `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` on every table including `audit_logs`, `admin_owner`,
`admin_role_assignments`, `schema_migrations`, `account_deletion_events`, `review_events` and
`users`, and `CREATE` on the public schema and database. There is no least privilege: a single Admin
defect is equivalent to full database compromise, and Admin can delete its own audit trail.

**H5. No audit trail on the legacy Admin mutations.** The newer handlers (auth, content review,
splash) write `audit_logs`; the legacy routes (`users/[userId]`, `packs`, `packs/generate`,
`packs/import`, `gateways`, `banners`) write none. Because the shared role can `DELETE` and
`TRUNCATE` `audit_logs` (H4), even the audited paths are not tamper-evident.

**H6. Authorization is coarse.** Outside content review (`admin_role_assignments`), any valid Admin
session can perform every operation. No per-operation role or fresh re-authentication is required
for destructive actions (`reauth` exists only for the passkey flows).

**H7. Payments surface conflicts with the no-payments directive.** Admin can create gateways,
toggle `is_active`, set pack prices and list transactions. Gateway `config` (which would hold
keys) is stored as raw JSON with no masking, in a table also writable by the shared role.

## Provenance (Production Admin)

- Running image: `learnbox-admin:production` = `sha256:d4f39bfccfbd…`, created
  2026-09-25 21:15 UTC, container started 2026-09-25 21:53 UTC, 0 restarts, healthy.
- The image carries **no** `org.opencontainers.image.revision` label and **no** `APP_SOURCE_SHA`
  (contrast: the learner image carries both). Its Next.js `BUILD_ID` is `qO877TTXdHifokhBTk59e`.
- No build script, log or source archive for it exists under `deployments/`, which holds only the
  v1.2.0 and v1.2.1 learner builds. The Admin runtime dir holds only `compose.yaml` and `.env`.
- It was built before v1.2.0, v1.2.1 and the last Admin-touching commit (2026-09-27).
- The 25 compiled route handlers and all 27 extracted SQL statements match the source at both
  `5d1df01` (2026-09-26) and `9e86e75` (2026-09-27), and at `v1.2.1` (route-set difference 0). They
  do **not** match `0d5c490` or earlier (11 routes differ). So the image was built from a tree
  between `5d1df01` and `v1.2.1`, but the two cannot be told apart from the artifact. **The exact
  source commit is not provable from the artifact.** This is a continuity incident (see the
  repository-continuity rule): Production runs something Git cannot identify.
- Caddy serves Admin from a config mounted out of the old landing release directory
  `/srv/learnbox/releases/0a36cce8a0a2-phase1/...`, which is not byte-identical to
  `infrastructure/production/landing/Caddyfile` at `v1.2.1` (the live block is named `(admin_app)`;
  the repo names it `(admin_staging)`; whitespace differs). Edge configuration is therefore also
  not reproducible from Git.

## Schema and drift

- A fresh `0001`–`0022` migration matches Production on all 266 application columns, with no
  columns missing on either side. One index exists only in Production
  (`splash_versions_object_key_idx`) and `schema_migrations_pkey` appears only in Production's own
  ledger table (an artifact of the comparison). The `packs`, `banners` and `payment_*` tables were
  originally out-of-band prototype tables adopted by `0022` with `CREATE TABLE IF NOT EXISTS`;
  `packs.status` has no `CHECK` constraint.
- Admin has no migrations or schema of its own; it reads and writes the shared schema directly.
  There is no schema-drift test that covers the Admin queries.
- My first fresh-migrate attempt failed at `0017`, but only because the plain `psql` harness lacked
  the per-file transaction the runner uses (the file uses `CREATE TEMP TABLE`). It applies cleanly
  with one. This is not a repository defect.

## Duplicated logic and technical debt

- Two DB access patterns: a hardened shared pool (`verify-full`, max 2) used by some routes, and a
  per-request `new Pool` with no TLS enforcement in others (`banners`, plus a local `getPool` in
  several routes).
- Raw SQL, `SELECT *` and copy-pasted `requireSession` in route handlers; no repository/service
  layer shared with the learner backend.
- "What counts as learner progress" is defined in at least three places (learner repository,
  account-deletion erase set, Admin reset).
- Content review is fed by build-time JSON, not the database (see C1).
- The users route logs the session user id on every request.
- Admin route and component test coverage is unmeasured; accessibility has not been exercised.
- The Admin image is built and deployed with no provenance and no release procedure.

## Missing capabilities against what the learner and backend now require

Session list and revoke (LB-B26), account-deletion event visibility, the B28a profile fields
(Admin shows phone and first name only), support and OTP health, backup and restore-drill status,
release identity, an audit-log viewer, an overview dashboard, media status. These are features,
not compatibility defects.

## UX and information architecture (redesign input, not P0)

Eight sidebar items, two of which ("گزارش‌ها" and "تنظیمات") both point to `#review`; a single
hash-routed page with no deep links or reliable back button; native `alert` and `confirm` for
destructive actions; generic errors without reason or retry; six unrelated concerns in one flat
navigation; nothing role-aware.

## Recommended priority order (input to the owner, not a scope freeze)

1. P0 — contain C1, C2 and C3 and prove Admin identity/least privilege ([plan](ADMIN_P0_PATCH_PLAN.md)).
2. P1 — one shared guard, session, pool and repository layer in front of every Admin route; route
   destructive and publish paths through the shared services and gates; audit rows; provenance.
3. P2 — remove or defer the payments surface.
4. P3 — redesign and feature parity.

## Not verified

Admin database role privileges were read from the role that Production Admin actually uses; a
separate role does not exist yet. Least-privilege _behavior_ (what each route needs) is derived
from the source SQL in the plan and has not been exercised. Behavior on the Admin origin under a valid session could not be
observed, because no session can exist while passkey login is disabled.
