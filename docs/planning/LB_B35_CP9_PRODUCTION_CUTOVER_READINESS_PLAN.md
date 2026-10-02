# LB-B35 CP9 — Production Cutover Readiness Plan

**Status: PLANNING ONLY. Nothing in this document has been executed.**
Prepared 2026-10-02. No Production mutation, no deployment, no migration, no flag activation.

Every fact in §1 was measured live today against Production, and every fact in §3 was measured
today on an isolated staging database. Nothing here is carried over from a previous summary
unverified; where an earlier claim turned out to be wrong it is marked **CORRECTION**.

---

## 1. Current Production baseline (measured 2026-10-02)

### 1.1 Runtime

| Property                  | Value                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Host                      | VPS `185.204.168.178` (Caddy → learner-app / admin-app / landing). **Not Vercel.** |
| App container             | `bd96b2335ca5` = `learnbox-app:production`, up 38h, healthy                        |
| Image digest              | `sha256:5370578d187cd51cdecf230bc5c0f1e06a6df4c6a6358ce93da62ce7d6b86957`          |
| `APP_SOURCE_SHA`          | `4ade0a885fa93a418db8cde94b81a206bcd80860` (tag `v1.2.1`)                          |
| Learner origin            | `https://app.learnboxapp.com` → `/api/health` **200** `{"status":"ok"}`            |
| Anonymous protected media | **401** (boundary intact)                                                          |
| Admin                     | separate container, contained at `admin.learnboxapp.com` (fixed 404)               |

**CORRECTION to a stale assumption:** `https://learnboxapp.com/api/health` returns **404**. That is
the _landing_ site, not the app. The learner app is on the `app.` subdomain. Any cutover health
check that probes the apex domain would be **vacuously green/red** and must not be used.

### 1.2 Database

| Property                 | Value                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Engine                   | **Neon** Postgres **17.11**, database `neondb`                                                      |
| Endpoint                 | `ep-jolly-hill-asbffbzx.c-4.eu-central-1.aws.neon.tech`                                             |
| Size                     | ~10 MB                                                                                              |
| Row counts               | `users=2`, `cards=35`, `card_versions=35`, `card_schedules=31`, `review_events=90`                  |
| `card_schedules` columns | `user_id, card_id, state, stability_days, difficulty, lapses, due_at, last_reviewed_at, updated_at` |
| 0023 columns             | **NONE** (`users.timezone`, `review_events.response`, `review_events.engine_version` absent)        |
| 0023 tables              | **NONE** (`learner_daily_plans`, `review_event_rejections` absent)                                  |

**Roles (measured).** The app connects as **`learnbox_app`** (`current_user=learnbox_app`), which has
`INSERT`/`UPDATE` on `review_events` but **`CREATE ON SCHEMA public = false`** — it cannot run DDL.
All of `learnbox_migrator`, `learnbox_app`, `learnbox_admin`, `neondb_owner` exist and can log in;
every relevant table is owned by `neondb_owner`.

**Migration ledger — CORRECTION.** An earlier probe concluded "no migration ledger exists in
Production". That was **wrong**: `public.schema_migrations` **does** exist. The probe ran as the
**least-privilege application role**, which gets `permission denied for table schema_migrations`.

Read from the latest nightly backup instead, the ledger contains exactly **`0001_initial` →
`0022_reconcile_production_schema`**, each with a SHA-256 checksum and an `applied_at`; the last
entry is `0022` at `2026-09-29 20:18:38+00`. **`0023` is the only gap.** This is now _proven from
the ledger_, not merely inferred from column presence.

### 1.3 Flags actually present in the Production container

- **Set:** `WEB_LEARNER_STATE_ENABLED=true`, `WEB_LEARNER_PROFILE_ENABLED=true`, `NODE_ENV=production`
- **Absent (count 0):** `LEARNBOX_SCHEDULER_V2`, `LEARNBOX_BINARY_REVIEW`, `LEARNBOX_SERVER_SESSION_PLAN`,
  `LEARNBOX_QUEUE_QUARANTINE`, `LEARNBOX_TZ_PERSIST`, `LEARNBOX_TODAY_WORKLOAD`
- **Absent:** every `NEXT_PUBLIC_LEARNBOX_*` variable (count 0)
- **Absent:** `MOBILE_REVIEW_SYNC_ENABLED` ← this is the D16 isolation lever, see §7

### 1.4 Recovery assets already on the host

