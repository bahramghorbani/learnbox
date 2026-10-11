# Backup and restore

What actually runs in Production today, what its failure modes are, and how to tell a real failure
from a false alarm. Nothing in this document applies a change: every command here is read-only or
runs against a throwaway container.

## What runs

Two systemd timers on the production host, both enabled:

| Unit                           | Schedule           | What it does                                                                                                                                                                                       |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `learnbox-backup.timer`        | nightly ~02:32 UTC | `infrastructure/production/ops/learnbox-backup.sh` — `pg_dump` of the whole database, gzipped to `/home/ubuntu/learnbox/backups/learnbox-<UTC timestamp>.sql.gz`, mode 600, with retention pruning |
| `learnbox-restore-drill.timer` | weekly (Monday)    | `learnbox-restore-drill.sh` — restores the newest archive into a disposable PostgreSQL container, counts tables and rows, checks for orphaned rows, then destroys the container                    |

Each writes a one-line status file that is the source of truth for "did it work":

- `/home/ubuntu/learnbox/ops/state/backup.status`
- `/home/ubuntu/learnbox/ops/state/restore-drill.status`

A failure sends a Telegram alert. **Success sends nothing**, and there is no "recovered" alert — so
after fixing a failure, confirm `backup.status` says `status=ok`, do not wait for a message.

The restore drill never touches Production: it restores into a scratch container
(`target=disposable-container-only`, `production_touched=no` in its status line) and removes it.

## Which database role, and why it matters

The backup runs as **`learnbox_migrator`**, not as the database owner (LB-B30 least privilege). The
script reads `LEARNBOX_MIGRATOR_DATABASE_URL` from the mode-600
`/home/ubuntu/learnbox/secrets/db-roles.env`, falling back to the legacy `DATABASE_URL` in the app
env file. The credential is passed to the `pg_dump` container by environment variable, never as a
command argument, because process arguments are world-readable through `/proc`.

This means a backup is only as complete as that role's read privileges, and a dump aborts entirely
if any single object is unreadable. Two privileges are required, and the second is the one that is
easy to forget:

1. `SELECT` on every table.
2. **`SELECT` on every sequence.** `pg_dump` reads each sequence with
   `SELECT last_value, is_called FROM <sequence>`. The `USAGE` privilege — which is what a writing
   application role needs in order to call `nextval()` — is **not** sufficient, and granting only
   `USAGE` is what caused the 2026-10 outage below.

Since migration `0032_role_grant_repair.sql` this is structural rather than a thing to remember:
`learnbox_migrator` holds `SELECT` on all tables and all sequences, and
`ALTER DEFAULT PRIVILEGES` grants it `SELECT` on anything the migrating role creates from then on.
Default privileges are attached to the **creating role** (`neondb_owner` in Production), so if the
role that applies migrations ever changes, the statement in 0032 must be re-run as the new role.
`apps/website/test/db-role-grant-matrix-db.test.ts` asserts that a table and a sequence created
after 0032 are readable by the backup role with no new grant, so a regression fails CI.

## Reading a failure

The status file carries a sanitised reason, and so does the alert:

```
status=failed at=2026-10-08T02:32:57Z reason=pg_dump did not complete: pg_dump: error: query failed: ERROR:  permission denied for sequence review_event_rejections_id_seq
```

Sanitisation (`sanitize_error` in `learnbox-backup.sh`) removes connection strings,
`password=`/`PGPASSWORD=` values and Neon `npg_…` tokens, collapses the text to one line and bounds
it to 400 characters. Object names are deliberately preserved — they are what identifies the fault.
`infrastructure/production/ops/tests/backup-diagnostics.test.mjs` asserts both halves: the
credential shapes are removed and the diagnostic survives.

Reproduce a suspected privilege failure read-only, as the backup role, without writing an archive
or touching `backup.status`:

```bash
# on the production host
URL=$(sudo grep -E '^LEARNBOX_MIGRATOR_DATABASE_URL=' /home/ubuntu/learnbox/secrets/db-roles.env | cut -d= -f2-)
docker run --rm -i -e PGURL="$URL" postgres:17-alpine \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$PGURL" | wc -c'
```

Never run `systemctl start learnbox-backup.service` to "see if it works" while a failure is
unexplained: it overwrites `backup.status` and fires another alert without adding any diagnostic
information. Reproduce with the command above first.

Check what the role can and cannot read:

```sql
-- unreadable tables and sequences for the backup role
SELECT c.relkind, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
   AND NOT CASE c.relkind
             WHEN 'S' THEN has_sequence_privilege('learnbox_migrator', c.oid, 'SELECT')
             ELSE has_table_privilege('learnbox_migrator', c.oid, 'SELECT')
           END;
```

## Verifying an archive

```bash
# on the production host — integrity and contents, no restore into Production
gzip -t /home/ubuntu/learnbox/backups/learnbox-<stamp>.sql.gz
sha256sum /home/ubuntu/learnbox/backups/learnbox-<stamp>.sql.gz
zcat /home/ubuntu/learnbox/backups/learnbox-<stamp>.sql.gz | grep -c '^CREATE TABLE '

# full isolated restore drill against a specific archive
/home/ubuntu/learnbox/ops/learnbox-restore-drill.sh learnbox-<stamp>.sql.gz
```

