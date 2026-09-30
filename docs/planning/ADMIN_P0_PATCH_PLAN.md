# Admin P0 security and compatibility patch plan

**Status:** PLAN ONLY. Nothing here is implemented, deployed or approved. Every step marked
**[OWNER GATE]** needs explicit owner approval at execution time. Not a v1.3 scope freeze.
**Evidence base:** [`ADMIN_COMPATIBILITY_GAP_AUDIT.md`](ADMIN_COMPATIBILITY_GAP_AUDIT.md), source tag
`v1.2.1` = `4ade0a885fa93a418db8cde94b81a206bcd80860`. Written 2026-09-30.

## Principle and boundaries

Learner App and Admin become two interfaces over **one** canonical backend, database, migrations,
repositories/services and business rules. P0 does not build that; it removes the exposures and the
bypasses that would otherwise be carried into it, and proves what Production Admin actually is.

Target path: Audit → **P0 Security** → Compatibility/Data Unification → Admin Redesign → Feature
Parity → Integration/E2E Verification → Production.

**P0 must not:** redesign Admin, add features, change learner behavior, add migrations to the
learner schema, touch payments beyond disabling them, move any tag, or change Production before the
owner gate. Forward-only, no destructive database action, no secrets in chat.

## Step 0. Enumerate every Admin deployment (read-only, no gate)

The audit found two public Admin deployments, not one:

| Deployment                                                                                                      | Serves                         | Source provable?               | Anonymous exposure           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------ | ---------------------------- |
| VPS `learnbox-admin:production` (`sha256:d4f39bfc…`), Caddy → `admin.learnboxapp.com` (DNS → `185.204.168.178`) | live                           | No (no label, no build record) | C1, C2                       |
| Vercel `learnbox-admin-preview`, alias `learnbox-admin-preview.vercel.app`, Production target, no Git metadata  | live, unprotected short alias  | No                             | C1, C2, wired to the same DB |
| `admin-staging.learnboxapp.com`                                                                                 | NXDOMAIN (Cloudflare status 3) | n/a                            | none                         |

Remaining read-only enumeration: environment-variable **names** (never values) on the Vercel
project, which Admin flags it runs with, whether it can create sessions, and whether any other
alias or project points at Admin code. Result decides the Vercel restriction below.

## Step 1. Temporary restriction of the current Production Admin

**Goal:** remove C1, C2 and C3 exposure and the latent H-class risk _now_, reversibly, without
touching the learner app, the database or any learner data.

Facts that make this cheap and safe:

- Admin is effectively offline already: passkey, bootstrap and content-review flags are `false`,
  `admin_owner` is unbound and there are 0 role assignments, so no Admin session can exist.
  Restricting Admin therefore removes **no** working capability.
- Admin is not part of any monitor, backup or restore-drill script (0 references to it in the ops
  scripts and unit files).
- It runs as its own compose project (`learnbox-admin-production`) and shares only the Docker
  network `learnbox-edge` and the Caddy front end with the learner app.

### Options considered

| Option                                                                                         | Removes                                              | Reversible                             | Risk to learner app                                                                                                                                     | Notes                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Caddy: answer `admin.learnboxapp.com` with a fixed `404`/`503`, no upstream                 | all anonymous access on the VPS host                 | Yes (restore the file, `caddy reload`) | Low: one shared Caddy process. A bad reload would affect `app.` and the landing site, so validate with `caddy validate` and reload only (never restart) | Caddyfile is a **single-file bind mount** from an old release directory and is not byte-identical to Git; edit **in place** (keeps the inode), back up first, and record the live file into Git afterwards |
| B. `docker compose stop admin` (image and volumes untouched)                                   | the whole listening process **and** its live DB pool | Yes (`compose start`)                  | None (separate project)                                                                                                                                 | Caddy then returns 502 for the Admin host. Does not need a Caddy change                                                                                                                                    |
| C. Vercel: enable Deployment Protection on `learnbox-admin-preview`, or remove the short alias | anonymous access on Vercel                           | Yes                                    | None                                                                                                                                                    | The Vercel deployment has DB access; protection stops anonymous reach but not the credentials it holds                                                                                                     |
| D. Rotate the shared DB credential                                                             | any leaked/held copy                                 | Not cheaply                            | **High**: both apps use one role today, so rotation is an outage for the learner app                                                                    | Not part of P0-restriction; belongs to the role-separation step, coordinated                                                                                                                               |