- Rollback images retained: `learnbox-app:v1.2.1-4ade0a8` (= current), `rollback-pre-p0-dsn-5370578d187c`,
  `v1.2.0-468f054`, `rollback-pre-v120-a985b81d`
- Nightly backups in `/home/ubuntu/learnbox/backups/` (~386 KB gzipped, newest `learnbox-20261002T023351Z.sql.gz`)
- `ops/learnbox-backup.sh` — `pg_dump --no-owner --no-privileges --format=plain` run **inside a
  throwaway postgres client container**, piped to `gzip -9`; verifies gzip integrity and `CREATE TABLE` count
- `ops/learnbox-restore-drill.sh` — restores into a scratch container and asserts table count,
  `users`/`cards`/`review_events`/`schema_migrations`/`purchase_events` row counts, and orphan
  `card_schedules`
- **Neither `pg_dump` nor `psql` exists on the host or in the app container.** All DB maintenance
  must go through a throwaway client container. Any plan step that assumes a local `psql` is invalid.

---

## 2. Dependency graph: migration 0023 ↔ every CP4/CP5/CP7 flag

0023 is **additive only** — verified by reading it: `ADD COLUMN IF NOT EXISTS` ×3, two guarded
`CREATE TABLE IF NOT EXISTS`, three guarded `ADD CONSTRAINT`, one index. **Zero** `DROP` /
`TRUNCATE` / `DELETE` / backfill `UPDATE` statements. Local checksum
`ef364bd54dae164a28975d0c8e3f88ddf077aa8bdaeff6abd7321cd3eebc9b4e`.

```
                      migration 0023_learning_persistence
                                     │
        ┌──────────────┬─────────────┼───────────────┬──────────────────┐
        │              │             │               │                  │
 users.timezone  learner_daily  review_event   review_events     review_events
        │          _plans        _rejections     .response        .engine_version
        │              │             │               │                  │
LEARNBOX_TZ_    LEARNBOX_SERVER  LEARNBOX_QUEUE  LEARNBOX_BINARY   LEARNBOX_
  PERSIST       _SESSION_PLAN     _QUARANTINE      _REVIEW         SCHEDULER_V2
  (CP4)             (CP4)            (CP4)          (CP5)            (CP7)
        │              │             │               │                  │
        └──────────────┴─────────────┴───────────────┘                  │
                   no preflight of their own                      HAS a fail-closed
                   → hard-fail 503 if 0023 missing                preflight → 422
```

**Every one of the five server flags requires 0023.** They differ critically in _how they fail_
without it: only `LEARNBOX_SCHEDULER_V2` has a preflight that refuses deterministically (422). The
four others have **no preflight** and fail inside the INSERT as a **retryable 503**.

**Ordering constraint (absolute):** `0023` must be applied **before** any of the five flags is
enabled. This subsumes the known "0023 before binary review" rule.

### 2.1 Build-time vs runtime flags — a distinction the rollout must respect

Read from `infrastructure/production/app/compose.yaml` on `main`:

- `NEXT_PUBLIC_LEARNBOX_*` (incl. `BINARY_REVIEW_UI`, `SERVER_SESSION_PLAN`, `QUEUE_QUARANTINE`,
  `GOAL_UX_REMOVED`, `SESSION_EXPIRY_UX`) are declared under `build: args:` → **baked into the image**.
- `LEARNBOX_*` server flags are declared under `environment:` → **runtime**, changeable by restart.

**Consequence:** server flags can be flipped with a container restart and rolled back in seconds.
Every **UI** flag change requires a **rebuild + redeploy**, so it is a _deployment_, not a toggle,
and needs its own rollback image. A plan that treats the UI flag as "just another toggle" is wrong.

### 2.2 Infrastructure gap not covered by the image

The **live** `compose.yaml` (`sha256 c257164034de…`) **differs** from `main`'s
(`sha256 3f7d02ef60a3…`) and declares **zero** of the CP4/CP5/CP7 flags. So Stage 3 is **not** a
pure image swap: the compose file must also be updated, or the new flags cannot be set at all.

`main` also changes `infrastructure/production/landing/Caddyfile` (the Admin containment block).
**Admin is out of CP9 scope — do not deploy the Caddyfile as part of this cutover.** Scope the
deployment to the `app` service image + the `app` service environment block only.

---

## 3. Compatibility audit: can Production jump from v1.2.1 to current `main`?

The existing plans were audited for the assumption that Production can take the current `main`
image directly. Rather than assume, this was **measured**.

