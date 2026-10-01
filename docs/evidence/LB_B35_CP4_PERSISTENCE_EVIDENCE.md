# LB-B35 CP4 — learning persistence: evidence

Status: implemented on branch `feat/lb-b35-cp4-additive-persistence`; **isolated staging verification
complete and accepted by the owner** (section 9). Nothing here is applied to Production. Every behavioural change is behind a flag that is **off by default**.
Scheduler v2 is not activated and ENG-CLAMP / progression behaviour is unchanged (O1 stays open).

## 1. Checkpoints

| CP  | Change                                                                                                         | Flag                                                               |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 4.0 | Session capacity characterized and frozen in tests before any table logic; final binary wording recorded       | —                                                                  |
| 4.1 | Migration `0023_learning_persistence.sql` (additive, nullable, idempotent)                                     | —                                                                  |
| 4.2 | Persisted learner IANA timezone: stored → device → UTC, written once, never over a stored value                | `LEARNBOX_TZ_PERSIST`                                              |
| 4.3 | Server-owned daily new-card allowance (`learner_daily_plans`)                                                  | `LEARNBOX_SERVER_SESSION_PLAN`                                     |
| 4.4 | Per-item pending-event parsing, bounded rejection quarantine, flush-before-logout choice, server rejection log | `LEARNBOX_QUEUE_QUARANTINE` (+ `NEXT_PUBLIC_` twin for the client) |
| 4.5 | Resume a review session by card identity                                                                       | `NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN`                         |
| 4.6 | Binary-response compatibility (`known`/`unknown` stored with a shadow grade)                                   | `LEARNBOX_BINARY_REVIEW` (UI arrives in CP5)                       |

## 2. Session capacity (owner clarification)

Characterized before implementing the table. v1.2.1 behaviour, now pinned by tests:

- A session holds **12 cards in total** (due + new). It is **not** "12 due + 3 new". New cards fill only the
  spare room and are at most 3. More than 12 due is recovery mode: 12 reviews, no new cards.
- **Defect found:** the 3-new limit applied _per plan read_. Answering a new card and re-reading granted 3
  more, without bound, so repeated sessions kept introducing new cards.
- **New invariant (flag on):** the server freezes one allowance per learner-local day with
  `INSERT … ON CONFLICT DO NOTHING`; refreshes and other devices receive the same cards; answered new cards are
  not replaced the same day; the next learner-local day grants a fresh 3; recovery mode spends no allowance; the
  day boundary is the learner's (Tehran midnight = 20:30Z).
- **The 12-card capacity was not changed**, so no product decision was needed. Earlier plan text that said
  "12 due + 3 new" was wrong and is corrected in the plan. `SESSION_CAPACITY_CARDS` and
  `DAILY_NEW_CARD_ALLOWANCE` are canonical constants in `definitions.ts`; the planner reads them.

## 3. Migration `0023` and history integrity (restored real dataset)

Real Production dump restored into a throwaway Postgres 17 container; `0023` applied to a copy
(`lbreal_mig`), once by hand and once through the repository's own migration runner (`lbreal_run`).

