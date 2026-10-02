# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; the normalized v1.1 backlog lives in `BACKLOG.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

**No product feature work is active** (LB-B35 CP0–CP5 merged and closed; CP6 decision merged; CP7 implementation merged and closed; CP8 staging-activation evidence PASS and CLOSED, web only, below). CP9 (server-side Production cutover) is **CLOSED** as of 2026-10-02 with **D-3 deferred** (see the CP9 section below); CP10 (D16 native 422 handling) is **CLOSED**; CP11 (documentation/evidence continuity) is this pass. v1.2.0 and the v1.2.1 security patch (`LB-B29`) are released and
closed (below), and the Admin P0 credential cutover (`LB-B30`–`B33`) is complete (next section).
Nothing further is approved for implementation: P1 compatibility and Admin redesign have **not** started. Deferred but not cancelled:
`LB-B19` (reminders), `LB-B28b` (photo upload), `LB-B17` (Store).

## LB-B35 CP9 Production cutover — CLOSED 2026-10-02 (server-side complete; D-3 DEFERRED)

**Result: CLOSED.** Stages 0–6 executed against Production. Stage 7 / Scheduler V2 **not authorized,
not started**.

**Production state at closure (re-verified 2026-10-02 at CP11):** image digest
`sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`,
`APP_SOURCE_SHA=8b7b32905ccbae09977cd0c102df62cf79e58bd5`, migration ledger **0023**, container
healthy, health 200. Exactly five server flags ON: `LEARNBOX_TZ_PERSIST`,
`LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_TODAY_WORKLOAD`, `LEARNBOX_QUEUE_QUARANTINE`,
`LEARNBOX_BINARY_REVIEW`. `LEARNBOX_SCHEDULER_V2` **ABSENT**.
`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=false` baked into the deployed artifact (owner decision D-2).

**Zero learner-data movement across the whole cutover:** users 2, cards 35, schedules 31, events 90,
`events_md5 273f88ec…`, `scheds_md5 5f6282e2…`, `learner_daily_plans` 0, `review_event_rejections` 0.
No learner history was created, modified or deleted to produce evidence.

**D-3 is DEFERRED, not waived and not passed.** Blocker **D-H**: because
`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI` is inlined by Next at build time and the approved artifact
was built with `false`, the binary branch is dead-code-eliminated — `grade-grid-binary` appears in
**0** served JS bundles (only an unused CSS rule) and the binary instruction string in **0** files.
The deployed learner UI is the legacy four-grade UI, so the real Production web client cannot emit
binary `known`/`unknown`. **No Production browser binary-review observation has been performed.**
The 21/21 isolated E2E/store/wire proof is valid evidence for the **server-side** binary path only
and is **not** a substitute for D-3.

**Mandatory future gate — Binary UI Activation.** D-3 is deferred to the release that actually ships
`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=true`. That checkpoint **must not be called PASS until D-3
actually passes**; its ten mandatory requirements (structural proof of the binary UI in the built
artifact, full verification of the new digest, explicit owner digest approval, N=20 real-browser
reviews exercising both known and unknown, full accounting, unchanged control account) are recorded
in `docs/evidence/LB_B35_CP9_IMPLEMENTATION_EVIDENCE.md` §19.

**Owner-approved accounts for that future observation (baselines preserved, do NOT delete or reset):**
test `b4efb0a4…` (Mona) — 32 events, md5 `d105b78e…`, 15 schedules md5 `8793e62b…`;
control `451b0433…` (Bahram) — 58 events, md5 `3da4b653…`, 16 schedules md5 `a6cd0e28…`.

**Deferred findings carried forward (not fixed in CP9, do not remediate without approval):**
**P1** `learnbox_migrator` cannot `ALTER TABLE` (needs ownership; `neondb_owner` owns all tables) —
Stage 4 used a one-time elevated DSN. **P2** `learnbox_app` holds UPDATE/DELETE on
`users`/`review_events`/`card_schedules`, wider than the append-only intent; pre-dates CP9.
**D16** native 422 `schedulerRejected` handling is **CLOSED in CP10** (below); it no longer blocks,
but the remaining Scheduler V2 readiness items do.

**Rollback (available):** R0 image `learnbox-app:rollback-v121-20261002T103214Z`;
R1 `/home/ubuntu/learnbox/backups/cp9-20261002T103329Z.dump` (480780 B);
R3 `compose.yaml.cp9-pre`; R5 `.env` ladder (5 steps) in `/home/ubuntu/learnbox/cp9-stage5/`.

**Evidence:** `docs/evidence/LB_B35_CP9_IMPLEMENTATION_EVIDENCE.md` §11–§19.

## LB-B35 CP11 source-continuity incident — runtime source restored 2026-10-02

CP9's cutover was executed from a local branch (`feat/lb-b35-cp9-n1-preflight`) that was **never
pushed**, so for a period Production ran runtime source that did not exist on `origin/main`. This was
found while preparing CP11 and treated as a source-continuity incident.

- **Forensic audit (read-only)** confirmed the material was legitimate, secret-free and complete:
  all runtime changes sit in the single deployed commit `8b7b3290…`; the deployed artifact is
  reproducible from it **byte-for-byte** (27/27 compiled API modules md5-identical, 0 files present
  in the image but absent from source); the staging DSN lived only in `tools/cp8/cp9-probe-run.sh`,
  which was correctly gitignored and **never committed**.
- **Root cause:** the CP9 branch was closed and CP10 was branched from `main` eleven minutes later
  with no intervening `push`, orphaning the work on a local ref. A process slip, not a decision.