**Git ancestry:** `v1.2.1` (`4ade0a88`) **is an ancestor** of `main` (`ff658a43`) — a clean
fast-forward, **34 commits**, no divergence/rebase hazard. Only **one** new migration: `0023`.

**Empirical test (today).** An isolated staging database was deliberately rebuilt to a **pre-0023**
(v1.2.1-shaped) schema — migrations `0001`→`0022` — and the **current `main` build** was driven
through the **real web review route handler** (`tools/cp8/cp9-compat-probe.mjs`, 6/6 assertions):

| Case       | Configuration                                                                              | Result                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **A**      | all CP4/CP5/CP7 flags **OFF**, `WEB_LEARNER_STATE_ENABLED=true`, legacy grade `remembered` | **HTTP 200**, event persisted (`review_events 1→2`)                       |
| **B** (N1) | `LEARNBOX_BINARY_REVIEW=true`, binary item                                                 | **HTTP 503**, `column "response" … does not exist`, **nothing persisted** |
| **C**      | `LEARNBOX_SCHEDULER_V2=true`                                                               | **HTTP 422** `schedulerRejected`, fail-closed, **nothing persisted**      |

**Answer: yes — the new image is backward compatible with the pre-0023 Production database, provided
every new flag is off.** Case A is the direct evidence. This makes "deploy code first, migrate
second" a legitimate ordering and gives a stage boundary where the only change is code.

> Honest scope limit: this exercises the in-process route handler against a Production-_shaped_
> schema with synthetic fixtures — not Production data, and not through Caddy/systemd. It proves
> schema/SQL compatibility, not end-to-end HTTP behaviour. Stage 2 closes that gap with a real
> container run against a restored copy.

### 3.1 Harness defect found and fixed while producing the above

The first two probe runs reported nonsense (flags-off "persisted nothing"; N1 returning **200**).
Cause: `binaryResponses` is read from `process.env.LEARNBOX_BINARY_REVIEW` **inside**
`learner-review-web-http.ts`, and `tools/cp8/lib.mjs` forces that variable to `'true'` at import
time — so the injected per-call env was ignored and every case silently ran with binary review ON.
Two further defects: an invalid `grade: 3` (valid grades are `forgot|hard|remembered|mastered`) and
passing `card_schedules.card_id` where the wire contract wants the card's `content_id` **slug**.
All three were in the probe, not the product. **Lesson for CP9: a flag-matrix check that sets env
only via an injected object is vacuous for any flag read from `process.env` directly.**

---

## 4. N1 / N2 disposition

### N1 — `LEARNBOX_BINARY_REVIEW=true` on a pre-0023 schema returns a retryable 503

Reproduced today exactly (Case B): 503, nothing persisted.

**Disposition: must NOT be relied on as "acceptable"; it is acceptable only because of an ordering
discipline that CP9 must make mechanically impossible to violate.** The data-integrity property is
genuinely safe (nothing persists). The _operational_ hazard is the classification: 503 is
**retryable**, so clients keep retrying and the failure looks like a transient outage rather than a
configuration error. With 2 users and a queue-based web client, that could persist unnoticed.

Rather than block CP9 on a product-code change, CP9 **removes the precondition**: 0023 is applied
(Stage 4) **before** any flag stage (Stage 5+), and a Stage 5 **gate** asserts the 0023 surface
exists _before_ the flag is set. N1 is then unreachable by construction. **It stays an open
finding** — if the team ever wants binary review enabled on an unmigrated database, N1 must be
fixed first by giving that flag a real preflight.

### N2 — preflight memoises success; later schema regression yields 503 instead of 422

**Disposition: not a Production blocker for this cutover.** It requires the 0023 surface to
_disappear after_ a successful preflight. Since 0023 is additive and nothing in CP9 drops those
columns, the trigger state does not occur on the forward path. Measured behaviour is safe: nothing
persisted, self-healing, no restart needed.

**But it changes the rollback procedure, and that is where it bites.** A "data rollback" that drops
the 0023 columns while V2 is still enabled lands exactly in N2's trigger state. Therefore the
rollback order is mandatory: **disable the flag first, then touch the schema — never the reverse.**
See §6.

**Neither finding is dismissed on the grounds that CP8 called them non-blocking for staging.** N1 is
neutralised by ordering plus a positive gate; N2 is neutralised by rollback ordering. Both remain
open product defects.

---

## 5. Ordered cutover stages, with the proof required at each gate

Each stage names its own rollback point. **No stage may start until the previous gate is proven.**

### Stage 0 — Baseline capture _(no change; already done, §1)_

