# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**No product feature work is active** (LB-B35 CP0–CP5 merged and closed; CP6 decision merged; CP7 implementation merged and closed; CP8 staging-activation evidence PASS and CLOSED, web only, below). CP9 is **not started and not approved**. v1.2.0 and the v1.2.1 security patch (`LB-B29`) are released and
closed (below), and the Admin P0 credential cutover (`LB-B30`–`B33`) is complete (next section).
Nothing further is approved for implementation: P1 compatibility and Admin redesign have **not** started. Deferred but not cancelled:
`LB-B19` (reminders), `LB-B28b` (photo upload), `LB-B17` (Store).

## LB-B35 Learning system unification — CP0–CP7 merged and closed; CP8 evidence PASS and CLOSED (web only)

- **CP0** (#328), **CP1** (#329), **CP2** (#330), **CP3** (#331), **CP4 plan** (#332) and **CP4 implementation** (#333) are merged. Owner decisions: ENG-CLAMP; Box 5 ×3 capped at 180 days; Unknown = one Box down; difficulty/lapses/lateness removed from scheduling (not implemented or activated).
- **CP4 closure.** PR #333 final head `f04031cafebff7dd4b6a25295b3be57636dfdd52`, squash-merge `9c9c69ce08603ea289fbf2f676a112f049909f00`; required checks `mobile`, `production-stack`, `quality`, `secrets` all SUCCESS on that head. CP4 development and staging verification are **CLOSED**; the tested source was `9c83bbfb…` and the final delta was documentation-only. Evidence: `docs/evidence/LB_B35_CP4_PERSISTENCE_EVIDENCE.md` (section 9 carries the staging report, limitations and deferred findings). Release-tag provenance: `docs/evidence/RELEASE_PROVENANCE_RECONCILIATION_2026-10-01.md`.
- **CP5 closure (web learner UI, flags default OFF).** PR #336 final head `afc98bda5ccd709846f917221ebf71f127f95d02` (runtime `e3c33a36213d0fd4608a2423117b729056138fec`, docs-only commit on top), squash-merge `7da1cea5cead64dd9c3f80865cdfe84257bad16a` (tree identical to the approved head); required checks `mobile`, `production-stack`, `quality`, `secrets` all SUCCESS on that exact head and on the runtime head. Delivered behind four flags: binary «بلد بودم» → `known` / «بلد نیستم» → `unknown` buttons; Today uses canonical `cardsForToday` (12-card session, up to 3 new cards only in spare capacity); onboarding/Profile/Settings learning-goal UX removed (client-only, no data change); Persian session-expired re-login that keeps unsynced answers and flushes them after sign-in (no Discard action, by owner decision); keyboard-operable flip card (role=button, Enter/Space, visible focus). `card_schedules.state` is still written; mobile stays on the legacy four-grade client; scheduler v1 unchanged; no migration. Evidence: `docs/evidence/LB_B35_CP5_LEARNER_UI_EVIDENCE.md`. CP5 development and staging CLOSED (disposable stack, images and fake clock removed).
- **CP5 deferred findings.** Answer buttons start below the fold on a 390×844 viewport (UX finding, not changed). Full screen-reader / contrast audit is B14. No real iPhone/Safari pass; browser sessions used minted test cookies, not a real OTP login. `state` column retirement and mobile binary UX are separate later checkpoints. Nothing from CP4 or CP5 is enabled in Production.
- **CP6 closure (scheduler / progression decision; evidence only).** PR #338 final head `df28535a86bb8dc9f41a7454417fc31fe1238d41`, squash-merge `e483caee90a6b65b722e46102c9f01da199ed501`; required checks `mobile`, `production-stack`, `quality`, `secrets` all SUCCESS on that head. Owner decision 2026-10-01: **Option 2, GR-1.8** (Known ×1.8, a Known from Box 1 enters Box 2, at most one Box up; max 1 consecutive Known without visible progression); **ENG-DROP replaces ENG-CLAMP** (the CP6 sweep found plain ENG-CLAMP leaves the Box unchanged on an Unknown in 742 of 4,036 states, so it broke the approved rule); Unknown moves exactly one Box down, Box 1 stays Box 1; Box transitions become an explicit scheduler invariant; forward-only activation (existing Box-1 cards move to Box 2 on their first future Known; no schedule or history rewrite); post-launch recall probe is telemetry only and must never tune or select policy. **Simulation is decision support only:** GR-1.8's simulated day-365 knowledge (0.242) was lower than ENG-DROP's (0.308) and no real learner-retention dataset establishes pedagogical superiority. Report `docs/evidence/LB_B35_CP6_PROGRESSION_DECISION_REPORT.md`; raw outputs `docs/evidence/cp6/`. No runtime, scheduler, migration, Production, Admin or Store change.
- **CP7 closure (GR-1.8 + ENG-DROP implementation).** PR #340 approved head `096a5cdaced75ee53838ac7af92b28b2af046abd`, squash-merge `713a9a941481965f74f905c9bee4226de442e0a5` (resulting `main` tree byte-identical to the approved head, verified by tree hash); docs closure PR #341 squash-merge `f1a85fd5cf7e1ea9dbbc017da7fee0d2ccefc643`. Both 4/4 CI SUCCESS. `scheduleBinaryReview` sits behind a default-OFF `LEARNBOX_SCHEDULER_V2` and fails closed without migration `0023`.
- **CP8 closure (Scheduler V2 staging activation — evidence checkpoint, WEB ONLY).** Candidate/source SHA `f1a85fd5cf7e1ea9dbbc017da7fee0d2ccefc643`; authoritative evidence run `r2-20261001T234638Z`; **87/87 assertions PASSED**, write accounting `EVERY_WRITE_ACCOUNTED` (49 ledgered inserts, 0 deletions, all 9 schedule chains reconciled). Evidence `docs/evidence/LB_B35_CP8_STAGING_ACTIVATION_EVIDENCE.md`; artifacts `docs/evidence/cp8/`; harness `tools/cp8/`. Proven on an isolated Docker staging database only: discriminating Box-1 graduation (V1 0.075/Box 1 vs V2 1.0/Box 2), the pinned CP6 GR-1.8 trace parsed from `docs/evidence/cp6/traces.txt` and matched Box-for-Box, one-Box Unknown drop across 11 boundary points with Box 1 staying Box 1, the 180-day cap, forward-only activation, idempotency, deterministic 422 `schedulerRejected` with nothing persisted, transient 503 `serverUnavailable` with queue preserved, fail-closed preflight on missing/wrong `0023` columns, and rollback (V2 stability retained, post-rollback writes take the V1 path). Migration `0023` re-proved additive/forward-only, no backfill, `response`/`engine_version` NULL on pre-existing events, re-apply a no-op. **Two adversarial review passes** were run; 14 defects were found and fixed, including five found in the remediated package itself (stale-fingerprint guard, a non-discriminating rollback assertion, a one-sided Box-skip check, regex-based engine attribution, and an unverifiable CP6-pin provenance claim). **No runtime or product source changed in CP8.**
- **CP8 does NOT authorize Production migration or flag activation.** `0023` must not be applied to Production and `LEARNBOX_SCHEDULER_V2` / `LEARNBOX_BINARY_REVIEW` must stay OFF there. Scope explicitly excluded Admin, Store, native/Dart behaviour and `card_schedules.state` retirement.
- **CP8 unresolved findings (carried forward, not fixed).** **N1:** `LEARNBOX_BINARY_REVIEW=true` on a pre-`0023` schema returns 503; operational rule — apply `0023` **before** enabling binary review. **N2:** after a memoised preflight success, a schema regression returns 503 instead of 422; nothing is persisted and it self-heals, so it is a classification imperfection only. Both need product-code changes and are out of CP8 scope.
- **D16 / native remains BLOCKED.** Scheduler V2 must not activate in Production until `apps/mobile/lib/features/sync/http_review_sync_transport.dart` distinguishes deterministic 422 `schedulerRejected` from retryable `serverUnavailable`, with tests. CP8 activation evidence is **web only**; the Dart client was not touched and is not native-ready.
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
