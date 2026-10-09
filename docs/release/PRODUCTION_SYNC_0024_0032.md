# Production synchronization readiness — migrations 0024-0032

**Status: repository prepared. Nothing in this document has been applied to Production.**
Production remains at ledger head `0023_learning_persistence` and application SHA `6d6aa724`.
Applying migrations and deploying an image both require separate, explicit owner approval.

Scope of this record: the database privilege and retry-safety work that had to land in the
repository _before_ `main` can be synchronized to Production, and the evidence produced for it. It
replaces the "conditional go" of the 2026-10-09 readiness audit for the database half only.

## Why the release was unsafe before this work

| #   | Defect                                                                                                                     | Consequence if 0024-0031 had been applied as they stood                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `0024`, `0025`, `0026` create six tables and grant no privileges to anyone                                                 | Admin AI generation, card media and Store listing reads/writes fail under the least-privilege roles; the backup role cannot read the new tables, so the **nightly `pg_dump` aborts the same night** — the exact failure 0023 caused for seven nights |
| 2   | No `ALTER DEFAULT PRIVILEGES` for the backup role                                                                          | Every future table repeats defect 1; the fix would have to be remembered by each author                                                                                                                                                              |
| 3   | `learnbox_app` has no `INSERT` on `user_packs`, no `INSERT`/`UPDATE` on `purchase_events`, no `SELECT` on `store_listings` | A learner purchase cannot be recorded, settled, or turned into an entitlement — the commercial path fails closed at the database                                                                                                                     |
| 4   | `0026` creates its table and index with bare `CREATE TABLE` / `CREATE INDEX`                                               | An interrupted or out-of-band apply leaves the table present and unrecorded; every retry then fails with `42P07 relation already exists` and the release can only be rescued by hand                                                                 |
| 5   | `0029` wraps itself in `BEGIN; … COMMIT;`                                                                                  | It ends the runner's transaction early, so its DDL commits while its ledger row does not — manufacturing exactly the unrecoverable state of defect 4. Proven, not assumed: a file's own `COMMIT` survives the runner's `ROLLBACK`                    |
| 6   | The backup script discarded `pg_dump`'s stderr                                                                             | Seven consecutive alerts said "pg_dump did not complete" and nothing else                                                                                                                                                                            |

## What changed in the repository