**Proof:** image digest, `APP_SOURCE_SHA`, row counts, 0023 surface absent, ledger `0001→0022`,
flag inventory, health 200 on `app.` origin, anon media 401.
**Rollback:** nothing changed.

### Stage 1 — Fresh backup + **positively verified** restore

Run `ops/learnbox-backup.sh` immediately before migrating (not the nightly). Then run
`ops/learnbox-restore-drill.sh` on **that exact archive**.
**Proof required:** gzip integrity; restored into a scratch container; restored row counts equal
Stage 0 (`users=2, cards=35, card_schedules=31, review_events=90`); `schema_migrations` restores
`0001→0022`; zero orphan `card_schedules`; plus a **content fingerprint** (not just counts) of
`review_events`, `card_schedules`, `users` computed identically on live and restored copies.
**Abort if:** the restore cannot be positively verified. A backup that exists but has never been
restored is **not** a rollback capability.
**Rollback:** nothing changed.

### Stage 2 — Build and prove the artifact

Build from `main` `ff658a43`; record image digest, **build args** (every `NEXT_PUBLIC_*` value),
`APP_SOURCE_SHA`, base image digest. Run the candidate container on a spare port against a
**restored copy** of Production data **still at pre-0023**, with all flags off, and exercise real
HTTP: health, learner login, a review submission, protected media 401 anonymous.
**Proof required:** `APP_SOURCE_SHA` inside the built image equals `ff658a43`; flags-off review
succeeds against pre-0023 **over HTTP** (promoting §3 Case A from in-process to end-to-end);
anonymous media still 401.
**Rollback:** discard the image; nothing swapped.

### Stage 2.5 — Inventory the 31-commit gap _(new, from adversarial finding A2)_

Classify every file changed in `apps/api`, `apps/website`, `packages/*` between `v1.2.1` and `main`
as **flag-gated** (inert at Stage 3) or **unconditionally active**. For each unconditionally-active
change, sign off backward compatibility with the existing web client and pre-0023 data, and add it
to the Stage 2 smoke test.
**Proof required:** a written classification covering every changed file, with no file unclassified.
**Rollback:** nothing changed.

### Stage 2.75 — Graceful shutdown _(new, from adversarial finding A1)_

Add `stop_grace_period: 30s` to the `app` service and a `SIGTERM` drain handler (stop accepting new
connections, finish in-flight requests, then exit). None of this exists today — verified.
**Proof required:** a SIGTERM to the candidate container drains in-flight requests instead of being
killed at the 10s default; Caddy's existing `health_uri /` check gates traffic to the new container.
**Rollback:** nothing changed (candidate only).
**Note:** replay is already idempotent at the DB level (`UNIQUE (user_id, client_event_id)` +
`ON CONFLICT … DO NOTHING`), so a dropped in-flight request cannot duplicate or corrupt history.

### Stage 3 — Deploy code, **all new flags still off**

Update the `app` service in `compose.yaml` to declare the new flags **explicitly `false`** (§2.2) and
swap the image. **Do not deploy the Caddyfile** (§2.2). Tag the outgoing image
`rollback-pre-cp9-<digest>` first.
**Proof required:** `APP_SOURCE_SHA=ff658a43` in the running container; health 200 on `app.`
origin; a real review submission returns 200 and persists; 0023 surface **still absent**; all five
flags readable as `false`; anon media 401; Admin still 404.
**Rollback:** retag/restart the previous image. **Pure code rollback — no data change**, because no
flag was on and the schema is untouched.

### Stage 4 — Apply migration 0023

Apply via the repo's migration runner, which already provides: `pg_advisory_lock` (no concurrent
runs), **per-migration BEGIN/COMMIT**, and a **checksum mismatch abort** for previously applied
migrations.
**Credential (resolved, §9 item 1):** the app role `learnbox_app` has `CREATE ON SCHEMA public =
false` and cannot run DDL. Apply 0023 with the dedicated forward-only role **`learnbox_migrator`**,
whose DSN already exists on the host as `LEARNBOX_MIGRATOR_DATABASE_URL`. Confirm on a restored copy
first that it can `ALTER` the `neondb_owner`-owned tables.
**Proof required (positive assertions, per adversarial finding A3 — the fingerprint alone is
partly tautological for an additive migration):** ledger reads `0023_learning_persistence` with checksum
`ef364bd54dae164a28975d0c8e3f88ddf077aa8bdaeff6abd7321cd3eebc9b4e`; the three columns, two tables,
three constraints and one index exist; **pre/post content fingerprints of all historical
`review_events`, `card_schedules` and `users` rows are identical** (additive-only proven, not
assumed); row counts unchanged; new columns all `NULL`; health 200; a flags-off review still 200.
**Rollback:** flags are still off, so the added columns are inert and the safest action is **leave
them**. If removal is truly required: drop the two tables and three columns (reversing 0023's
additions) — only while **all flags are off**. Restoring the Stage 1 backup is the last resort and
**loses any learner activity since the backup**.

