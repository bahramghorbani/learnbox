# Production execution record — database migrations 0024 → 0032

Executed 2026-10-09 under owner authorization limited to the database migration. No application or
Admin image was deployed, no feature flag changed, no payment path activated, no Admin access
changed, no sample banner touched, no unrelated Production configuration modified. The application
container was not restarted (`RestartCount=0`, started 2026-10-04T05:59:31Z, uptime unbroken across
the migration).

Repository state at execution: `main` = `0418d10`, working tree clean. Runbook:
`docs/release/PRODUCTION_SYNC_0024_0032.md`.

## 1 — Database identity, head and checksum integrity (before)

| Check                                             | Result                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Identity                                          | `neondb` / `neondb_owner`, PostgreSQL 17.11                    |
| Ledger                                            | 23 rows, head `0023_learning_persistence`, `0` rows at `0024`+ |
| Recorded checksums vs the repo files at `0418d10` | **23 recorded, 23 matched, 0 mismatched**                      |
| Unrecorded migration files                        | exactly 9: `0024` … `0032`                                     |

## 2 — Learner data baseline (captured 2026-10-09T13:12:35Z)

Counts: `users=2`, `review_events=137`, `card_schedules=31`, `learner_daily_plans=6`,
`review_event_rejections=0`, `user_packs=0`, `mobile_learner_sessions=0`, `packs=1`, `cards=35`,
`banners=3` (3 active).

Per account: `451b0433` 58 events / 16 schedules / 0 plans — byte-identical to the pinned
pre-Functional-Validation control baseline. `b4efb0a4` 79 events / 15 schedules / 6 plans.

Value digests: `md5_review_events=ba6d7763`, `md5_card_schedules=1b63f32b`,
`md5_learner_daily_plans=a7782d68`, `md5_users=1da753e1`, `md5_banners=ca90bca2`.
Physical row digests: `xmin_users=b5fe067d`, `xmin_review_events=4bdda75e`,
`xmin_card_schedules=ffc662e3`, `xmin_learner_daily_plans=924f16c6`, `xmin_banners=51cb0a20`.
Sequence `review_event_rejections_id_seq`: `last_value=1 is_called=false`.

The `xmin` digests are the part that matters: a value digest can be reproduced by a delete and
re-insert, a transaction id cannot.

## 3 — Fresh backup (through the real scheduled path)

Started with `systemctl start learnbox-backup.service`, i.e. the same unit the timer fires, not a
hand-run command.

```
status=ok  at=2026-10-09T13:15:51Z  file=learnbox-20261009T131548Z.sql.gz
bytes=399486  tables=40
sha256=9ea068296afe055d18fa714caeb1de9c487f392a823d735b9e4a1fa78361a4a4
retained=11  retention_days=30  pruned=0
```

## 4 — Isolated restore drill on that exact archive

```
status=ok  at=2026-10-09T13:16:39Z  archive=learnbox-20261009T131548Z.sql.gz
archive_sha256=9ea068296afe055d18fa714caeb1de9c487f392a823d735b9e4a1fa78361a4a4
restored_tables=40  users=2  cards=35  review_events=137  purchase_events=0
schema_migrations=23  orphaned_rows=0
target=disposable-container-only  production_touched=no
```

The archive's `sha256` on disk equals the one the backup recorded, and the restored counts equal the
live baseline. The drill restores into a disposable container with no published ports, never reads
`DATABASE_URL`, and left no container behind.

## 5 — Stop conditions

None triggered. Backup and restore both verified before anything was applied.

## 6 — Apply

```
DATABASE_URL=<ephemeral owner DSN> node apps/api/dist/database/run-migrations.js
→ Database migrations complete; applied 9.
```

Start 2026-10-09T13:17:46Z, end 13:18:04Z (18s), exit 0. The entrypoint resolved
`database/migrations/` to the repository directory holding exactly 32 files (`0001_initial.sql` …
`0032_role_grant_repair.sql`), forced `sslmode=verify-full`, took advisory lock `1825273952`, and
committed each migration together with its ledger row.

The owner DSN was minted on demand from the Neon control plane, lived only in the environment of
that single process, and was never written to the repository, the host, or any log.