- **Remediation:** the five runtime files plus their proving test were **forward-ported onto current
  `main`** (PR #345, head `d58076cd…`, squash merge `49958941…`) — the historical branch was **not**
  merged, so CP10 was preserved byte-for-byte. The five runtime files on `main` are byte-identical to
  their `8b7b3290…` originals. The test file carries two disclosed test-only fixes (an unused-variable
  lint error and a `TS2339` union-cast error) that CP9 never hit because the branch never ran CI.
- **No Production change.** Merging the continuity PR did **not** and must **not** trigger a build,
  deploy, restart, flag change or migration. Production already contains this runtime; the repository
  was brought forward to match Production, never the reverse. **Do not attempt to equalize
  Production's SHA with `main`.**
- `.dockerignore` (added on the CP9 branch _after_ the deployed commit) is deliberately **excluded**
  and reserved for a separate build-hygiene checkpoint.
- The historical CP9 branch and its preservation bundle are **retained** until the owner formally
  closes this incident.

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
- **CP10 closure (D16 — native 422 `schedulerRejected` compatibility).** PR #343 approved head `59c149a54dbdb9bfe9884a327732dd43024e677d`, squash-merge `5e4e13b5aa64fe4f875e2c3540fa4e141c0f9405`; resulting `main` tree `866de97a8e384ea02b9bb8e3fe60045846fc6749` is byte-identical to the approved head (verified by tree hash). Required checks `quality`, `secrets`, `mobile`, `production-stack` all SUCCESS on that exact head (`Vercel – learnbox-admin-preview` fails identically on #340/#341/#342 — pre-existing, Admin deliberately contained, no admin file touched). Dart/test only: 5 files under `apps/mobile`, nothing outside.
- **D16 is CLOSED.** `apps/mobile/lib/features/sync/http_review_sync_transport.dart` now treats HTTP **422** with body exactly `{"error":"schedulerRejected"}` as a **deterministic, non-retryable** terminal refusal (new `retryable` getter), and `review_sync_coordinator.dart` maps it to the new terminal `ReviewSyncResult.SchedulerRejected` variant instead of `RetryableFailure`. The matcher is strict (single key, exact code, parseable JSON), so any other 422 shape — and the reconciliation GET path — keeps the retryable `serverUnavailable` classification; `authenticationRequired`, `validation` and network faults are unchanged. **Queue preservation and concurrency are covered:** a refusal never mutates the queue (the unsynced learner answer is retained), introduces no retry/backoff/timer, and concurrent `synchronize()` calls collapse onto one request and still release the in-flight future. Evidence: focused 22/22, full mobile suite 293/293, `dart format` and `flutter analyze` clean, mutation 5/5 killed with 0 survivors and 0 skips, plus an independent read-only adversarial review (8/8 categories PASS, 0 blockers/majors/minors).
- **Native binary review remains DISABLED.** The uploaded payload stays legacy four-grade (`clientEventId`, `cardId`, `grade`, `occurredAt`); `PendingReviewEvent` has no `response` field and `ReviewGrade` has exactly four values. CP10 added no binary capability.
- **Production was NOT changed by CP10.** No rebuild, no deploy, no flag change, no migration, no Production configuration or database change; verification was read-only.
- **Scheduler V2 is NOT ready for activation.** CP10 removed the D16 compatibility blocker only. Remaining readiness items stay open: (1) the **native sync path is currently dormant** — production wires `DisabledReviewSyncTransport` with `MobileIdentityState.signedOut` and `synchronize()` has no production caller, so the fix is correct but unexercised end-to-end; (2) **learner-facing handling of a terminal `schedulerRejected` is not yet defined or proven** — `SchedulerRejected` is returned but nothing consumes it, and no UX decision has been made; (3) the **server-side 422 contract should be pinned end-to-end before activation** — the strict matcher degrades safely to retryable if the body shape changes, which would silently regress D16. Any Scheduler V2 activation remains a separate owner decision.
- **Production state (reconciled at CP11, 2026-10-02).** Migration `0023` **IS applied to
  Production** (ledger `0023`), and Production runs the CP9 learner image
  `sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`
  (`APP_SOURCE_SHA` `8b7b3290…`), not the v1.2.1 image. Five server flags are ON
  (`LEARNBOX_TZ_PERSIST`, `LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_TODAY_WORKLOAD`,
  `LEARNBOX_QUEUE_QUARANTINE`, `LEARNBOX_BINARY_REVIEW`); `LEARNBOX_SCHEDULER_V2` is **ABSENT**. The
  learner **Binary Review UI is dormant** (`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=false` baked into
  the artifact, branch dead-code-eliminated) and **native binary review remains disabled**, so
  server capability does **not** mean learner-visible capability. Earlier statements in this file
  describing `0023` as unapplied and the v1.2.1 image as live were pre-CP9 and are superseded here;
  the v1.2.1 release record below is retained as **historical evidence**, not a current-state claim.
- **The `0023` Production gate is CLOSED (CP9, 2026-10-02).** Migration `0023` was applied to Production under owner approval with a pre-migration dump and restore check; this gate is historical and no longer pending. What remains gated is **activation**, not schema: see the Binary UI activation gate and the Scheduler V2 readiness items above.
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

**Superseded as the live artifact by the CP9 cutover (2026-10-02).** The table below is the v1.2.1
release record and is accurate as history; it is **not** the currently deployed state. Production now
runs `8b7b3290…` / `sha256:6318eb28…` on migration ledger `0023` — see the CP9 closure section above
and `PROJECT_STATE.md`. The `v1.2.1` tag and image remain the documented rollback lineage.

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