The drill's status line reports `archive_sha256`, which must equal the checksum of the archive you
intended to test — that is how you know the drill did not silently pick a different file.

## Recovering the whole database

> The restore drill above proves the **data** comes back. It does not prove the database is
> **usable**, and on its own it is not a recovery procedure.

The nightly archive is a plain `pg_dump` of one database, so it contains the schema, the data and
the migration ledger — and **no roles and no privileges at all**:

```bash
gzip -dc /home/ubuntu/learnbox/backups/learnbox-<stamp>.sql.gz | grep -c '^GRANT'      # 0
gzip -dc /home/ubuntu/learnbox/backups/learnbox-<stamp>.sql.gz | grep -c 'CREATE ROLE' # 0
```

Restore it into a fresh cluster and you get a database where `learnbox_app` and `learnbox_admin` do
not exist and no ACL is set, so the learner and the Admin workspace both fail closed on their first
query. Role and ACL state survives only a Neon **branch or PITR** restore, and the Production plan
retains `history_retention_seconds = 21600` — **six hours**. Past that window the dump is the only
artifact, and the privilege half of recovery has to be rebuilt from this repository.

### Which artifact to use

| Situation                              | Use                                  | Recovers roles and ACLs  |
| -------------------------------------- | ------------------------------------ | ------------------------ |
| Fault is less than 6 hours old         | Neon branch restore / PITR           | yes — nothing to rebuild |
| Fault is older, or the project is gone | nightly archive + the sequence below | no — rebuild them        |

Prefer the branch restore whenever the window allows: it returns the cluster to a known state
including roles, and needs none of the steps below.

### The sequence

Roles and privileges are **not** redefined here. They live in two places that already exist, and
recovery replays them:

1. `infrastructure/database/db-roles-p0.sql` — creates `learnbox_app`, `learnbox_admin` and
   `learnbox_migrator` (`NOLOGIN NOINHERIT`, no password) and applies the base revoke-then-grant.
2. The **role-guarded grant blocks** of migrations `0023`, `0028`, `0029`, `0030`, `0031`, `0032`,
   `0033` and `0034`. Each wraps its `GRANT`s in `IF EXISTS (SELECT FROM pg_roles ...)`, so on a
   database whose roles did not yet exist they were silently no-ops. Replaying them once the roles
   exist is what applies those grants, and every one is idempotent.

```bash
# 1. restore schema + data + ledger into the target
gzip -dc learnbox-<stamp>.sql.gz | psql "$TARGET_OWNER_DSN" -v ON_ERROR_STOP=1

# 2. create the three roles and the base grants
psql "$TARGET_OWNER_DSN" -1 -v ON_ERROR_STOP=1 -f infrastructure/database/db-roles-p0.sql

# 3. replay the grant-bearing migrations
for v in 0023 0028 0029 0030 0031 0032 0033 0034; do
  psql "$TARGET_OWNER_DSN" -1 -v ON_ERROR_STOP=1 -f database/migrations/${v}_*.sql
done

# 4. set passwords (prompted, never on the command line and never in a file)
psql "$TARGET_OWNER_DSN" -c "\password learnbox_app"   # repeat for learnbox_admin, learnbox_migrator
```

`-1` is not optional. The migration runner wraps each file in `BEGIN`/`COMMIT`
(`apps/api/src/database/migration-runner.ts`), and `0017` uses
`CREATE TEMP TABLE ... ON COMMIT DROP`; without `-1`, psql autocommits each statement and the temp
table disappears between them.

Steps 2 and 3 run as the **owner** of the restored database, not as `learnbox_migrator`. In
Production `learnbox_migrator` is deliberately a member of no role (`MEMBEROF` is empty), so it can
read everything for the backup but cannot `GRANT`.

### Proving a recovery before trusting it

Do not hand-verify this. `learnbox-recovery-drill.sh` runs the whole sequence against a disposable
container and asserts the outcome:

```bash
# on the production host, from a checkout of the release commit
infrastructure/production/ops/learnbox-recovery-drill.sh                     # newest archive
infrastructure/production/ops/learnbox-recovery-drill.sh /path/to/archive.gz # a specific one
```

It restores the archive, applies the role model, replays the grant migrations **twice** to prove
idempotency, sets throwaway random passwords, connects as each of the three roles, and then compares
the resulting effective privileges against `infrastructure/database/role-privilege-baseline.txt` —
the privilege set captured read-only from Production at ledger head `0034`.

