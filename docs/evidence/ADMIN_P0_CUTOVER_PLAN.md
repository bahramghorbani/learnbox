# Admin P0 (LB-B30) Production cutover plan: DRAFT for owner approval

Status: **not executed, not approved in this form.** Written from staging evidence
(`ADMIN_P0_STAGING_EVIDENCE.md`). Production facts below marked VERIFY were not re-read in this
session and must be captured in the pre-cutover checkpoint before any change.

## Preconditions (all must be true, else stop)

1. Owner accepts source of record **`f44092a437c5c3105fee0327dce9c4aab673b0fb`** (not `5ddc5c8`;
   see evidence doc for why) and the branch is merged by PR to `main`, or the owner explicitly approves
   building from the pushed branch commit.
2. Admin image is built from `git archive f44092a…` with `--build-arg ADMIN_SOURCE_SHA=f44092a…`;
   label, image ID, running container and runtime env are compared and recorded.
3. The Caddy 404 block for the admin hostnames is committed to Git (it is VPS-local today).
4. Learner stays on v1.2.1 (`4ade0a885fa93a418db8cde94b81a206bcd80860`, image `sha256:5370578d187c`).
   This plan does not rebuild or redeploy the learner image; it changes its **DSN/env only**, so the
   "no learner change" owner rule needs an explicit exception for the credential switch.

## Step 0: recovery checkpoint (before any change)

- Fresh `pg_dump` (custom format) of Production; record size + sha256; restore-test it into a
  throwaway Postgres and compare row counts for every table. Keep the existing
  `learnbox-20260930T085754Z.sql.gz`.
- Copy of learner and Admin env files, systemd/compose unit files, Caddyfile → timestamped evidence
  dir, mode 600. Record file hashes only in the report, never values.
- Record: learner image ID + container ID, Admin image `d4f39bfc` tag, rollback tags
  `learnbox-app:rollback-pre-v121-358cd50c`, current `docker ps`, current role list and `\du`.
- Baseline row counts + max ids for `users`, `review_events`, `card_schedules`, `mobile_learner_sessions`,
  `revoked_sessions`, `audit_logs`, `account_deletion_events`, `admin_*`.
- Restore drill date 2026-10-05 stays untouched.

## Step 1: create roles on Production (additive, no data change)

- Apply `infrastructure/database/db-roles-p0.sql` as `neondb_owner` inside one transaction per section.
  It creates/grants only; it drops and truncates nothing and does not touch rows.
- Passwords for `learnbox_app` and `learnbox_admin` (and `learnbox_migrator`) are entered by the
  owner through the secure credential flow only. Never in chat, shell history, argv, or logs.
- Run `db-roles-p0-proof.sql` as `neondb_owner`. **Gate:** 0 failures. The live probes are
  zero-row statements inside a rolled-back transaction, so they mutate nothing.
- Existing `neondb_owner` DSN stays valid and unchanged, so nothing is broken yet.

## Step 2: cut over learner to `learnbox_app`

- Change `DATABASE_URL` in **both** the `.env` and the systemd/unit environment (a known Production
  pitfall: it must be in both), restart the learner, wait for healthy.
- Gates: `/api/health` ok (may say `degraded` on the first call), anonymous protected media 401,
  OTP/login path, session read, logout + revocation, `/api/learner/*` profile/progress/review reads,
  a review write with a **synthetic** account only (Production test user `b4efb0a4`; owner
  `451b0433` is never mutated), mutation guard rejects (foreign Origin), no `permission denied` in logs.
- Any failure: revert `DATABASE_URL` to the checkpointed value in both places, restart. Stop.

## Step 3: deploy Admin

- Start the provenance-labelled Admin image with `learnbox_admin` DSN. No
  legacy flag is needed: `legacyAdminRoutesEnabled` requires `NODE_ENV !== 'production'`, so the legacy
  routes are closed in any production build regardless of `LEARNBOX_ADMIN_LEGACY_ROUTES_ENABLED`.
- Keep the Caddy 404 in place until Admin gates pass **from the VPS loopback**, then expose.
- Gates: repeat `anonymous-http-matrix.py` (93) against the deployed instance, plus
  identity chain git → label → image ID → container → runtime env. Authenticated matrix is
  **not** run in Production (it seeds a synthetic owner; disposable DB only). Instead verify the
  real owner passkey login path manually with the owner, and that no `admin_*` rows changed beyond the
  owner's own session.
- Sign-in stays disabled unless the owner decides otherwise.

## Step 4: post-cutover verification and proof against Production roles

- Re-run `db-roles-p0-proof.sql` against Production. Compare Step 0 baseline row counts: only
  expected deltas (sessions/logins from the checks themselves).
- Scan learner and Admin logs for errors since cutover.

## Rollback (documented, no ad-hoc fixes)

- Learner: restore checkpointed DSN in env + unit, restart. Image untouched throughout.
- Admin: stop container, restore Caddy 404, keep the image for evidence.
- Roles may stay (they hold no data and grant nothing to anyone using the old DSN).
- Data restore from the checkpoint dump is the last resort and needs owner approval.

## Known limits carried into this plan

- Role model proven on local Postgres 17, not Neon. Step 1's proof is the first Neon evidence.
- `add-passkey/options` inline SQL, and Admin/learner shared-backend unification, are deferred (LB-B31+).
- Sessions in the authenticated matrix were DB-seeded; the WebAuthn ceremony is unproven outside Production.
