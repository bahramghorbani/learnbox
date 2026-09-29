# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**No feature work is active.** v1.2.0 is released and closed (below). The only queued item is the
security-hardening patch `LB-B29` — **recorded, scoped, not started**; implementation needs the
owner's go-ahead. Deferred but not cancelled: `LB-B19` (reminders), `LB-B28b` (photo upload),
`LB-B17` (Store).

## v1.2.0 Option B — released

Shipped to Production on 2026-09-29. `main` is documentation-only ahead of the shipped commit;
that is not application drift and must never trigger a deploy.

|                    |                                                                            |
| ------------------ | -------------------------------------------------------------------------- |
| Application commit | `468f05463df94cf47e088960640c2b6b95f0e370`                                 |
| Tag                | `v1.2.0` (annotated, fixed to the commit above; **not** on the `main` tip) |
| GitHub Release     | `v1.2.0` (same convention as `v1.0.0`)                                     |
| Image digest       | `sha256:358cd50c05b3df7f90691af6e5c84d2b14f046e40cf29d87d57f36c68225d174`  |
| Database           | `0019` ledger row back-filled, then `0020`–`0022` applied, forward-only    |

Provenance chain, verified live after the deploy: tag `v1.2.0` → commit `468f054` (`git archive` of
the tag is byte-identical to that of the SHA and to the tarball built on the host) → OCI
`org.opencontainers.image.revision` label → the image the running container uses → runtime
`APP_SOURCE_SHA`. All agree; the container is healthy with 0 restarts.

Delivered: LB-B11 server/DB-authoritative progress and streak, LB-B26 persistent session (30-day
absolute, 14-day inactivity, sliding renewal, server-side revocation), LB-B27 sign out, LB-B23 audio
button no longer flips the card, LB-B22 login/OTP redesign, LB-B24 + LB-B25 layout and Bobo
placement, LB-B28a optional profile fields and prebuilt avatars.

Database cutover: a fresh backup (`learnbox-20260929T200453Z.sql.gz`) and a successful restore into a
disposable container came before the first write. The `0019` back-fill ran as one transaction with
every precondition asserted (file hash, exact ledger `0001`–`0018`, expected columns/enum labels/
indexes), then the runner applied exactly three migrations; the ledger has 22 rows. No pre-existing
table changed a row count; the 12 new tables are empty. The `account_deletion_events` audit row is
untouched.

Production verification: a real-OTP phone login on iOS Safari (greeting, avatar, LTR phone, profile
save reaching the database), plus a server-side session for a second account: review, idempotent
replay, foreign-Origin `403`, no-Origin `403`, review-owner mismatch `403`, protected media
`200 private, no-store` for image/word audio/sentence audio and `401` without a session, logout `204`
and revocation (the same token then gets `401` on session, today, profile, media and review), and the
«یادگیرنده عزیز» fallback. The owner's learning data was byte-identical before and after.

Left behind by verification: one `remembered` review for the second (test) account on
`start-a1-apfel` and two `revoked_sessions` rows for it. Nothing else.

Rollback assets, all retained: image `learnbox-app:rollback-pre-v120-a985b81d` (the v1.1.0 image),
`.env.bak-pre-v120-deploy`, and the backup above (sha256 `31581bf3…e597b1`). `0020`–`0022` are
additive, so the v1.1.0 image runs against the new schema.

## v1.1.0 Option B — released

Shipped to Production on 2026-09-28 and merged to `main` in PR #303.

|                    |                                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| Application commit | `46cc45e24bfd54fc1f3f23dd0429c2d4ebb3744f`                                |
| Tag                | `v1.1.0` (annotated, fixed to the commit above)                           |
| Image digest       | `sha256:a985b81d463b15694282355e7b87a0a91a885fdd470bdf12b45e31caee76ef7c` |
| Database           | migration `0019` applied, forward-only                                    |