For `learnbox_app` and `learnbox_admin` the comparison is **equality in both directions**: a missing
line means recovery left the product broken, and an extra line means recovery granted more than
Production had. Elevation is checked directly as well — no superuser, no `CREATE` on `public`, no
table ownership, no role membership, no `TRUNCATE`/`REFERENCES`/`TRIGGER`, and the specific denials
the product depends on (Admin cannot `DELETE` content, cannot change `packs.price_tomans`, cannot
write `review_events`, `card_schedules` or existing `audit_logs`). For `learnbox_migrator` the
assertion is total `SELECT` coverage over every table **and every sequence** — the exact gap that
caused the seven-night outage below.

The drill writes `/home/ubuntu/learnbox/ops/state/recovery-drill.status` with
`target=disposable-container-only` and `production_touched=no`. It never accepts a remote target and
issues no statement against Production in any code path.

### Refreshing the baseline

`role-privilege-baseline.txt` is data, not a second copy of the grant model, and it has to be
re-captured after any Production privilege change:

```bash
infrastructure/production/ops/learnbox-recovery-drill.sh --capture "$LEARNBOX_MIGRATOR_DATABASE_URL" \
  > /tmp/baseline-lines.txt   # read-only: a read-only transaction of catalogue lookups, nothing else
```

Keep the file's header and replace the lines below it. If the drill reports a difference after a
migration, that is the intended signal: a migration added a grant without the role model following,
and the fix belongs in the migration or in `db-roles-p0.sql`, not in the baseline.

## Incident record: seven nights without a backup (2026-10-03 .. 2026-10-09)

Migration `0023_learning_persistence` created `review_event_rejections` with a `bigserial` key and
granted the learner role what it needed (`SELECT, INSERT` on the table, `USAGE` on the sequence). It
granted the backup role nothing. `pg_dump` then failed on
`SELECT last_value, is_called FROM public.review_event_rejections_id_seq` and, because one
unreadable object aborts the whole dump, Production had no new archive for seven nights. The alert
said only "pg_dump did not complete" — the script captured `pg_dump`'s stderr into a variable and
then discarded it — so seven alerts carried no usable information.

Three separate defects, all now addressed:

| Defect               | Fix                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing privilege    | `GRANT SELECT ON SEQUENCE public.review_event_rejections_id_seq TO learnbox_migrator` (applied to Production 2026-10-09 under owner authorization); `0032_role_grant_repair.sql` makes it structural for every environment and for future objects |
| Silent diagnostics   | `sanitize_error` in `learnbox-backup.sh`, carried into the status file and the alert                                                                                                                                                              |
| No test could see it | `apps/website/test/db-role-grant-matrix-db.test.ts` connects as the real restricted roles and runs a real `pg_dump`; every other database test connects as the owner, where a missing GRANT is invisible                                          |

Recovery evidence (2026-10-09): `backup.status=ok`, archive `learnbox-20261009T070153Z.sql.gz`
(399,487 bytes, sha256 `d8da6bd3…`, 40 tables), restore drill `status=ok` with 40 tables restored
and `orphaned_rows=0`, learner application untouched (`app_health=200`, no restart), and no archive
deleted. The first _scheduled_ (unattended) run after the repair is the remaining confirmation.

## Still open

- **The host still runs the pre-fix script.** `sanitize_error` and the migrator-DSN preference live in
  the repository as of `0598613`; the copy under `/home/ubuntu/learnbox/ops/` has not been updated,
  which is why the 2026-10-09 02:30 failure still reads `pg_dump did not complete` with no reason.
  Shipping the script to the host is a Production change and needs its own approval. Verified still
  true on 2026-10-11: the host copy contains no `sanitize_error` and no
  `LEARNBOX_MIGRATOR_DATABASE_URL` reference. `learnbox-recovery-drill.sh` is in the same position —
  it exists in the repository and has been proven against a Production archive from a checkout, but
  it is not installed on the host and its timer is not registered.
- **Scheduled, unattended backups are now proven.** Closed 2026-10-11. `learnbox-backup.timer` fired
  the service unattended on 2026-10-10 at 02:34:04Z and 2026-10-11 at 02:33:00Z, both reaching
  `Finished learnbox-backup.service`, and `backup.status` reads `status=ok` with
  `file=learnbox-20261011T023257Z.sql.gz`, `tables=45`, `retained=16`, `pruned=0`. That archive
  restores clean and recovers to the exact Production privilege set (see the recovery drill above).
- **The weekly restore drill has not run since 2026-10-05.** `restore-drill.status` is dated
  2026-10-09T20:36:17Z, which was a manual run against `learnbox-20261009T203501Z.sql.gz`
  (`restored_tables=45`, `orphaned_rows=0`). The timer's own last firing was 2026-10-05 03:35:01Z,
  with the next due 2026-10-12 03:31:57Z. Nothing is broken — the drill has simply not been observed
  on its schedule since the privilege repair, and its recorded `schema_migrations=32` predates the
  current ledger head of 34.
- Off-host copies: archives live on the production host's disk only. Object-storage replication with
  versioning, and encryption at rest beyond the host's own, are not yet in place. This is the single
  largest remaining recovery risk: a host loss past the six-hour Neon window loses both the archives
  and the PITR path at once.
- Retention is count-based pruning in the script; there is no separate long-term archive tier.