## 7 — Ledger after

`32` rows, head `0032_role_grant_repair`, exactly `9` rows at `0024`+. All **9 new ledger checksums
match the repository files** at `0418d10` (9 matched, 0 mismatched), so the applied bytes are the
reviewed bytes.

## 8 — Backup role readability

`unreadable_for_migrator = 0` across all 46 objects in `public` (45 tables + 1 sequence) — the
condition that broke seven consecutive nightly backups cannot recur for these tables.

## 9 — Default privileges and a real dump through the restricted role

`pg_default_acl` now contains the two intended rows, and they belong to the role that actually
creates objects:

```
neondb_owner  r  {learnbox_migrator=r/neondb_owner}
neondb_owner  S  {learnbox_migrator=r/neondb_owner}
```

Every table and sequence in `public` is owned by `neondb_owner`, so those defaults cover whatever the
next migration creates. `pg_dump` run as `learnbox_migrator` with the host's own credential produced
**878,624 bytes with empty stderr**.

Grants in effect for the new tables: `learnbox_app` — `store_listings` read-only, `user_packs`
SELECT/INSERT/DELETE, `purchase_events` full DML; `learnbox_admin` — the five new tables plus
`banners` INSERT/UPDATE (granted by `0031`). Every one traces to a write site in shipped code.

## 10 — Data integrity and application health after

All 11 counts unchanged. All five `xmin` digests unchanged, re-checked explicitly:
`xmin_users=b5fe067d` and `xmin_banners=51cb0a20` are identical to the baseline, so **no row was
updated, deleted or re-inserted**.

Two value digests did change, and the reason is the schema widening rather than any data change:

- `0028` added `users.status text NOT NULL DEFAULT 'active'`. All rows read `active`; nothing was
  back-filled with a non-default value.
- `0031` added `banners.image_data bytea` (default NULL). `image_data IS NOT NULL` is **0 of 3**
  rows, so no bytes were written and the three sample banners are untouched.

`md5(row::text)` includes every column, so adding a column necessarily changes it. PostgreSQL adds a
column with a constant default without rewriting rows, and the unchanged `xmin` digests prove that is
what happened here.

Application: `app_health=200`, learner root `200`, image unchanged
`sha256:953b7b6240c266ec22d1ed6bc4dad5998ae679cd907276d39c232676f7709d24`,
`APP_SOURCE_SHA=6d6aa72489dd895299f8a1f4bedb2c205e32e31b`, `RestartCount=0`. Flags unchanged
(`LEARNBOX_BINARY_REVIEW=true`, `LEARNBOX_DYNAMIC_SPLASH_ENABLED=true`; no Zarinpal, passkey,
Scheduler V2 or blob-token variable present).

## 11 — Schema version

Production schema head is now **`0032_role_grant_repair`**, 32 ledger entries, 45 tables.

## Remaining blockers, unchanged by this migration

The schema is now ahead of the deployed image, which is intentional and proven safe (the delta is
additive and the deployed version's own suites pass against it). Still open, each needing its own
approval:

- `price_tomans` has no write path: the Admin packs route sits behind `legacyAdminRouteGate()` and
  returns 404 in the Production build.
- `store-purchase.ts` leaves a row `pending` on `verification_error` with no reconciliation path.
- `BLOB_READ_WRITE_TOKEN` is not set, so Admin splash upload cannot work.
- Zarinpal live Merchant ID unverified; `LEARNBOX_ZARINPAL_ENABLED` is absent.
- Admin is unreachable in Production (404-contained, passkey off) on an image 66+ commits behind.
- Three sample banners remain active, deliberately untouched.
- The application image is 31+ commits behind `main`; deploying it is a separate authorization.
- The host still runs the pre-fix backup script, so sanitised failure diagnostics are repo-only.
- `learnbox_migrator` still holds `INSERT` on 38 of 40 pre-existing tables and `CREATE` on `public`
  — pre-existing, vestigial now that migrations run as the owner, and its own PR.
- The first unattended nightly backup after the 2026-10-09 repair is still ahead of us
  (2026-10-10 02:32 UTC). Today's run proves the unit, and the timer demonstrably fires, but the
  scheduled execution itself remains unobserved.