### Stage 5 — CP4 flags, one at a time

Order: `LEARNBOX_TZ_PERSIST` → `LEARNBOX_SERVER_SESSION_PLAN` → `LEARNBOX_QUEUE_QUARANTINE`.
**Gate before each:** positively assert the specific 0023 object that flag needs **exists** (this is
what makes N1-class failures unreachable).
**Proof required after each:** health 200; a real review round-trip 200; the flag's own table/column
behaves (e.g. a `learner_daily_plans` row appears for a planned day); **no 503 in the error scan**;
observation window (§8) clean.
**Rollback:** unset the single flag and restart. Runtime-only; seconds. Data written by CP4 flags is
additive (plan rows, rejection rows, a timezone string) and does not alter scheduling history.

### Stage 6 — CP5 binary review (server), then UI

`LEARNBOX_BINARY_REVIEW=true` **only after** `review_events.response` is proven to exist.
**Proof required:** a binary answer persists with `response IN ('known','unknown')`; legacy
4-grade submissions still accepted (API compat preserved); no 503.
**Then** the UI flag — remembering it is a **build arg** (§2.1), so it is a rebuild + redeploy with
its own rollback image, not a toggle.
**Rollback:** unset the server flag (seconds). Rows already written keep a non-null `response`; that
is additive and harmless. UI rollback = redeploy the prior image.

### Stage 7 — `LEARNBOX_SCHEDULER_V2` — **last, alone, and on its own**

No other flag changes in the same window. Preceded by its fail-closed preflight, which §3 Case C
confirms refuses deterministically if the schema is wrong.
**Proof required:** preflight passes; new `review_events` carry `engine_version=2`; **zero**
scheduler invariant violations (§8); intervals match the GR-1.8 ladder; observation window clean.
**Rollback:** see §6 — this is the one stage where rollback is **asymmetric**.

---

## 6. Rollback / abort: algorithm rollback ≠ data rollback

**This is the most important asymmetry in the plan, and it must not be glossed.**

**Algorithm rollback (cheap, complete).** Unset `LEARNBOX_SCHEDULER_V2`, restart. All _future_
scheduling immediately uses V1 again. Seconds, runtime-only.

**Data rollback (NOT provided by the flag).** Turning the flag off **does not restore pre-V2
`stability_days` / `due_at` values.** `card_schedules` holds **current state, not history**: a V2
write overwrites the previous value in place. Once V2 has written a schedule row, the prior value
exists **only** in the Stage 1 backup. Likewise `review_events` rows stamped `engine_version=2`
remain stamped; unsetting the flag does not unstamp them.

So after Stage 7 has processed real reviews, the recovery options are:

1. **Algorithm rollback only** — stop V2 scheduling, accept that already-touched rows keep
   V2-computed values. Learners see a schedule computed by a mix of engines. **No data loss.**
2. **Full data rollback** — restore the Stage 1 backup. Restores exact pre-V2 values but **destroys
   every learner action since the backup**. For 2 users this is tolerable; it would not be at scale.

There is **no** third option that rewinds schedules without losing subsequent activity, because the
pre-V2 value is not retained anywhere online. **Any claim that "we can just turn V2 off" is
therefore only half true and must be stated this way to the owner.**

**Mandatory rollback ordering (from N2, §4):** always **disable the flag first, then touch the
schema**. Dropping 0023 objects while V2 is enabled lands in N2's trigger state and converts clean
deterministic refusals into retryable 503s.

**Per-stage abort triggers.** Any of these aborts the current stage and triggers its rollback:
health non-200 on the `app.` origin; any 5xx on the review path; anonymous access to protected
content/media returning 200; a scheduler invariant violation (**zero tolerance**); a fingerprint
mismatch on historical rows; the migration ledger disagreeing with the expected version.

---

## 7. Native / D16 isolation — proof, not assumption

The concern is real and worth stating precisely: the flags are **server-side**, and the **same
server process** serves both web and native clients. If native traffic reached the review endpoint
with V2 on, a `422` would be mapped by `http_review_sync_transport.dart` to `serverUnavailable` →
`RetryableFailure` → retry forever. That is exactly what D16 forbids.