### Recommendation (safest sequence)

1. **B first**, preceded by preserving evidence: `docker tag learnbox-admin:production
learnbox-admin:evidence-d4f39bfc` (no rebuild, keeps the running artifact identifiable) and a
   copy of the container inspect output. Stopping removes the anonymous C1/C2 surface _and_ the
   process holding an owner-privileged DB connection. Cost is zero because Admin cannot be used.
2. **A second (optional, defence in depth)**: a fixed `404` for the Admin host so a later accidental
   `compose start` does not re-expose it. Skipped if you prefer not to touch shared Caddy.
3. **C for Vercel**: enable Vercel Authentication (Deployment Protection) on
   `learnbox-admin-preview` for all deployments and remove the short alias, after Step 0 confirms
   what that project runs. If the project is not needed at all, unassign the domain and pause the
   project instead of deleting it (retain for evidence).
4. Do **not** delete the container, image, `.env`, the Vercel project or any deployment. Retain as
   recovery evidence until you name them.

**[OWNER GATE]** Steps 1.1–1.3 change Production infrastructure. They are not authorized by this
document. Verification after execution: anonymous `GET /` and `/api/banners` on both hosts no
longer return 200 content; learner `app.learnboxapp.com` health 200, container start time and
restart count unchanged, `/api/health` ok; Caddy config still validates.

## Step 2. Exact source and image identity (provenance)

**Finding:** the running Admin image `sha256:d4f39bfccfbd…` (built 2026-09-25 21:15 UTC, container
started 21:53 UTC, 0 restarts) has no OCI revision label and no runtime SHA. Its 25 compiled routes
and all 27 extracted SQL statements match source at `5d1df01`, `9e86e75` and `v1.2.1`, and do not
match `0d5c490` or earlier. So the artifact was built from some commit in
`5d1df01..v1.2.1` on the Admin path, but **cannot be tied to one commit**. The Next.js `BUILD_ID`
is `qO877TTXdHifokhBTk59e`.

**Plan (read-only until the last bullet):**

1. Rebuild the Admin image **locally**, at each candidate commit on the Admin path
   (`5d1df01`, `9e86e75`, `v1.2.1` and any commit between that changes `apps/admin`,
   `packages/**` or the lockfile), with the same `infrastructure/production/admin/Dockerfile`, and
   compare the emitted `BUILD_ID`, route manifests and chunk contents with the live image. A match
   proves the commit; a non-match for every candidate is recorded as "unprovable" instead.
2. Write the result to the continuity record as a **provenance incident**, either way.
3. Going forward, every Admin image carries `org.opencontainers.image.revision` and a runtime
   `ADMIN_SOURCE_SHA`, built by a recorded script from a `git archive` of the exact merged commit
   (the same procedure used for the learner image), and a test asserts the labels.
4. The live Caddy block for Admin differs from Git (`(admin_app)` vs `(admin_staging)`, whitespace,
   the file lives in `/srv/learnbox/releases/0a36cce8a0a2-phase1/...`). Record the live Admin block
   into `infrastructure/production/` in a docs/infra PR and make the mount path a repo-owned one.
   No behavior change is intended by that record.

## Step 3. Mutation-guard inventory and gaps (code, P0 patch)

### Inventory of the 25 Admin route files