The tag, the OCI `org.opencontainers.image.revision` label, the runtime `APP_SOURCE_SHA` and the deployed source agree on one commit. Provenance was previously unverifiable: `APP_VERSION` was passed as a build argument the Dockerfile never declared, so it was silently discarded and images carried no labels.

Delivered: LB-B01 support channel, LB-B02 operations timers and `/api/health`, LB-B03 learner profile with one canonical phone mask, LB-B04 account deletion, LB-B08 truthful privacy notice, LB-B09 media manifest lifecycle model, LB-B21 documentation reconciliation. Untouched and still out of scope: LB-B05, LB-B06, the LB-B10 residual, LB-B11–LB-B20, Android, payments, premium packs, iOS, notifications, media migration, audio regeneration and Git history cleanup.

Migration `0019` added `account_deletion_events` and `purchase_ownership_claims` (34 → 36 tables) and changed no row of existing data: users 2, review events 62, card schedules 31, identical before and after.

### Account deletion — Production-proven

Proven end-to-end in Production with a dedicated disposable account. No real account was used and no real learner data was touched.

Full UI/API/DB path returns 200; a mismatched phone confirmation is rejected with 403; the session cookie is expired on success and the prior cookie is then rejected with 401; learner rows are removed; the audit record is retained with counters matching exactly what was seeded and with no phone number, only a non-reversible `subject_hash`; the same phone can register again into a clean account; a recreated account resolves to the same `subject_hash`, so purchase reclaim remains possible; a duplicate `request_id` is rejected by the live unique index.

One privacy-minimized audit row remains from that exercise. It contains no phone number and no learner content. It is retained deliberately as legitimate deletion audit evidence and is **not** a permanent exception: it is subject to the same retention policy as every other deletion audit record. Its `request_id` is the literal `e2e-del-1`, which no learner row can collide with because the client generates `crypto.randomUUID()` values — so release provenance is already recorded non-sensitively in the existing schema, and no schema change was made for it.

## Pending evidence

**The scheduled backup has now genuinely executed.** The first real timer-driven run started
`2026-09-29 02:31:01 UTC` and finished two seconds later, producing
`learnbox-20260929T023101Z.sql.gz`: 36 tables, 36 data blocks, a clean `gzip -t`, an intact
`PostgreSQL database dump complete` marker and 812 KB uncompressed. The unit reports
`ExecMainStatus=0` with `NRestarts=0`, and the script logged `retained=3 pruned=0` against a
30-day retention window. Recurring backup is therefore proven by execution, not by configuration.

**The scheduled restore drill has never executed.** `ExecMainStartTimestamp` is empty for
`learnbox-restore-drill.service`; the first real run is due `2026-10-05 03:36 UTC`. It is proven
only by a manual drill (0 orphans), which shows the procedure works but not that the schedule
fires. Until that run happens, recurring _recovery_ remains unproven even though recurring backup
no longer is.

An active timer is not a successful execution, and neither is a green `Result`: systemd reports
`Result=success` and `ExecMainStatus=0` for a unit that has never started. Only a non-empty
`ExecMainStartTimestamp` distinguishes the two. The uptime monitor and the error scan have both
really executed and succeeded.

## Open security finding (queued, not started)

`LB-B29`: Origin/CSRF enforcement is not consistent across state-changing routes;
`PATCH /api/learner/profile/update` and `POST /api/auth/logout` have none. Scope, audit results and
acceptance criteria are in `BACKLOG.md`. Audit the whole route set before changing any single route.

## Standing constraints

1. Keep Production change, database mutation, credential rotation and SMS configuration behind their existing owner gates; a live release does not open them.
2. Preserve rollback and backup evidence; deletion requires explicit owner authorization naming the specific artifacts.
3. The repository stays private, `v1.0.0`, `v1.1.0` and `v1.2.0` do not move, history is not rewritten, media is not purged, and protected-media authentication is not weakened.