| Check                                                                                                      | Result                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `review_events` fingerprint (count + md5 over ordered id, user, card, grade, occurred_at, client_event_id) | `76 / a21c019f…` before = after                                                                              |
| `card_schedules` fingerprint                                                                               | `31 / 8783067c…` before = after                                                                              |
| `users` fingerprint (id, name, avatar)                                                                     | `2 / cd33c448…` before = after                                                                               |
| Row counts of the 38 original tables                                                                       | all identical                                                                                                |
| Table count                                                                                                | 38 → 40 (`learner_daily_plans`, `review_event_rejections`), nothing else                                     |
| Second application                                                                                         | no-op (NOTICE "already exists, skipping"); runner `applied: 1` then `applied: 0`                             |
| Manual apply vs runner                                                                                     | identical snapshot, apart from the ledger row                                                                |
| Constraints                                                                                                | 155 / 155 validated                                                                                          |
| New columns on existing rows                                                                               | `response`, `engine_version`, `users.timezone` all NULL; no backfill                                         |
| Legacy grade CHECK                                                                                         | still rejects `known` (`review_events_grade_check`)                                                          |
| New CHECKs                                                                                                 | `response` rejects junk; timezone limited to 1–64 chars (shape only; IANA validity is the application's job) |
| Real history, projected to the binary response                                                             | known = 57, unknown = 19 (legacy grades: forgot 19, hard 6, remembered 25, mastered 26)                      |
| Ledger                                                                                                     | `0022` → `0023_learning_persistence`, 23 rows                                                                |

`occurred_at` is never written by any CP4 path, and `review_events` gained no UPDATE/DELETE path.

## 4. Rollback guarantee

With every flag off the write path is the v1.2.1 SQL statement (the `response` column is named only for a
binary answer), proven by a test that runs it on a database **without** `0023`. Legacy four-grade requests
keep the exact v1.2.1 wire format: `response` is rejected unless the binary flag is on. Rollback is turning
flags off; the schema stays. The migration is forward-only and nothing is dropped.

## 5. Pending-event safety

- **Logout (flag on):** flush first; if answers remain unsent the session is **not** ended and the learner
  chooses to retry, stay, or sign out and discard. A flush that throws is treated as unsent, never as zero.
  Revocation failure after a clean flush still keeps the learner signed in.
- **Corrupt queue:** parsed per item; valid events are kept; the raw bad item or whole raw string is copied to
  `learnbox:review-quarantine:v1:…` _before_ any reset. If the quarantine write fails the original is untouched.
- **Rejected events:** `validation` / `idempotencyConflict` retry up to 5 times, then move to quarantine with
  the payload intact; `clockSkew`, offline and 401 are never quarantined. Quarantine leaves the device only
  through an explicit discard. The server records a bounded reason code (no payload) in
  `review_event_rejections`, best-effort so it can never fail a review request.
- **Flag off** keeps the CP0 pins: whole-queue reset and unbounded retry (defects retained deliberately).

## 6. Compatibility of legacy columns

`state`, `difficulty` and `lapses` are still written exactly as today because the scheduler is unchanged.
`state` is read by no learner screen. Nothing is dropped. Stop-writing `state` is deferred to the CP5/CP6
compatibility step.

## 7. Canonical-domain consistency

New constants and functions live in `packages/learning-engine/src/definitions.ts` and are imported by the API,
the website and the tests: `SESSION_CAPACITY_CARDS`, `DAILY_NEW_CARD_ALLOWANCE`, `resolveLearnerTimeZone`,
`BINARY_SHADOW_GRADE` / `shadowGradeFor`, and `resolveResumeIndex`. The CP2 no-redefinition guard still has a
zero allowlist.

## 8. Not done / still open

- **CP5 items are not started:** binary review buttons, onboarding-goal removal, session-expiry UI.
- **R8** (systemd timer fires) is **still pending, independently of CP4**; check `ExecMainStartTimestamp` after
  2026-10-05 03:36 UTC. Nothing in this document claims R8.
- **Production `0023`** is NOT applied and NOT authorized. It requires a fresh pre-migration dump and a restore
  check taken just before it, plus explicit owner approval.
- **O1** (visible progression under ENG-CLAMP) stays an activation gate for scheduler v2.
- Limitations of the staging proof are listed exactly in section 9.12.

## 9. Isolated staging verification (final)

**Final tested source SHA: `9c83bbfbcd25dec37ac73483f0fe9f7bd50661cf`.** Every staging image
(`off`, `q`, `s`, `all`) was built from that SHA and the running container reported it as `APP_SOURCE_SHA`.
The previously tested head `0903adf2b07d2f81730e350c0eef81be99d59b89` was superseded by the fix in 9.1; its
results are not reused as evidence unless stated.

**Environment.** Disposable Docker network, Postgres 17 and Caddy TLS proxy on localhost, restored from the real
backup `learnbox-20261001T023451Z.sql.gz` (sha256 `70285150…d33663`), `0023` applied by the repository runner.
SMS provider disabled unless stated (9.9). A fake-clock shim moved only the app's `Date.now()`. The DB-level
baseline was taken before any test (`snap-baseline`).

### 9.1 Resume by card identity — defect, root cause, fix

- **Observed** (real browser, `0903adf2`): a saved record with a stale index and a matching `nextCardId` still
  restarted at card 1.
- **Root cause:** in the server-OTP path the review queue arrives after the screen mounts. The resume effect ran
  once against an empty queue, so the saved card id could not be located and the record was not honoured; it was
  also not re-evaluated when the queue arrived.
- **Fix** (flag `NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN`; flag off = v1.2.1 path unchanged):
  `resolveResumeIndex` decision is made against the loaded server queue; card identity wins over a stale
  position; an id that is absent from a **loaded** queue clears the record and starts at the first card; an
  index-only legacy record resumes by index; a malformed record is cleared safely; an unloaded queue never
  deletes the record. Files: `LearnerHome.tsx`, `review-session-storage.ts`, `index.ts` and two test files.
- **Regression test:** `apps/website/test/cp4-resume-server-queue.test.tsx` (7 tests). **Red 4/7 on the
  `0903adf2` LearnerHome, green 7/7 on `9c83bbfb`.** Pure-function tests added; learning-engine 131/131 (124
  before).
- **Real browser on `9c83bbfb`, all flags on** (queue: Apfel, Bahnhof, Bett, Brot, Danke, Ei …):
  stale index 4 + id Bett → Bett (3 of 9); stale index 0 + id Brot → Brot; id absent → Apfel; index-only
  record 2 → Bett; malformed → Apfel without error. The record is rewritten with `nextCardId` each time.
  Queue-reorder and earlier-cards-removed cases are covered by the component tests, not by the browser.
- Delta `0903adf2` → `9c83bbfb`: 5 files, 311 insertions, 7 deletions (the files above); no migration, Docker,
  compose or API change.

### 9.2 CI

`mobile`, `production-stack`, `quality`, `secrets` = SUCCESS on `9c83bbfb`. (The non-required Vercel
`learnbox-admin-preview` check fails; Admin is paused/contained and that check was not investigated.) CI for the
final evidence-only head is recorded in the merge report, not here.

### 9.3 Stage 0 — rollback comparison (re-run; the earlier result had not been retained)

Pre-CP4 `main` image `ed08722d…` and the CP4 candidate with **all flags off** ran the same deterministic
read/write script as the same synthetic user on the same migrated (`0023`) database, one after the other.
Result: reads identical across the learner API surface; 5 writes 200 on both; 4 schedule rows and 4 events on
both; the only differences in the captured payloads are server-generated event ids (5 of 5 diffs, 0 other).
This also shows the pre-CP4 code runs unchanged on the migrated schema.

### 9.4 Timezone (`LEARNBOX_TZ_PERSIST`) — 22/22 on `9c83bbfb`

Stored → device → UTC resolution; stored once and never overwritten by a conflicting device zone; invalid zones
(unknown, offset, empty, SQL-like, over-length, NUL byte) give 200 + UTC fallback with nothing stored; pre-existing
users keep a NULL column; Today and Summary agree; frozen history fingerprints identical to baseline.

### 9.5 Queue, quarantine and logout — 8/8 and 6/6 (real component + real staging server)

Run on the timezone + quarantine + session-plan image. Evidence of each owner-listed case:

- flush then logout: answers reach the server first, then 204, session revoked (same cookie → 401), device cleared;
- offline logout: choice screen with count; session **not** ended, answer kept, server session still alive;
- temporary server failure (Postgres stopped): answer kept, session not revoked; after recovery Retry delivers
  exactly once, then logs out;
- 401: answer kept and the learner told; nothing stored server-side; no quarantine and no rejection row for an
  auth failure; after re-login the same event is acknowledged exactly once;
- remaining pending events, Retry (offline and after recovery) and Stay: queue intact, session alive;
- explicit discard + logout: session revoked, device cleared, deliverable answers already on the server;
- malformed isolation: bad item parked, valid answer delivered, rejected answer still queued; raw text preserved;
- quarantine: after the threshold the rejected answer is kept with payload, not retried forever, and still
  blocks a silent logout; the server never stored it;
- idempotent replay: replay acknowledged, still one server row;
- empty queue: immediate revoke and clear, no prompt.

No unsynced learner answer disappears without an explicit user decision.

### 9.6 Session plan and capacity — 99/99 on `9c83bbfb`

Capacity 12 total (due + new), allowance 3. Verified: 12 due → 0 new; more than 12 due → recovery mode; repeated
refreshes and a second device receive the same frozen allowance; answering a new card produces no replacement
that learner-local day; the next learner-local day gives a fresh 3; day boundaries for Tehran (UTC date unchanged
across local midnight), New York and Berlin DST; previous day's plan row untouched. Note: the separate 7-test
capacity suite (`stage3b`, 7/7) ran on `0903adf2` only (see 9.12).

### 9.7 Binary compatibility (`LEARNBOX_BINARY_REVIEW`) — 27/27 on, 5/5 off

`known` stores `response='known'`, shadow grade `remembered`; `unknown` stores `response='unknown'`, shadow grade
`forgot`; `engine_version` stays NULL. Schedule rows are identical to twin learners answering with the legacy
grade, for an existing card and a brand-new card (scheduler v1 unchanged). All four legacy grades work with the
flag on and keep `response` NULL; mixed legacy + binary batches work. Replay of the same `clientEventId`
(including a different answer and binary-then-shadow-grade) leaves exactly one row and does not move the schedule.
Six malformed shapes (unknown value, grade + response, empty, null, uppercase, extra key) → 400, nothing stored.
DB CHECKs verified (bogus grade and bogus response rejected, valid binary row accepted, constraints present).
Flags off: legacy write works; `response` is rejected with 400 and nothing stored. No two-button UI, no
scheduler v2.

### 9.8 All-flags interaction matrix — 25/25

All four flags on: persisted timezone, daily plan, binary + legacy mixed writes, second device with a conflicting
zone, offline answer applied after Tehran local midnight (UTC date unchanged), full replay across the boundary,
reviewed-today reset, late answer attributed to its occurred local day, no replacement new cards, frozen
history unchanged. Real browser resume (9.1) ran on the same all-flags image. Authenticated HTTP matrix 76/79.

### 9.9 OTP / SMS — explanation and controlled proof

Three matrix checks fail on every image, including `main`: foreign-origin `POST /api/auth/otp/request`,
`/api/auth/otp/verify` and the request-rejected check returned **503** instead of **403**. Cause: with
`SMS_IR_ENABLED=false` the route returns `503 otp_unavailable` before the origin guard runs (`otp-runtime.ts`,
`otp/request/route.ts`). Controlled proof on the candidate with `SMS_IR_ENABLED=true`, a non-secret placeholder
key and `api.sms.ir` pinned to `127.0.0.1` inside the container (no real send possible): all three return
**403**; the matrix is **79/79**. The staging configuration was restored afterwards. The OTP route code is
unchanged between `main` and the candidate.

### 9.10 Final DB integrity (against `snap-baseline`)

Identical to baseline: the 90 pre-`0023` `review_events` (`90 / 695c1362…`), the 2 original users' legacy columns
(`2 / b8ab03d6…`), the owner's 16 schedules (`18ffd2ec…`), `account_deletion_events` (`1 / 784a62df…`). Zero
pre-`0023` rows carry `response` or `engine_version`. Ledger `0022` → `0023` (23 rows); tables 38 → 40; original
tables otherwise only grew by synthetic rows. Whole-table fingerprints differ from baseline because of
synthetic writes, as accounted below. (The staging dataset is the 2026-10-01 backup with 90 events; section 3
used the earlier dump with 76 events.)

### 9.11 Synthetic-write accounting (final snapshot, no synthetic data deleted)

| Table                                                 | Baseline | Final   | Attribution                                                                      |
| ----------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------- |
| `users`                                               | 2        | 180     | 178 synthetic (`synth-*`)                                                        |
| `review_events`                                       | 90       | 307     | 207 synthetic + 10 on designated test account `b4efb0a4` + 90 frozen; 0 on owner |
| `card_schedules`                                      | 31       | 708     | 677 synthetic; 1 row of `b4efb0a4` touched after `0023`                          |
| `learner_daily_plans` (new)                           | 0        | 88      | all synthetic; 0 for original users                                              |
| `review_event_rejections` (new)                       | 0        | 71      | all synthetic; 0 for original users                                              |
| `learner_reconciliation_cursors` / `revoked_sessions` | 2 / 7    | 84 / 39 | session and logout activity of the synthetic users                               |
| `schema_migrations`                                   | 22       | 23      | `0023_learning_persistence`                                                      |

Binary column population: `response` known 24 / unknown 8 / NULL 275; shadow-grade mismatches 0;
`engine_version` non-NULL 0. Four more whole-table baselines changed accordingly (events 307 / `9a0b9374…`,
schedules 708 / `fb3674b6…`, users 180 / `73b412c8…`); the frozen subsets above did not change. A host disk-full
event occurred mid-run; Docker was restarted, the database was intact and the post-recovery snapshot matched.
Reference checksums (sha256): `snap-baseline` `a4aefeb8…a006`, `snap-final2` `cddbc5dd…6550`, final staging dump
`970e8091…602e`. Scratch logs and the dump are kept outside Git (local evidence directory, not committed).

### 9.12 Not proven / not re-run (limitations, not PASS claims)

- The 7-test capacity suite (`stage3b`, 7/7) ran only on `0903adf2`. The 99/99 session-plan run on `9c83bbfb`
  covers capacity, midnight boundaries and the second device, but `stage3b` itself was not repeated.
- The logout/queue suites ran on the timezone + quarantine + session-plan image, not on the all-flags image and
  without binary writes.
- The other 14 schedule rows of `b4efb0a4` have no per-row baseline fingerprint (only the 31-row total, which
  changed through one touched row).
- Resume is device-local (localStorage) by design; resume across two physical devices does not apply. Queue
  reorder and earlier-cards-removed were verified in component tests, not the browser.
- Not tested: real SMS provider, Production, mobile app, Admin exposure.
- The non-required Vercel `learnbox-admin-preview` check fails and was not investigated.
- The docs-only commit that added this section was not re-run through staging.

### 9.13 Deferred finding — `Today.newCount`

`Today.newCount` is the unseen-catalogue count (catalogue minus scheduled), not today's new-card allowance. This
is the same in v1.2.1 and does not affect the frozen daily plan (the plan's `newCardIds` and `newCards` are
correct). It may be a semantic/UI issue and is **deferred to the next appropriate checkpoint**; CP4 was not
expanded.

### 9.14 Cleanup

Staging containers, network and localhost proxy removed; scratch `main-wt` worktree removed; staging-only
`stg-*` test files removed from the checkout and not tracked or part of PR #333 (0 tracked, 0 in the PR).
Local `cp4-stg-*` images retained. Production, Admin, scheduler and the learner app v1.2.1 were not touched.