| Route                                                                         | Verbs               | Session   | Origin + Content-Type | Admin CSRF token | Mutating SQL                                          | P0 disposition                                                         |
| ----------------------------------------------------------------------------- | ------------------- | --------- | --------------------- | ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `auth/login/options`, `login/verify`, `bootstrap/options`, `bootstrap/verify` | GET/POST            | pre-login | POST guarded          | n/a              | sessions/credentials                                  | keep; keep guard                                                       |
| `auth/logout`, `auth/reauth/options`, `reauth/verify`                         | GET/POST            | yes       | guarded               | yes (POST)       | sessions                                              | keep                                                                   |
| `auth/session`                                                                | GET                 | cookie    | none needed           | n/a              | none                                                  | keep                                                                   |
| **`auth/add-passkey/verify`**                                                 | POST                | yes       | **no**                | **no**           | passkey credentials                                   | **add guard + CSRF**                                                   |
| `auth/add-passkey/options`                                                    | GET                 | yes       | n/a                   | n/a              | challenge row                                         | keep                                                                   |
| `content/review/check`, `content/review/decision`                             | POST                | yes       | guarded               | yes              | review rows, audit                                    | keep                                                                   |
| `content/review`                                                              | GET                 | yes       | n/a                   | n/a              | none                                                  | keep                                                                   |
| `splash/replace`                                                              | POST                | yes       | guarded               | yes              | splash tables                                         | keep                                                                   |
| `splash/current`, `splash/preview`                                            | GET                 | cookie    | n/a                   | n/a              | none                                                  | keep                                                                   |
| **`banners`**                                                                 | GET/POST/PUT/DELETE | **none**  | **no**                | **no**           | INSERT/UPDATE/DELETE                                  | **disable in Production** (nothing in the learner app reads `banners`) |
| **`users/[userId]`**                                                          | GET/PATCH           | yes       | **no**                | **no**           | 3 hard DELETEs                                        | **remove `reset_progress`**; keep GET behind session                   |
| `users`                                                                       | GET                 | yes       | n/a                   | n/a              | none                                                  | keep GET, no id logging                                                |
| **`packs`**                                                                   | GET/POST/PATCH      | yes       | **no**                | **no**           | INSERT/UPDATE (status, publishes all card versions)   | **disable mutations**                                                  |
| **`packs/generate`**                                                          | POST                | yes       | **no**                | **no**           | INSERT cards, card_versions, pack_cards, UPDATE packs | **disable**                                                            |
| **`packs/import`**                                                            | POST                | yes       | **no**                | **no**           | INSERT cards, card_versions, pack_cards               | **disable**                                                            |
| `packs/csv-template`                                                          | GET                 | none      | n/a                   | n/a              | none                                                  | static; keep or disable with the import feature                        |
| **`gateways`**                                                                | GET/POST/PATCH      | yes       | **no**                | **no**           | INSERT/UPDATE `payment_gateways`                      | **disable** (no-payments directive)                                    |
| `transactions`                                                                | GET                 | yes       | n/a                   | n/a              | none                                                  | **disable** with payments                                              |

Bold rows are the gaps: **1 unauthenticated mutation route (`banners`), 6 cookie-authenticated
mutation route files without a guard, and 1 credential-registering route without a guard.**

### Minimal patch design

1. **One shared entry point, first in every route file.** Add a single
   `guardAdminMutation(request, { contentTypes })` that wraps the existing
   `assertTrustedAdminMutation` (exact-`Origin` plus `Content-Type` allow-list), returns
   `403 {"error":"request_rejected"}` with `cache-control: no-store` on failure (same envelope as the
   learner app, LB-B29), and is followed by session load and `verifyAdminCsrf`. It is **first**
   in the file; the LB-B29 staging defect (`6dd6fe9`) showed a session read placed before the guard
   silently bypasses it.
2. **Inventory test** (read the route file text, as the learner `mutation-route-inventory` does):
   every exported `POST|PUT|PATCH|DELETE` in `apps/admin/app/api/**` must either call the guard
   first or be on an explicit allow-list with a reason; a new route without a guard fails CI. The
   4-deliberate-break method used for LB-B29 is repeated.
3. **Hard-disable, not "fix", the legacy mutations in Production.** One flag
   (`LEARNBOX_ADMIN_LEGACY_MUTATIONS_ENABLED`, default off, and forced off when `NODE_ENV=production`
   like `reset-progress` and `store/activate`): `banners` (all verbs), `packs` POST/PATCH,
   `packs/generate`, `packs/import`, `gateways`, `transactions`, and `users/[userId]` PATCH return
   `404`. They stay in the tree, unreachable, until the compatibility phase reimplements them on
   shared services. This is smaller and safer than patching seven raw-SQL handlers that are going to
   be replaced anyway, and it satisfies the no-payments directive.
4. **Guard `add-passkey/verify`** with Origin + Content-Type + CSRF; it registers a credential and is
   the most sensitive route that is currently unguarded.
5. **No new error leakage:** stop returning `String(err)`; stop logging the session user id.

## Step 4. The account-deletion / progress-erase bypass

**What it is.** `PATCH /api/users/[userId]` `{"action":"reset_progress"}` deletes a learner's
`review_events`, `card_schedules` and `learner_reconciliation_cursors` with three unwrapped
statements, with none of the safeguards the canonical erase path has:

