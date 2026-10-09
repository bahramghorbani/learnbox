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
  Shipping the script to the host is a Production change and needs its own approval.
- **The first unattended run after the 2026-10-09 repair has not happened yet.** The manual recovery
  ran through systemd (`learnbox-backup.service`, 07:01:53Z, `status=ok`), and the timer demonstrably
  fires (it started the service at 02:30:51Z the same morning), so unit, environment, DSN and
  privileges are all proven — but the scheduled path itself is unobserved until 2026-10-10 02:32 UTC.
- Off-host copies: archives live on the production host's disk only. Object-storage replication with
  versioning, and encryption at rest beyond the host's own, are not yet in place.
- Retention is count-based pruning in the script; there is no separate long-term archive tier.