**Why it cannot happen in this Production, by construction:**

`apps/website/app/api/reviews/mobile/route.ts` calls
`mobileReviewHttpDependenciesFromEnvironment()`, and `mobile-review-runtime.ts` begins with:

```ts
if (environment.MOBILE_REVIEW_SYNC_ENABLED !== 'true') return null;
```

When that returns `null`, the route returns **503 `serverUnavailable` immediately** — before any
dependency, store, scheduler or preflight is constructed. **`MOBILE_REVIEW_SYNC_ENABLED` is ABSENT
in the Production container (verified today, §1.3), and absent from the live `compose.yaml`.** The
native review endpoint is therefore switched off upstream of all scheduler code, by a lever
_independent_ of `LEARNBOX_SCHEDULER_V2`.

**D16 isolation requirement for CP9:** `MOBILE_REVIEW_SYNC_ENABLED` must remain **absent/false** for
every stage, and Stage 3's and Stage 7's gates must **assert** it. Enabling native sync is a
separate, later decision that stays blocked until the Dart client distinguishes 422 from a retryable
failure **with tests**. The Dart code is not modified by CP9.

---

## 8. Monitoring and the observation window

Existing host tooling to reuse: `ops/learnbox-uptime-monitor.sh`, `ops/learnbox-error-scan.sh`,
`ops/learnbox-alert.sh` (Telegram), `LEARNBOX_MONITOR_HEALTH_PATH=/api/health`.

**Signals that must be watched per stage:**

- Health 200 on **`app.learnboxapp.com`** (never the apex domain — §1.1)
- **Any 5xx on the review path**, with **503 called out specifically** — that is the N1/N2 signature
- **422 `schedulerRejected` count** — expected to be **zero** on the web path once 0023 is applied;
  non-zero means the preflight is refusing and something is wrong
- **Scheduler invariant violations — zero tolerance.** Any `SchedulerInvariantError` aborts and rolls
  back Stage 7 immediately; it indicates a correctness bug, not a transient fault
- `engine_version` distribution in `review_events` (should be the only place V2 is visible early)
- Interval sanity against the GR-1.8 ladder (Box 1→2 = 1d, ×1.8 per box, 180d cap)
- Anonymous protected-media probe still 401

**A hard limitation the owner must accept.** Production has **2 users and 90 review events**. A
time-based observation window over traffic this small is **close to vacuous** — a quiet hour proves
nothing because there may be no reviews in it. Windows must therefore be defined in **events, not
minutes**: do not advance a stage until a stated number of **real review submissions** has been
observed on the new configuration. If that volume will not occur naturally, the owner must either
(a) perform scripted learner actions on a real account, or (b) accept explicitly that the stage is
advancing on **low-volume, non-statistical** evidence. **Pretending that an hour of silence is a
green window would be the single most dishonest part of this plan, so it is ruled out here.**

---

## 8a. Independent adversarial review — adjudicated

An independent adversarial pass was run against this plan (`claude-sonnet-4-6`; its own verdict was
"NOT READY", citing 4 blockers). Every claim was then **checked against the code and live
Production** rather than accepted or dismissed. Four of its blockers rest on premises that are
factually false for this system; three of its findings are **real and are adopted**.

### Rejected on measured evidence (with the proof)

- **F1 "V2 exposes native clients to 422, violating D16" — REJECTED.** Both native-serving routes
  (`/api/reviews/mobile` POST and `/api/reviews/mobile/reconciliation` GET) call
  `mobileReview*DependenciesFromEnvironment()`, which returns `null` unless
  `MOBILE_REVIEW_SYNC_ENABLED === 'true'`; the routes then return 503 **before** constructing any
  scheduler, store or preflight. That variable is **absent in Production and absent from the live
  compose file**. Native clients cannot reach the scheduler at all, so enabling the server flag
  cannot produce a 422 for them. See §7. (The reviewer was not told about this gate.)
- **F3 "no migration ledger, so ORM tooling may re-run or skip migrations" — REJECTED.** The ledger
  **exists** (`public.schema_migrations`, `0001`→`0022`, checksummed). The reviewer inherited my own
  incorrect premise; a correction was sent but the run had already finished. The repo's runner
  (`apps/api/src/database/migration-runner.ts`) additionally takes `pg_advisory_lock`, wraps **each**
  migration in `BEGIN`/`COMMIT`, and **aborts on checksum mismatch** for anything already applied —
  so the "silently mark 0001-0023 applied" scenario cannot occur. F3's recommendation to hand-apply
  raw SQL and then _bootstrap_ a ledger is **actively worse** here: it would bypass the checksum
  guarantee and risk a ledger that disagrees with reality.