| Safeguard (canonical `account-deletion*.ts`)                                           | Admin `reset_progress`                                                |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Single transaction, all-or-nothing                                                     | No (3 separate statements; partial erase possible)                    |
| Full erase set (`mobile_learner_sessions`, `user_packs`, `payment_logs`, …)            | 3 of 8 tables; sessions survive, so a "reset" learner stays signed in |
| `assert_deletable`: refuses owner / reviewer / privileged identities                   | None; the owner's own history can be erased                           |
| Idempotency and minimal audit event (`account_deletion_events`, `owner_support` actor) | None; no audit row                                                    |
| Origin + Content-Type + re-auth                                                        | None                                                                  |
| Guard against touching protected tables                                                | n/a (hard-coded, but no shared list)                                  |

Progress is also now server-authoritative (LB-B11): a hand-written delete that misses
`mobile_learner_sessions` or a cursor leaves the learner in an inconsistent state the learner app is
built to reconcile.

**P0 action:** remove the action (Step 3.3). There is **no P0 replacement**; a support-initiated
erase is a feature. **Compatibility phase:** the only allowed path is the shared deletion service
with `actor = owner_support`, behind the guard, fresh re-authentication and an explicit role, and
the Admin UI calls it instead of holding its own table list. Until then the learner-facing
`DELETE /api/learner/account` remains the single deletion path.

**Related bypass to remove in P0:** `PATCH /api/packs` sets `card_versions.status='published'` for
every card version in a pack regardless of review state, contradicting the review store's rule that
approval never publishes. Covered by the disable in Step 3.3; the later replacement must publish
only `approved` versions through the shared release service.

## Step 5. Admin database-role privileges and least-privilege verification

**Finding (read-only, rolled-back):** Admin and the learner app use the **same DSN** (identical hash)
and that role is the Neon project owner: member of `neon_superuser`, `CREATEDB`, `CREATEROLE`,
`BYPASSRLS`, owner of all 38 tables, with `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` on every table
including `audit_logs`, `admin_owner`, `admin_role_assignments`, `schema_migrations`,
`account_deletion_events`, `review_events` and `users`, plus `CREATE` on the schema and database.

### Required Admin privileges, derived from the source SQL

Post-P0 (legacy mutations disabled), Admin needs only:

| Table(s)                                                                                                                                                                                                           | S   | I                                                | U   | D                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------ | --- | ------------------------------------------------------------------------- |
| `users`, `review_events`, `card_schedules`, `learner_reconciliation_cursors`, `payment_logs`, `pack_cards`, `cards`, `packs`, `payment_gateways`, `banners` (read-only views for the later data-unification phase) | ✓   | –                                                | –   | –                                                                         |
| `admin_owner`, `admin_passkey_credentials`, `admin_sessions`, `admin_webauthn_challenges`                                                                                                                          | ✓   | ✓                                                | ✓   | –                                                                         |
| `admin_role_assignments`                                                                                                                                                                                           | ✓   | –                                                | –   | –                                                                         |
| `content_review_checks`, `card_versions`                                                                                                                                                                           | ✓   | ✓                                                | ✓   | –                                                                         |
| `content_review_decisions`                                                                                                                                                                                         | ✓   | ✓                                                | –   | –                                                                         |
| `splash_versions`, `current_splash`, `splash_replacement_actions`, `private_media_cleanup_jobs`                                                                                                                    | ✓   | ✓                                                | ✓   | (`splash_replacement_actions`: ✓ only if the source `DELETE` is retained) |
| `audit_logs`                                                                                                                                                                                                       | –   | ✓ (append-only; no `UPDATE`/`DELETE`/`TRUNCATE`) | –   | –                                                                         |

Never granted to Admin: `TRUNCATE` anywhere, any DDL, `CREATE` on schema/database, role attributes
`SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS`, membership in `neon_superuser`, ownership of any table,
write access to `schema_migrations`, `account_deletion_events` or the learner session tables, and any
mutation of `users`. The learner app gets its **own** role with its own grant set, derived the same
way; the migration owner stays a third, separate role used only by the migration runner.

### Plan

1. **[OWNER GATE — secret]** Role creation and password entry happen in Neon (console or a guided
   secure prompt) by the owner; no password ever enters chat, a repository file or a log. Roles:
   `learnbox_migrator` (owner of objects), `learnbox_app` (learner runtime), `learnbox_admin`
   (Admin runtime).