| Change                                                                                                                                                                                                                                                                                                         | File                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Grant repair for every table added by 0023-0031, verb by verb, derived from the statements the shipped code executes; `SELECT` on all tables and sequences for the backup role; `ALTER DEFAULT PRIVILEGES` for the backup role only; self-verifying (raises and aborts if any privilege is missing afterwards) | `database/migrations/0032_role_grant_repair.sql`         |
| Retry safety: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`                                                                                                                                                                                                                                       | `database/migrations/0026_store_listings.sql`            |
| Transaction control removed, so the runner keeps atomicity over DDL + ledger row                                                                                                                                                                                                                               | `database/migrations/0029_support_pack_entitlements.sql` |
| Privilege decision recorded in writing (`-- grants:` lines pointing at 0032)                                                                                                                                                                                                                                   | `0024`, `0025`, `0026`                                   |
| Gate: migrations `0024+` may not control their own transaction, must create objects conditionally, and must record a privilege decision; now part of `pnpm check` as `pnpm verify:migrations`                                                                                                                  | `scripts/validate-migrations.mjs`, `package.json`        |
| Backup diagnostics: `sanitize_error` carries the real reason into the status file and the alert, with connection strings, passwords and `npg_…` tokens removed; `umask 077`; the migrator DSN selection the host already runs is now committed                                                                 | `infrastructure/production/ops/learnbox-backup.sh`       |

### Why the grants are in 0032 and not in 0024-0026

`0024`-`0026` are recorded in no environment's ledger, so correcting their retry safety is sound.
Their _privileges_, however, belong in a migration that also runs where they are already applied —
and the migration runner stores the SHA-256 of each file's exact bytes and refuses to start on a
mismatch, so a recorded migration can never be edited to add a grant later. One new migration with
the whole privilege matrix is therefore both reviewable and universally applicable.

Checked read-only on 2026-10-09 before editing any migration file:

- Production ledger: 23 rows, head `0023_learning_persistence`, **0 rows at `0024` or above**.
- Staging branch `learnbox-staging-consolidation`: **0 rows at `0024` or above**.

No environment has recorded `0024`-`0031`, so no checksum reconciliation is required anywhere.

### Privilege model, stated

- `learnbox_app` (learner runtime) and `learnbox_admin` (Admin workspace) receive table-level,
  verb-level grants only. No `ALL`, no schema-wide write grant, and no default privileges — a future
  table is never silently readable or writable by either surface.
- `learnbox_migrator` (backup and ledger reader) receives `SELECT` on all tables and all sequences,
  plus default `SELECT` on future objects. Read-only, schema-wide, because an enumerated list is
  precisely what went stale and disabled backups.
- Deliberate omissions kept: Admin cannot delete a slide (only deactivate it), cannot write
  `packs`/`cards` (the legacy routes stay 404), cannot delete a user, and cannot write
  `purchase_events` — payment facts are not operator-editable.

## Evidence

All of it from this branch, against real PostgreSQL 17 in disposable containers. No Production
database, server, credential, environment variable or feature flag was changed.

| Proof                                                                                                                                                                  | Result                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001`-`0032` applied to an empty database by the real runner                                                                                                          | 32 applied, ledger head `0032_role_grant_repair`, 44 tables                                                                                     |
| Second run of the same set                                                                                                                                             | 0 applied (idempotent)                                                                                                                          |
| A failing migration                                                                                                                                                    | rolled back completely — no table, no ledger row, previous head intact                                                                          |
| `0026` already applied and unrecorded, then the release re-runs                                                                                                        | recovers; one `store_listings`, one index, ledger reaches `0032`                                                                                |
| The pre-fix `0026` body, same scenario                                                                                                                                 | fails `42P07` — confirms the fix is what makes recovery possible                                                                                |
| Edited file whose version is already recorded                                                                                                                          | runner refuses: `checksum mismatch: 0026_store_listings`                                                                                        |
| Restricted-role matrix as `learnbox_app` / `learnbox_admin` / `learnbox_migrator`, running the shipped statement shapes including both `ON CONFLICT DO UPDATE` upserts | 14 assertions pass, including every negative (`42501`) case                                                                                     |
| Real `pg_dump` as `learnbox_migrator`                                                                                                                                  | succeeds; ≥40 `CREATE TABLE`, `setval('public.review_event_rejections_id_seq'` present — the statement that failed for seven nights             |
| Table and sequence created _after_ 0032, read by the backup role with no new grant                                                                                     | succeeds (default privileges work)                                                                                                              |
| `0023` schema vs `0032` schema                                                                                                                                         | strictly additive: +5 tables, no column removed, no type changed, no column tightened, no new `NOT NULL` without a default on an existing table |
| **The deployed version's own seven database suites (`6d6aa724`) run against a database migrated to `0032`**                                                            | **91/91 assertions pass**                                                                                                                       |
| Backup diagnostics sanitiser                                                                                                                                           | 8 assertions: the fault text survives, DSNs/passwords/tokens are removed, output is one line ≤400 chars                                         |

Reproduce locally:

```bash
docker run -d --name lb-verify -e POSTGRES_PASSWORD=ci -p 55440:5432 postgres:17-alpine
export TEST_DATABASE_URL=postgres://postgres:ci@localhost:55440/postgres
pnpm verify:migrations
pnpm --filter @learnbox/api  exec vitest run test/migrations-apply-and-retry-db.test.ts
pnpm --filter @learnbox/website exec vitest run test/db-role-grant-matrix-db.test.ts test/deployed-schema-compat-db.test.ts
pnpm verify:production-service-boundaries
```