- **F5 "V1 reading V2-written `stability_days` produces undefined results" — REJECTED as stated,
  but a weaker real concern remains.** Both engines use **the same column in the same unit (days)**,
  and the box is _derived_ from it by the shared `boxFromStabilityDays()` against
  `BOX_LOWER_BOUND_DAYS = [0,1,3,7,21]`. There is no separate V2 scale and no V2-only box column, so
  a V1 read of a V2 value is well-defined, not undefined. What _is_ true is that the **numeric value
  differs** from what V1 would have produced — i.e. a flag-only rollback leaves V2-chosen intervals
  in place. That is precisely the asymmetry already documented in §6; it is a scheduling-continuity
  issue, not data corruption.
- **F8 "Neon branch restore verification is vacuous" — REJECTED for the chosen method, and its
  underlying point is already honoured.** This plan's Stage 1 basis is the **`pg_dump` archive**
  (`ops/learnbox-backup.sh`), not a copy-on-write branch, so there is no shared-storage tautology:
  the dump is a separate byte stream, restored into a scratch container by
  `ops/learnbox-restore-drill.sh`. F8 is a sound criticism of a _branch-only_ strategy, which is
  exactly why §9 item 2 recommends the dump as the rollback basis.

### Adopted — real gaps this plan did not cover

- **A1 (from F4) — no graceful-shutdown guarantee. ADOPTED, MAJOR.** Verified: there is **no
  `STOPSIGNAL`, no `stop_grace_period`, and no `SIGTERM` handler** anywhere in the app or compose.
  Docker's default 10s then SIGKILL applies, so an in-flight review can be cut mid-request on the
  Stage 3 swap. **Mitigating fact the reviewer lacked:** replay is **idempotent at the database
  level** — `review_events.client_event_id` is `UNIQUE`, `UNIQUE (user_id, client_event_id)` exists
  since `0013`, and the insert uses `ON CONFLICT (user_id, client_event_id) DO NOTHING` returning
  `idempotent: true`. So a retried event **cannot** duplicate, and F4's "duplicate rows / corrupted
  history" scenario is closed. The residual risk is a single dropped in-flight request, which the
  client re-queues. **Action:** add `stop_grace_period: 30s` and a SIGTERM drain before Stage 3, and
  perform the swap in a low-traffic window. Caddy already health-checks the upstream
  (`health_uri /`, `health_interval 30s`), which limits traffic to a not-yet-ready container.
- **A2 (from F6/F7) — the 31-commit gap is not inventoried beyond 0023. ADOPTED, MAJOR.** §3 proves
  schema/SQL compatibility and ancestry, but does **not** enumerate unconditionally-active
  (non-flag-gated) behaviour changes across `apps/api`, `apps/website`, `packages/*`. **Action — new
  Stage 2.5 gate:** classify every changed file in those paths as flag-gated or unconditionally
  active, and sign off each unconditional change for backward compatibility with the existing web
  client and pre-0023 data. This plan already covers F7's infra half (§2.2: live compose differs
  from `main`, the Caddyfile must not be deployed).
- **A3 (from the vacuity list) — "additive-only" fingerprint is partly tautological. ADOPTED,
  MINOR.** Correct: because 0023 only adds nullable columns, a before/after fingerprint of existing
  rows is _expected_ to match and so cannot distinguish success from "never ran". **Action:** keep
  the fingerprint (it still disproves accidental rewrites) but make the Stage 4 gate **positive**:
  assert the ledger row for `0023` with checksum
  `ef364bd54dae164a28975d0c8e3f88ddf077aa8bdaeff6abd7321cd3eebc9b4e`, and assert each of the three
  columns, two tables, three constraints and one index now exists.
- **A4 — post-swap flag re-verification. ADOPTED, MINOR.** A Stage 0 flag inventory on the _old_
  container does not constrain the _new_ one. Stage 3's gate already re-reads the flags from the new
  container; this is now explicit.

### On N1 and the reviewer's strongest point

