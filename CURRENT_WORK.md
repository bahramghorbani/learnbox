# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**None.** v1.1.0 is released and closed. The next release has not been scoped.

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

**Scheduled backup and restore drill have never actually executed.** Both timers are enabled and active, and both jobs are proven by manual runs — a full backup (34 tables, verified gzip) and an isolated restore drill (0 orphans). But `ExecMainStartTimestamp` is empty for both units.

An active timer is not a successful execution. Neither may be reported as successful until it has genuinely run, and the result of the first real run of each must be recorded separately. The uptime monitor and the error scan, by contrast, have both really executed and succeeded.

## Standing constraints

1. Keep Production change, database mutation, credential rotation and SMS configuration behind their existing owner gates; a live release does not open them.
2. Preserve rollback and backup evidence; deletion requires explicit owner authorization naming the specific artifacts.
3. The repository stays private, `v1.0.0` and `v1.1.0` do not move, history is not rewritten, media is not purged, and protected-media authentication is not weakened.