The deployed-version run is not a repo test (it executes another commit's code): a detached worktree
at `6d6aa724` with `0024`-`0032` copied into its `database/migrations`, then its seven `*-db` suites
run against `TEST_DATABASE_URL`. Its `cp0` suite applies every file in that directory unfiltered,
which is what puts the old code on the new schema. `apps/website/test/deployed-schema-compat-db.test.ts`
keeps the structural half of that proof green on every future change.

## Rollback feasibility

Rolling the application back after this release needs **no database change**. The schema delta is
additive, the deployed image reads a strict subset of it, and both facts are asserted. The only
one-way steps are the three `purchase_status` enum values `0027` adds and its
`purchase_events.product_id DROP NOT NULL` — neither is read by the deployed image and neither has
to be undone for it to run. Migrations stay forward-only: a rollback reverts the image, not the
schema.

## Release-readiness checklist

Verified in this branch:

- [x] Every table added by `0023`-`0031` has the privileges its shipped code needs, and the backup role can read all of them, including sequences
- [x] A future table cannot silently break the nightly backup (default privileges + a test that proves it)
- [x] `0026` is retry-safe; partial-failure recovery demonstrated end to end
- [x] `0029` no longer breaks the runner's atomicity; the rule is enforced by `pnpm verify:migrations`
- [x] `0001`-`0032` apply cleanly and idempotently to an isolated database
- [x] `pg_dump` succeeds with the backup role on the full `0032` schema
- [x] The deployed application version is compatible with the expanded schema, and rollback needs no database change
- [x] Backup failures will state a sanitised reason in the status file and the alert
- [x] No environment needs ledger reconciliation for the edited migration files

Not addressed here, still blocking commercial launch:

- [ ] `price_tomans` has no write path in production: the Admin packs route sits behind
      `legacyAdminRouteGate()` and answers 404 in a production build
- [ ] `apps/website/lib/store-purchase.ts` leaves a row `pending` on `verification_error` with no
      reconciliation path
- [ ] `BLOB_READ_WRITE_TOKEN` is not set in Production, so Admin splash upload cannot work
- [ ] Zarinpal live Merchant ID is unverified; `LEARNBOX_ZARINPAL_ENABLED=false`
- [ ] Admin is unreachable in Production (Caddy 404, no published ports, Passkey off) and its image
      is 66 commits behind `main`
- [ ] Three placeholder slides are active in Production (`banner_test1234`, `banner_summer2026`,
      `banner_promo1`)
- [ ] The first _scheduled_ nightly backup after the 2026-10-09 repair has not yet been observed
      succeeding unattended

## The next Production approval required

One decision, and it is a database decision only:

> Apply migrations `0024`-`0032` to the Production database, in order, as the owner role, after
> taking a fresh verified backup — and nothing else.

Why `0032` must be in the same approval: `0024`-`0026` create tables with no privileges. Applying
them without `0032` breaks the nightly backup that night and leaves Admin reads failing. The two are
one unit.

Suggested sequence when that approval is given (each step verifiable, none of it automatic):

1. Take a backup and confirm `backup.status=ok`, then run the restore drill against that exact
   archive.
2. Apply `0024` … `0032` with the tracked runner, as the role that owns the existing tables
   (`neondb_owner`) so `0032`'s default privileges attach to the right role:
   `DATABASE_URL=<ephemeral owner DSN> node apps/api/dist/database/run-migrations.js` from a checkout
   at the reviewed `main`. That entrypoint reads `DATABASE_URL` and nothing else, forces
   `sslmode=verify-full`, takes advisory lock `1825273952`, and wraps each migration with its ledger
   row in one transaction. Expected output: `applied 9`.
3. Confirm the ledger head is `0032_role_grant_repair`, `count(*) = 32`, and that `0032`'s
   self-verification raised nothing.
4. Re-run the read-only unreadable-objects query in `docs/operations/BACKUP_RESTORE.md`: it must
   return no rows.
5. Reproduce `pg_dump` read-only as `learnbox_migrator` (byte count only, no archive written).
6. Confirm `pg_default_acl` now holds two `neondb_owner` rows granting `SELECT` to
   `learnbox_migrator` (one for tables, one for sequences) — that is the proof the class fix landed
   on the creating role rather than on whoever happened to run the migration.
7. Confirm the learner application is healthy on the **unchanged** image — this step deploys nothing.

### Pre-flight facts, verified read-only on 2026-10-09 against Production

| Fact                                                     | Value                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ledger                                                   | 23 rows, head `0023_learning_persistence`, `0` rows at `0024`+                  |
| Recorded checksums vs the repo files at `main` `0598613` | **23/23 match**, 0 mismatches — the runner will not abort on checksum           |
| Unrecorded migration files                               | exactly 9: `0024` … `0032` — so the run applies 9 and nothing else              |
| Object ownership in `public`                             | **all 40 tables and the 1 sequence owned by `neondb_owner`**                    |
| `pg_default_acl`                                         | only Neon's own `cloud_admin` entries; no `neondb_owner` default privileges yet |
| Objects unreadable by `learnbox_migrator`                | 0 (the 2026-10-09 sequence grant holds)                                         |
| Server                                                   | PostgreSQL 17.11                                                                |

The owner DSN for the apply is minted on demand from the Neon control plane
(`neon connection-string main --role-name neondb_owner --database-name neondb`), held only in a shell
variable for the lifetime of the command, passed to containers **by variable name** so it never
appears in `argv` or a shell history, and never written to the repository or the production host. It
is not a new credential and not rotated by this process: what is temporary is our possession of it.

### Stop conditions — abort and report, do not improvise

| Signal                                                                 | Meaning                                                                                  | Action                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `backup.status` is not `ok`, or the restore drill fails, before step 2 | no verified restore point                                                                | **do not apply anything**                                                                                           |
| `Applied migration checksum mismatch: <version>`                       | a recorded file's bytes changed since it was applied                                     | abort; nothing has been applied in this run; reconcile the file with the ledger first                               |
| Any migration raises                                                   | that migration and its ledger row rolled back together; the head is the previous version | stop, capture the SQLSTATE and message, re-run only after the cause is understood — the set is retry-safe by design |
| `applied` is not `9`                                                   | the ledger or the migration directory is not what this release reviewed                  | stop and diff before touching anything else                                                                         |
| `0032` raises `missing privileges after repair: …`                     | a grant did not land                                                                     | stop; the transaction rolled back, so no partial privilege state exists                                             |
| Step 4 returns any row                                                 | the backup role still cannot read something                                              | stop; the next nightly `pg_dump` would fail                                                                         |
| Learner health is not 200 after step 7                                 | unexpected, since no code changed                                                        | stop and roll the image back; do not apply anything further                                                         |

### Rollback limitations

- **There are no down-migrations.** Nothing in `database/migrations/` reverses a step; rollback means
  reverting the _image_, not the schema. That is sound here only because the delta is additive and
  the deployed version is proven against the expanded schema.
- **Ledger rows are not removed.** Re-applying a migration after deleting its row would re-run DDL
  against objects that already exist; `IF NOT EXISTS` makes that survivable from `0024` onwards, but
  it is not a supported recovery path.
- **Two steps are one-way**: the three `purchase_status` enum values `0027` adds (PostgreSQL cannot
  drop an enum value) and its `purchase_events.product_id DROP NOT NULL` (re-tightening requires no
  NULL rows). Neither is read by the deployed image.
- **Restoring the pre-migration backup is the only true schema rollback**, and it costs every write
  made after the archive was taken — it is a last resort, not a step in this plan.

### Known privilege debt, deliberately out of scope here

`learnbox_migrator` currently holds `INSERT` on 38 of 40 Production tables and `CREATE` on schema
`public`, so the credential the nightly backup uses on the host is far broader than a backup needs.
It is pre-existing, `0032` does not widen it, and narrowing it is a separate change: migrations are
applied as `neondb_owner` (all 40 tables prove it), so those write grants are vestigial. Revoking
them, or splitting a read-only `learnbox_backup` role, belongs in its own PR with its own restore
drill.

Deploying the new application image, enabling any feature flag, and activating payment remain
separate approvals and are **not** covered by the one above.