The reviewer argues (F2) that ordering discipline is a human process and that `LEARNBOX_BINARY_REVIEW`
must get a real fail-closed preflight before any cutover. **That argument is sound in principle**, and
its proposed fix (a 422 `binaryReviewUnavailable` preflight mirroring the V2 one, caching failures and
never memoising success — which also avoids N2's defect) is the correct long-term shape.

It is **not** adopted as a CP9 blocker, for two measured reasons: (a) Stage 4 applies 0023 **before**
any flag stage, and each flag stage is gated on positively asserting the specific 0023 object it
needs — so the precondition for N1 does not exist on this path; (b) the failure is **safe when it does
occur** — measured 503 with **nothing persisted**, so there is no silent data loss, contrary to F2's
"permanently lost" characterisation: the client keeps the event queued and retries. What F2 gets right
is the **detectability** problem, which is why §8 mandates a 503-specific alert on the review path.

**Recommendation:** fix N1 properly as a small, well-scoped change **before Stage 6** (the binary
review stage), not before Stage 0. That keeps Stages 0–4 unblocked while ensuring the flag is never
enabled in Production without a deterministic refusal path.

---

## 9. Remaining owner decisions / open items

1. **Migration credential — RESOLVED, no longer gating.** A dedicated forward-only DDL role
   **`learnbox_migrator`** exists (LB-B30 least-privilege design: `NOSUPERUSER NOCREATEDB
NOCREATEROLE`, `GRANT CREATE ON SCHEMA public`), and the DSN
   **`LEARNBOX_MIGRATOR_DATABASE_URL`** is already present on the Production host in
   `/home/ubuntu/learnbox/secrets/db-roles.env` (key name verified; value never read).
   **No owner secret entry is required.** One residual check for Stage 4: `db-roles-p0.sql` notes
   that the owner role "is granted to it explicitly by the cutover runbook" — so confirm
   `learnbox_migrator` can `ALTER` the `neondb_owner`-owned tables (or `SET ROLE neondb_owner`)
   **on a restored branch copy first**, not on live Production.
2. **Neon backup semantics.** Is the rollback basis the `pg_dump` archive (proven, drill-verified) or
   a **Neon branch / PITR**? If Neon branches are used, retention and the exact restore command must
   be pinned, and auto-expiry disabled. Decision needed; the `pg_dump` path is already proven and is
   the recommended basis.
3. **Observation volume** (§8): scripted real-account activity, or explicit acceptance of
   low-volume evidence?
4. **UI flag timing** — `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI` is a build arg, so learner-visible
   binary UI is a separate deployment. Enable in CP9, or defer?
5. **Scope confirmation** — CP9 excludes Admin, Store, native binary UX and unrelated cleanup; the
   Caddyfile is deliberately not deployed (§2.2).

---

## 10. Recommendation

**Planning is complete. CP9 implementation is safe to begin at Stage 0, and no blocker remains
outstanding.** The migration-credential question that was the one blocker in the first draft is
**resolved**: `learnbox_migrator` exists and its DSN is already on the host (§9 item 1).

Two **MAJOR** prerequisites added by the adversarial pass must be completed before the Stage 3
container swap — the 31-commit behaviour inventory (Stage 2.5) and graceful shutdown
(Stage 2.75) — and **N1 should be fixed before Stage 6**, not before Stage 0.

Specifically:

- **Stages 0–3 are safe to begin** on the evidence gathered. The decisive new facts are that the
  current image is **measurably backward compatible** with the pre-0023 Production schema when flags
  are off (§3 Case A), that `v1.2.1` is a clean ancestor of `main` with `0023` as the only migration
  gap, and that the migration ledger **proves** Production sits at `0022`.
- **Stages 2.5 and 2.75 are new mandatory gates** before the Stage 3 swap (adversarial findings A2
  and A1). Neither is a blocker to _starting_; both are blockers to _swapping_.
- **Stage 4's credential is resolved** — `learnbox_migrator`, DSN already on the host. The only
  residual check is that it can `ALTER` `neondb_owner`-owned tables, to be proven on a restored copy.
- **Stage 6 (binary review) should be preceded by the N1 preflight fix** — a deterministic 422
  refusal instead of a retryable 503 (§8a).
- **Stages 5–7 are specified but should not be scheduled** until Stages 0–4 have produced their
  evidence, since each gate depends on the previous stage's measurements.
- **N1 and N2 remain open findings.** They are neutralised for this cutover by ordering (0023 before
  any flag) and by rollback ordering (flag off before schema change) — **not** by having been
  labelled non-blocking in staging.
- **D16 holds by construction** via `MOBILE_REVIEW_SYNC_ENABLED` being absent (§7), and every gate
  asserts it.

**Nothing in this plan has been executed. No Production change, no migration, no flag activation.**
