# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**No product feature work is active** (LB-B35 CP0–CP5 merged and closed; CP6 not started, below). v1.2.0 and the v1.2.1 security patch (`LB-B29`) are released and
closed (below), and the Admin P0 credential cutover (`LB-B30`–`B33`) is complete (next section).
Nothing further is approved for implementation: P1 compatibility and Admin redesign have **not** started. Deferred but not cancelled:
`LB-B19` (reminders), `LB-B28b` (photo upload), `LB-B17` (Store).

## LB-B35 Learning system unification — CP0–CP5 merged and closed; CP6 not started

- **CP0** (#328), **CP1** (#329), **CP2** (#330), **CP3** (#331), **CP4 plan** (#332) and **CP4 implementation** (#333) are merged. Owner decisions: ENG-CLAMP; Box 5 ×3 capped at 180 days; Unknown = one Box down; difficulty/lapses/lateness removed from scheduling (not implemented or activated).
- **CP4 closure.** PR #333 final head `f04031cafebff7dd4b6a25295b3be57636dfdd52`, squash-merge `9c9c69ce08603ea289fbf2f676a112f049909f00`; required checks `mobile`, `production-stack`, `quality`, `secrets` all SUCCESS on that head. CP4 development and staging verification are **CLOSED**; the tested source was `9c83bbfb…` and the final delta was documentation-only. Evidence: `docs/evidence/LB_B35_CP4_PERSISTENCE_EVIDENCE.md` (section 9 carries the staging report, limitations and deferred findings). Release-tag provenance: `docs/evidence/RELEASE_PROVENANCE_RECONCILIATION_2026-10-01.md`.
- **CP5 closure (web learner UI, flags default OFF).** PR #336 final head `afc98bda5ccd709846f917221ebf71f127f95d02` (runtime `e3c33a36213d0fd4608a2423117b729056138fec`, docs-only commit on top), squash-merge `7da1cea5cead64dd9c3f80865cdfe84257bad16a` (tree identical to the approved head); required checks `mobile`, `production-stack`, `quality`, `secrets` all SUCCESS on that exact head and on the runtime head. Delivered behind four flags: binary «بلد بودم» → `known` / «بلد نیستم» → `unknown` buttons; Today uses canonical `cardsForToday` (12-card session, up to 3 new cards only in spare capacity); onboarding/Profile/Settings learning-goal UX removed (client-only, no data change); Persian session-expired re-login that keeps unsynced answers and flushes them after sign-in (no Discard action, by owner decision); keyboard-operable flip card (role=button, Enter/Space, visible focus). `card_schedules.state` is still written; mobile stays on the legacy four-grade client; scheduler v1 unchanged; no migration. Evidence: `docs/evidence/LB_B35_CP5_LEARNER_UI_EVIDENCE.md`. CP5 development and staging CLOSED (disposable stack, images and fake clock removed).
- **CP5 deferred findings.** Answer buttons start below the fold on a 390×844 viewport (UX finding, not changed). Full screen-reader / contrast audit is B14. No real iPhone/Safari pass; browser sessions used minted test cookies, not a real OTP login. `state` column retirement and mobile binary UX are separate later checkpoints. Nothing from CP4 or CP5 is enabled in Production.
- **Production state is unchanged.** Migration `0023` is **NOT applied to Production** (read-only check 2026-10-01: no `response`/`engine_version`/`users.timezone`, no `learner_daily_plans`/`review_event_rejections`); Production still runs the v1.2.1 learner image `sha256:5370578d187c` (`APP_SOURCE_SHA` `4ade0a88…`). **All CP4 flags are inactive in Production** (the CP4 build never shipped).
- **Remaining Production gate for `0023`:** explicit owner approval; a fresh pre-migration dump with a restore check; the repository migration runner; the section 3 before/after fingerprints repeated on Production; flags left OFF at migration time; learner image rebuilt with the CP4 build args only under a separate decision.
- **Still blocked / pending:** O1 and scheduler v2 stay an activation gate (not authorized); **R8** (timer fires) is pending independently, checked via `ExecMainStartTimestamp` after 2026-10-05 03:36 UTC; Admin stays contained; Store deferred. `Today.newCount` semantics is a recorded finding for a later checkpoint.

## Admin P0 (LB-B30–B33) — cut over, Admin still contained

Merged as PR #326 at `e601d8a118ec915d1a3c18cca7fb018025ad9a1c`; executed on Production 2026-09-30.
Full evidence: [`docs/evidence/ADMIN_P0_CUTOVER_EVIDENCE.md`](docs/evidence/ADMIN_P0_CUTOVER_EVIDENCE.md).

- **Learner:** same v1.2.1 image (`sha256:5370578d187c`); `DATABASE_URL` now the `learnbox_app` role.
  Production regression matrix 79 PASS / 0 FAIL. Rollback: `.env.bak-pre-p0-dsn` plus image tag
  `rollback-pre-p0-dsn-5370578d187c`.
- **Admin:** image `sha256:f9f117bb…` (label, runtime SHA = `e601d8a…`), role `learnbox_admin`,
  legacy routes disabled, **Caddy 404 and paused Vercel preview retained**. Do not enable the passkey
  or content-review flags just to satisfy a test matrix.
- **Production Admin anonymous matrix is 60/93, not 93/93.** All 33 mismatches are expected 404
  statuses in the disabled configuration; no leak, caching defect or unexpected public route. Guard
  ordering is **unproven on Production**.
- **Exposure gate (pending, owner-approved, required before Admin is ever public):** run on the exact
  intended public configuration and Production candidate; prove Origin/Content-Type/session guard
  ordering and authenticated/anonymous behaviour.
- **Test-write provenance:** `review_events` +2 and `revoked_sessions` +4 since Step 0 are the two
  learner-matrix runs against synthetic user `b4efb0a4…` (one review event and two revocations per
  run). Kept; not to be deleted to restore counts. Owner `451b0433…` untouched.

## v1.2.1 LB-B29 — released

Shipped to Production on 2026-09-30. Security hardening only: **no migrations, no schema or data
change.** `main` is documentation-only ahead of the shipped commit; that is not application drift and
must never trigger a deploy.

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| Application commit | `4ade0a885fa93a418db8cde94b81a206bcd80860`                                     |
| Tag                | `v1.2.1` (annotated, fixed to the commit above; **not** on the `main` tip)     |
| GitHub Release     | `v1.2.1`                                                                       |
| Image digest       | `sha256:5370578d187cd51cdecf230bc5c0f1e06a6df4c6a6358ce93da62ce7d6b86957`      |
| Database           | unchanged — ledger `0022`, 22 rows, 38 tables                                  |
| Rollback target    | v1.2.0 image `sha256:358cd50c05b3` (`learnbox-app:rollback-pre-v121-358cd50c`) |

Delivered: one shared `guardMutation` (`apps/website/lib/mutation-guard.ts`) for every
cookie-authenticated browser mutation, running in the `route.ts` file before authentication and before
any body read; `logout` and `profile/update` now enforce Origin; a rejected request returns
`403 request_rejected` + `no-store` and changes nothing; a route-inventory test fails the build on any
unclassified, unguarded, guard-after-auth or self-implemented-Origin route; `undici` resolves to

> = 6.28.1 (GHSA-rfgv-xxqx-mfg5, PR #323).

Verified live: source/tag/label/image/container/`APP_SOURCE_SHA` agree, container healthy with 0
restarts; anonymous and authenticated mutation-guard matrix, protected media and logout revocation
pass on Production; owner row, schedule and review history byte-identical before and after.
Staging found that the first build guarded the handlers but not the `route.ts` entry points; that was
fixed before merge and is now covered by the inventory test.

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

## Standing constraints

1. Keep Production change, database mutation, credential rotation and SMS configuration behind their existing owner gates; a live release does not open them.
2. Preserve rollback and backup evidence; deletion requires explicit owner authorization naming the specific artifacts.
3. The repository stays private, `v1.0.0`, `v1.1.0`, `v1.2.0` and `v1.2.1` do not move, history is not rewritten, media is not purged, and protected-media authentication is not weakened.