2. **Grants as a reviewed, forward-only SQL script** committed to the repository (roles are
   cluster-scoped, so the script is an operations artifact, not a numbered application migration; it
   contains no passwords). It is idempotent, non-destructive, and reversible by `REVOKE`.
3. **Prove in a throwaway Postgres first:** apply `0001`–`0022`, create the three roles, apply the
   grants, then run positive tests (every source SQL statement of every route succeeds as its role)
   and negative tests (`TRUNCATE`, `DELETE FROM audit_logs`, `UPDATE users`, `DROP`, `CREATE TABLE`,
   reading `admin_*` as the learner role, all fail with `permission denied`).
4. **Prove on Production, read-only,** with the same rolled-back inspection used in the audit,
   parameterized by role, and assert the exact matrix above (no owner, no `TRUNCATE`, no `CREATE`).
   The result is recorded as evidence.
5. **Cutover order (each an owner gate):** Admin role first (Admin is offline, zero learner risk),
   then the learner runtime role during a normal patch release with the rollback image and `.env`
   backup preserved as in v1.2.1. Rotating or retiring the shared owner DSN is the **last** step and
   is the only step that can cause a learner outage, so it is done with the previous DSN retained
   until the new one is proven.

## Step 6. Other P0 items that are pure code (no gate until deploy)

- **Remove C1 at the source.** The review workspace must not import repository JSON into a
  client bundle or be prerendered for anonymous requests. Minimum: `dynamic = 'force-dynamic'`,
  `Cache-Control: no-store`, no `s-maxage`, render only the login shell without a valid session, and
  load review data solely from the authenticated `/api/content/review` route (database-backed). No
  redesign, no new UI.
- **Regression test for C1:** build the Admin app and assert that no `start-a1-*` id, `persianMeanings`
  or draft JSON string appears in any file under `.next/static` or in the anonymous HTML.
- **Route `banners` and the rest are covered by Step 3.**
- **Cache and headers:** the Admin origin must send `no-store` for HTML and API responses (the live
  one sends `s-maxage=31536000`).
- **Tests to add:** guard inventory; C1 bundle scan; legacy-route hard-disable in production;
  add-passkey guard; provenance label assertion; role-matrix script.

## Step 7. Gates and sequencing

1. **Now (this PR):** record audit and plan. Docs only.
2. **No-gate, read-only:** Step 0 enumeration (Vercel env names, other aliases), Step 2 rebuild
   comparison, role-matrix script development against a throwaway Postgres.
3. **Owner decision:** approve the Step 1 restriction (B, and optionally A and C), or choose
   otherwise. This is the only step that reduces risk immediately and it needs no code.
4. **P0 patch PR(s):** Step 3, 4 (removal), 6, plus the labeling of Step 2.3. Standard gates: unit and
   inventory tests, CI (7 contexts), independent staging proof on a separate Neon branch and a
   separate Admin staging host (the old `admin-staging` DNS no longer exists and must be recreated
   or replaced by a protected preview), including negative Origin/CSRF matrices.
5. **Role separation** (Step 5) can proceed in parallel with 4 because Admin is offline.
6. **Production activation of Admin** only after 3–5 are proven, and only after the compatibility
   and data-unification phase for the routes that were disabled in Step 3.3. Admin stays offline in
   Production until then. **No Production change without an explicit owner gate.**

## Risks and open questions for the owner

1. Approve Step 1 (stop the Admin container; optionally block at Caddy; protect or pause the Vercel
   project)? Admin capability lost: none, because Admin cannot currently be signed into.
2. Confirm the Vercel `learnbox-admin-preview` project is not needed for anything, so it can be
   protected or paused.
3. Are you prepared to enter three database role passwords yourself in a guided secure prompt
   (Step 5.1)? Nothing else in this plan needs a secret.
4. The Production Admin image cannot currently be tied to one commit. If the local rebuild
   comparison also fails to match, do you accept "unprovable, retire the artifact, rebuild from a
   labelled commit" as the resolution?
5. Should Step 3.3 hard-disable the legacy routes (recommended, smaller) or should each be patched
   in place? The plan recommends disabling, because the compatibility phase replaces them.

## Not done in this document

No code, Production, DNS, Caddy, Vercel, Neon or database change was made. The role matrix in Step 5
was derived from source SQL with a text scan and has not been exercised against a role; Step 5.3 is
where that happens. The Vercel Admin project's environment and auth configuration have not been
inspected.
