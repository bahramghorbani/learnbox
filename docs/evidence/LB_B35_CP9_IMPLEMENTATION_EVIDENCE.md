# LB-B35 CP9 — Implementation & Readiness Evidence

**Candidate:** `ff658a431d2e5ecd2f90a1f72f46ff83d0e6b6f6` (`main`)
**Production baseline:** `4ade0a885fa93a418db8cde94b81a206bcd80860` (v1.2.1)
**Date:** 2026-10-02
**Production state at time of writing:** UNTOUCHED — container `bd96b2335ca5`,
`APP_SOURCE_SHA=4ade0a88…`, zero `LEARNBOX_*` feature flags, `/api/health` → `200`, migration `0022`.

Owner decisions in force: **D-1** migrator DSN per-command (Stage 4 only) · **D-2** Binary Review UI
deferred past CP9 · **D-3** one dedicated test account with event-count gates · **D-4** no Caddy/Admin
containment in CP9 · **D-5** Scheduler V2 last, separately authorized, flag-off ≠ data rollback.

---

## 1. Stage 2.5 — runtime change inventory (HARD GATE: PASSED)

Full table: `LB_B35_CP9_STAGE25_RUNTIME_INVENTORY.md`.

| Category                                | Files                                     |
| --------------------------------------- | ----------------------------------------- |
| A — flag-gated                          | 19 (18 changed + 1 new CP9 file)          |
| B — unconditional, behaviour-preserving | 15                                        |
| C — unconditional, **learner-visible**  | **7**                                     |
| D — **schema-risk**                     | **0**                                     |
| **Total classified**                    | **41** = 40 changed runtime files + 1 new |

Of 205 changed files, 38 tests and 19 `apps/admin` files are excluded (Admin is not in the learner
image, per D-4). Counts were reconciled **programmatically** against
`git diff --name-only 4ade0a88..main`: 41 unique, **0 duplicated, 0 unclassified**.

Two equivalence results were proven at source rather than assumed:

- `BOX_LOWER_BOUND_DAYS = [0,1,3,7,21]` is byte-identical to the previously hardcoded `1/3/7/21`
  thresholds ⇒ **no card changes Box** under the refactor.
- `SESSION_CAPACITY_CARDS = 12` makes `session.ts` / `recovery.ts` emit exactly the former `12/24/36`
  ⇒ pure refactor.

### Category C — 7 files, require explicit owner accept/reject

**Corrected after an independent read-only audit.** My first parent pass listed **5**; the audit
flagged **7**, and all seven were re-verified at source in-parent and **confirmed**. Three
reclassifications accepted (`today/route.ts` A→C, `WordsScreen.tsx` B→C, `TodayScreen.tsx` A→C); two
rejected in the other direction (`ProfileScreen`/`SettingsScreen` C→A — their Goal section really is
gated by `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED`). Category D stayed **0** under both passes.

C-1 `api/learner/today` (**accuracy definition**) · C-2 `api/learner/words` · C-3
`api/learner/progress` · C-4 `api/learner/profile/stats` · C-5 `ProgressScreen.tsx` ·
C-6 `WordsScreen.tsx` · C-7 `TodayScreen.tsx`.

#### C-1 is the material one, and my first pass understated it

`correctToday` changes from `grade = 'remembered'` only to `hard` + `remembered` + `mastered`.
Measured against live Production `review_events` (90 rows):

| grade        | events |
| ------------ | ------ |
| `mastered`   | 32     |
| `remembered` | 30     |
| `forgot`     | 21     |
| `hard`       | 7      |

39 of 90 events previously counted as **incorrect** now count as correct — displayed accuracy moves
from **≈33% to ≈77%**. Defensible (it matches the Box model's known/unknown semantics), but it is the
one change every learner will notice, so it must be a deliberate product decision.

#### Everything else in Category C is provably inert on current data

| Change                                  | Affected today                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `mastered` Box 4+ → Box 5 (C-2, C-4)    | **0** — all 31 schedules are Box 1–2 (30 in Box 1, 1 in Box 2)                                 |
| Mastery ring `mastered`→`learned` (C-5) | **0** — both are 0 while every card is Box 1–2                                                 |
| Words progress basis (C-6)              | **0**; Persian labels change immediately (تسلط→یادگیری, مسلط→یاد گرفته)                        |
| Minutes tile removed (C-7)              | Cosmetic — in Production it **always** showed «—» (`realMinutes` required `NODE_ENV==='test'`) |
| Field renames / shapes (C-2, C-3, C-4)  | Immediate for any API consumer                                                                 |

## 2. N1 — fail-closed binary-review schema preflight (IMPLEMENTED)

**Defect (CP8 N1):** `LEARNBOX_BINARY_REVIEW=true` on a pre-0023 schema produced a raw INSERT failure
that the service boundary mapped to **retryable `serverUnavailable` (503)** — the operator got no
actionable message and the client retried a request that could never succeed.

**Fix.** New `apps/api/src/reviews/binary-review-preflight.ts`, mirroring the CP7 scheduler-V2
preflight: a **positive** assertion that `review_events.response` exists as `text` **and** that
`review_events_response_valid` admits both canonical values, raised **before the transaction opens**,
under a distinct error name.

Wiring:

- `postgres-review-event.store.ts` — optional injected preflight, invoked in `writeAtomically()`
  **before `pool.connect()`**, and only when the event carries `response`.
- `mobile-review-batch.service.ts` — `BinaryReviewPreflightError` added to the deterministic set ⇒
  **422 `schedulerRejected`, `retryable: false`**, never a 503 retry loop.
- `learner-review-web-runtime.ts` / `mobile-review-runtime.ts` — preflight attached **only** when
  `isBinaryReviewEnabled(env)`, so the flag-off store is exactly v1.2.1.

### Design properties, each verified at source

- **Deterministic:** failure depends only on schema state, not timing.
- **Fails closed before persistence:** refusal happens before a connection is taken from the pool.
- **Schema ≠ infrastructure:** only _schema_ problems raise `BinaryReviewPreflightError`. If the probe
  query itself fails (database down), the raw pg error propagates and stays **retryable** — a
  transient outage is never misreported as permanent.
- **No retry-loop semantics:** `retryable: false` crosses the boundary.
- **Success memoised, failure never cached:** applying 0023 re-enables binary review **without a
  restart**; until then every call keeps failing closed.
- **Unrecognised constraint ⇒ not accepting** (fail closed), since a narrowed CHECK would otherwise
  reject at COMMIT.

### Evidence

**Unit/regression — 12/12 PASS** (`apps/website/test/cp9-n1-binary-review-preflight.test.ts`),
including: _refuses the write before a connection is taken from the pool_ (`connect` never called) and
_does not run the preflight at all when no binary answer is present_.

**Real-database proof — 9/9 PASS** (`tools/cp8/cp9-n1-realdb-proof.mjs`) against a genuinely pre-0023
staging database:

```
PASS database is genuinely pre-0023 (no review_events.response)
PASS preflight rejects a real pre-0023 database
PASS error is BinaryReviewPreflightError (deterministic name the boundary maps to 422)
PASS message names review_events.response
PASS message names migration 0023 so the operator knows the fix
PASS failed preflight is re-evaluated, never cached
PASS binary write is refused
PASS NOTHING was persisted (review_events count unchanged) :: 2 -> 2
PASS flag-off write is NOT blocked by the preflight (v1.2.1 path intact)
```

**Full suite:** 779 passed, 160 skipped, **0 failed** (113 files). No regression.

### Bypass analysis (parent-verified)

- Only **one** `INSERT INTO review_events` exists in runtime code — the guarded path.
- Three non-test `PostgresReviewEventStore` construction sites: two write paths both wire the
  preflight; the third (`mobile-review-runtime.ts:88`) exposes only `readReconciliation` — **read-only,
  no write path**, so not a gap.
- Flag-off cannot smuggle a binary answer: `parseBinaryItem` is reachable only when
  `options.binaryResponses` is set, and flag-off `parseItem` **rejects** `response` via `exactKeys`.

## 3. Stage 2.75 — graceful shutdown / in-flight review safety (PASSED 7/7)

Harness: `tools/cp8/cp9-stage275-proof.sh` + `cp9-stage275-writer.mjs` + `cp9-stage275-verify.mjs`.
**Staging only** (refuses any DSN not on port 55443). Method: continuous real review writes through
the production store, `SIGTERM` mid-flight, then reconcile client-acknowledged against the database.

```
PASS zero lost acknowledged reviews :: 0 lost of 4416 acknowledged
PASS zero duplicate review rows :: 0 duplicated ids
PASS every row is either acknowledged or safely retryable (exactly-once holds)
PASS zero partial writes (no event without its schedule) :: orphans=0
PASS graceful SIGTERM exit within grace period :: 1s <= 10s
PASS no SIGKILL required
PASS writer exited cleanly (code 0) :: exit=0
```

4,416 reviews submitted and acknowledged, SIGTERM delivered mid-flight with 3 writes in flight,
drained and exited in **1 s** — well inside Docker's default 10 s grace. All 4,416 proof rows were
then removed from staging (`deleted=4416`, `remaining_cp9=0`).

**Why it passes without a compose change.** The earlier concern (no `STOPSIGNAL` /
`stop_grace_period`) is real but **not load-bearing**: `review_events.client_event_id` has carried a
**UNIQUE** constraint since migration `0001`, so a retried answer is a no-op, and the web sync queue
keeps unacknowledged answers client-side. Exactly-once therefore holds across an abrupt swap. Adding
`stop_grace_period: 30s` + explicit `SIGTERM` handling remains a **recommended hardening**, not a CP9
blocker — and since no lifecycle change was needed, none was made (CP9 scope kept minimal).

## 4. CP9 Production artifact definition (BUILT AND PROVEN)

| Field                                     | Value                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Source SHA                                | `ff658a431d2e5ecd2f90a1f72f46ff83d0e6b6f6`                                |
| Dockerfile                                | `infrastructure/production/app/Dockerfile`                                |
| Tag (local)                               | `learnbox-app:cp9-candidate`                                              |
| **Image id (deploy by this, not by tag)** | `sha256:9f14c7c8da9ee6b78cd1766929e400c7e57cbcd2cc1086765304cfa62b569dd2` |

Build args — CP9-excluded UI flags explicitly `false`:

```
NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=false      # D-2: deferred past CP9
NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE=false
NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN=false
NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED=false
NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX=false
NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=true   # already live in Production
NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=true             # already live
NEXT_PUBLIC_LEARNBOX_ALPHA_INVITE_UI_ENABLED=true    # already live
NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=true      # already live
```

### Proven from the artifact itself — 4/4 PASS (`tools/cp8/cp9-artifact-proof.sh`)

String-searching the bundle is **not** valid evidence: Next.js inlines
`process.env.NEXT_PUBLIC_X === 'true'` to a literal, so the flag **name disappears** and the Persian
button labels («بلد بودم» / «بلد نیستم») remain present as dead code in **both** builds. The valid
method is a **differential build** plus reading the inlined literal:

```
candidate_chunks=60 control_chunks=60 differing_lines=6
PASS flag-OFF bundle differs from flag-ON control (build arg is genuinely wired) :: 6 differing chunks
PASS candidate bundle inlines binary review UI gate as FALSE (!1) :: binaryWire:!1
PASS control bundle inlines it as TRUE (!0), so the differential is valid :: binaryWire:!0
PASS runner image carries no NEXT_PUBLIC_LEARNBOX env (not runtime-flippable) :: count=0
```

`binaryWire:!1` in `page-52b0acd350b36071.js` is the minified `false` constant: the CP5/Binary Review
UI **cannot** be exposed at Stage 3, and **no runtime env var can flip it** — the runner stage carries
zero `NEXT_PUBLIC_LEARNBOX` variables. Stage 6 therefore needs its own rebuild (exactly D-2).

**Deployment must pin the digest.** The live compose currently references the mutable tag
`learnbox-app:production`, which would silently change behaviour on any rebuild. The runbook replaces
it with the digest above. The control image was deleted after the proof.

## 5. Migration ordering (preserved)

`code compatibility (Stage 3, flags off)` → `0023 (Stage 4)` → `CP4 flags incrementally (Stage 5)` →
`Binary Review backend (Stage 6)` → `Scheduler V2 (Stage 7, separate authorization)`.

**N2 constraint retained:** flag OFF before any schema change, never the reverse.
**D-5 asymmetry retained:** `LEARNBOX_SCHEDULER_V2=false` restores future algorithm behaviour but not
already-overwritten `stability_days`/`due_at`; the only full restore is the Stage 1 verified dump.

## 6. Scope discipline

Not touched, as instructed: Binary Review **UI**, Admin/Caddy containment, Store, native/Dart,
unrelated cleanup. No Production deploy, no `0023` on Production, no Production flag change, no
Scheduler V2, no Production backup/cutover.

## 7. Outstanding gates before Production cutover

1. **Owner accepts Category C** (C-1…C-7, especially **C-1: accuracy ≈33% → ≈77%**) — Stage 2.5 hard gate.
2. **Explicit Production cutover authorization** (Stages 0–7).
3. **Stage 7 remains separately gated** by D-5 and D16 (Dart 422 handling).
4. ~~Independent adversarial second pass~~ — **COMPLETE** (§8). No BLOCKERs; one MAJOR and one MINOR,
   both verified pre-existing and outside CP9 scope; comment corrected and 2 regression tests added.
   The inventory audit is likewise complete and reconciled (§9).

## 8. Independent adversarial second pass (N1 implementation)

Read-only reviewer, 19 API calls, 1473 s. **Verdict: no BLOCKERs.** One MAJOR, one MINOR — both
**verified at source in-parent**, and both proved to be **pre-existing**, not introduced by CP9.

### MAJOR — mobile HTTP boundary never enables binary parsing (pre-existing, out of CP9 scope)

`mobile-review-http.ts` calls `parseMobileReviewBatchRequest(body, sub)` with **no options**, so
`binaryResponses` defaults to `false`. A mobile item carrying `response` is therefore refused at the
boundary and the preflight attached to the mobile store is unreachable through that route.

**Parent verification:**

- The call is **byte-identical in v1.2.1 (`4ade0a88`) and `main`** — `git diff main -- …` is empty.
  CP9 did not introduce or worsen it.
- Empirically reproduced: with the mobile call shape the parser throws
  `MobileReviewBatchRequestError: Each review item has an invalid shape.`; with the web shape
  (`{binaryResponses: true}`) the same item parses and `response === 'known'`.
- The route is unreachable in Production anyway: `mobile-review-runtime.ts:36` returns `null` unless
  `MOBILE_REVIEW_SYNC_ENABLED === 'true'`, and the route then answers **503**. That variable is
  **absent** in Production.

**Assessment: the reviewer's finding is correct, and its own conclusion is the right one — the safety
invariant is not compromised.** A binary answer cannot be persisted without a passing preflight via
any production write path; the item is rejected _before_ the store. Wiring mobile binary review is
explicitly **out of CP9 scope** (D16: no native/Dart changes; mobile binary UX already deferred), so
the fix is **not** applied here.

**Actions taken instead of a scope-expanding fix:**

1. **Corrected my own misleading comment.** It claimed "same fail-closed preflight as the Web path",
   which overstated reachability. It now records that the mobile route cannot reach it, that the gap
   predates CP9, and why the preflight is nonetheless kept (defence-in-depth, so the gap can never
   become a persistence bug if the route is later wired).
2. **Added two regression tests** pinning the invariant: a binary item is rejected at the mobile
   boundary, and the identical item is accepted at the web boundary. If anyone wires mobile binary
   parsing without the preflight story, these tests document the contract.

### MINOR — `process.env` read directly at the web boundary (pre-existing, test-only)

`learner-review-web-http.ts:69` reads `process.env.LEARNBOX_BINARY_REVIEW` directly while the runtime
takes an injectable `environment`. **Verified pre-existing** (`git diff main` on that file is empty).
In production both read the same `process.env`, so there is **no functional defect**; it is a test
isolation trap only. Not changed — doing so would edit an untouched v1.2.1 boundary for no runtime
benefit, against CP9's minimal-scope rule. Recorded as a post-CP9 cleanup candidate.

### Safety-critical areas the reviewer independently confirmed correct

Memoisation race (reference-equality guard handles concurrency), transient-DB-failure classification
(a pg connection error keeps `serverUnavailable`/retryable — only schema faults become the
deterministic 422), all production write paths preflight-equipped when the flag is on, the
reconciliation store being read-only, the `constraintAcceptsResponses` regex rejecting substring
false-positives, NodeNext `.js` ESM imports, `BinaryReviewPreflightError` name detection, and that
**only two routes write `review_events`**. Its flags-off verdict: **EQUIVALENT — byte-identical
v1.2.1 INSERT**, matching my own §2 finding.

## 9. Audit trail — what the independent pass changed

The read-only inventory audit (40 files, 16 API calls, 1184 s) produced **three accepted corrections**
to my own work, each re-verified at source before adoption:

1. `today/route.ts` **A→C** — the accuracy redefinition is unconditional, not flag-gated. This is now
   the headline Category C item.
2. `WordsScreen.tsx` **B→C** and `TodayScreen.tsx` **A→C** — unconditional label/tile changes.
3. Its open question "`LEARNBOX_TODAY_WORKLOAD` not confirmed in deployment config" was closed by a
   direct Production check: the flag is **absent** (all six `LEARNBOX_*` feature flags count 0).

Two of its implications were **rejected on evidence**: `ProfileScreen`/`SettingsScreen` are genuinely
flag-gated (C→A), and the `TodayScreen` minutes removal is cosmetic rather than a lost metric, because
that tile only ever rendered a value under `NODE_ENV === 'test'`.

Machine reconciliation of the final tables then caught **three bookkeeping defects I had introduced**
(3 duplicated rows across categories, 2 omitted files). Fixed; the inventory now closes at 41 unique
with zero unclassified. Lesson recorded: reconcile inventory counts programmatically against
`git diff --name-only`, never by inspection.

### Residual open question

Whether any **external** consumer reads `forgotCount` or `cardStates.review` cannot be determined from
this repository. Native/Dart is unchanged in CP9 and `MOBILE_REVIEW_SYNC_ENABLED` is absent in
Production, so no native client is live on these endpoints, and Admin is excluded per D-4. Residual
risk is low but **not formally proven zero**.

## 10. Production cutover attempt — ABORTED at Stage 2 gate (2026-10-02)

Owner authorized Category C (C-1…C-7) and Stages 0–6. Execution began and **aborted at the Stage 2
artifact-provenance gate** under global abort condition _"artifact/source/digest mismatch"_.
**Production was never modified**: image `learnbox-app:production`, `APP_SOURCE_SHA=4ade0a88…`,
compose unchanged, health `200`, migration ledger still `0022`, zero feature flags.

### Stage 0 — PASSED

Container `bd96b2335ca5`, image id `sha256:5370578d187c…`, `APP_SOURCE_SHA=4ade0a885fa93a418…`,
0 feature flags, health `200` twice. **R0 captured**: running image preserved under immutable tag
`learnbox-app:rollback-v121-20261002T103214Z` (id `sha256:5370578d187c…`, verified identical), plus
`.env.cp9-pre` and `compose.yaml.cp9-pre`.

Baseline fingerprint (read-only, migrator DSN, per-command injection per D-1): server PG **17.11**;
users **2**, cards **35**, card_schedules **31**, review_events **90**; `schema_migrations` max
`0022_reconcile_production_schema` (22 rows); `review_events.response` **absent**; 0023 tables
**absent**; grades `forgot 21 / hard 7 / mastered 32 / remembered 30`.

**C-1 arithmetic confirmed against live data:** old correct = `remembered` = 30/90 = **33.3%**;
new correct = `hard`+`remembered`+`mastered` = 69/90 = **76.7%**. Matches the ≈33%→≈77% projection exactly.

### Stage 1 — PASSED (R1 is a proven full-data rollback basis)

Host has **no `pg_dump`** (deviation D-A below). Used a pinned containerized client
`postgres:17-alpine` (`pg_dump 17.11`) — **exactly matching the 17.11 server**, no host packages installed.

Dump: `/home/ubuntu/learnbox/backups/cp9-20261002T103329Z.dump`, 480,780 bytes, 38 `TABLE DATA`
entries, `sha256 a2703d5a28e7b7aa5ef9a007e496f7fd24d0c1922d17c095e5fb8af1b857f9ca`.

**Restore verified immediately** into a throwaway container DB (never the live database), then destroyed:

| Table             | Live | Restored |
| ----------------- | ---- | -------- |
| users             | 2    | **2**    |
| cards             | 35   | **35**   |
| card_schedules    | 31   | **31**   |
| review_events     | 90   | **90**   |
| schema_migrations | 22   | **22**   |

`max(version)` = `0022_reconcile_production_schema` in both; grade distribution identical
(`forgot 21 / hard 7 / mastered 32 / remembered 30`); `review_events.response` absent in the restore,
confirming the backup is a true pre-0023 snapshot.

### Stage 2 — FAILED (hard abort, two defects)

**Defect A — BLOCKER: architecture mismatch.** The approved artifact is **`linux/arm64`**; the
Production host is **`x86_64`/amd64** (`docker info` → `x86_64/linux`; live image `linux/amd64`).
The digest transferred intact and matched
`sha256:9f14c7c8da9ee6b78cd1766929e400c7e57cbcd2cc1086765304cfa62b569dd2` byte-for-byte, but every
`exec` into it fails with `exec /usr/bin/sh: exec format error`. **The approved artifact cannot run on
Production.** Root cause: built locally on an arm64 Mac; the canonical Production build
(`/home/ubuntu/learnbox/deployments/build-4ade0a8.sh`) runs **on the host**, natively amd64.

**Defect B — BLOCKER: provenance.** The candidate baked `APP_SOURCE_SHA=unknown`; Production carries
`APP_SOURCE_SHA=4ade0a885fa93a418db8cde94b81a206bcd80860`. The Stage 3 gate requires
`APP_SOURCE_SHA=ff658a43…`, which this artifact **cannot satisfy** — `--build-arg APP_SOURCE_SHA` was
never passed. Deployed-artifact identity would be unprovable.

**Checked and NOT a defect — `NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED`.** The canonical v1.2.1
build passes this flag `=true` while the Dockerfile ARG defaults `false`, so an all-false rebuild would
have silently regressed a live learner feature. Read from both artifacts: candidate bundle inlines
`profileIdentityFlag:A="true"`, Production `profileIdentityFlag:k="true"` — **equal**, no regression.
This flag must be passed `=true` on any rebuild. D-2 state re-confirmed on the host image is moot for
the arm64 artifact and must be re-proven after rebuild.

### Deviations from the runbook (recorded even though harmless)

- **D-A:** Stage 1 used containerized `postgres:17-alpine` `pg_dump`/`pg_restore` because the host has
  no PostgreSQL client. Client version matches the server exactly (17.11); nothing installed on the host.
- **D-B:** Stage 0 added an immutable rollback tag `learnbox-app:rollback-v121-<ts>` — additive only
  (tagging the already-running image id), no traffic or config change. Strengthens R0, since the live
  `:production` tag is mutable.
- **D-C:** The candidate image was `docker load`ed onto the host before the arch defect was found. It is
  **inert** — not referenced by compose, not running. Removal is pending owner direction.

### Required fix (NOT executed — needs owner re-approval)

Rebuild the candidate **on the Production host** (native amd64) from source `ff658a43`, passing
`--build-arg APP_SOURCE_SHA=ff658a431d2e5ecd2f90a1f72f46ff83d0e6b6f6`,
`--build-arg NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=true`, and all other `NEXT_PUBLIC_*` false
(D-2). This necessarily produces a **new image digest**, so the previously approved digest is void and
the replacement requires explicit owner approval before Stage 3. Host capacity is adequate
(buildx 0.37.1, 2 vCPU, 13 GB free) but the host repo is at `3caf3077`, not `ff658a43`.

## 11. Stage-2 remediation — replacement amd64 artifact (2026-10-02, STILL PAUSED AT STAGE 2)

Owner authorized remediation only; Production stayed frozen throughout and was never modified.

### Third defect found during remediation (the most serious of the three)

The rejected artifact's source label was **not merely missing — it would have been false**. Commit
`ff658a43` does **not contain** `apps/api/src/reviews/binary-review-preflight.ts`
(`git cat-file -e ff658a43:… ` → absent), yet the arm64 image **does** contain
`/app/apps/api/dist/reviews/binary-review-preflight.js` with 6 `verifyBinaryReviewSchema` references
in the compiled store. Cause: the Docker build context is `.`, so the build consumed the **dirty
working tree** while the (unset) `APP_SOURCE_SHA` claimed `ff658a43`. Had the arg been passed as
`ff658a43` the artifact would have carried a _confidently wrong_ provenance label — worse than
`unknown`, which at least fails loudly.

**Remedy:** the CP9 work is now committed, so a build SHA honestly describes image contents.
Branch `feat/lb-b35-cp9-n1-preflight`, commit **`8b7b32905ccbae09977cd0c102df62cf79e58bd5`**
(19 files, +2294/−4). `tools/cp8/cp9-probe-run.sh` was **excluded via .gitignore** because it contains
a live staging DSN; staged-diff secret scan returned **0** DSN matches.

### Build-time flag matrix — derived, not assumed

See `docs/evidence/LB_B35_CP9_BUILD_FLAG_MATRIX.md`. All **9** source-referenced
`NEXT_PUBLIC_LEARNBOX_*` flags are classified, **zero unexplained**. Six are controlled by explicit
build args; **three** (`OTP_UI_ENABLED`, `ALPHA_INVITE_UI_ENABLED`, `PRIVATE_MEDIA_ENABLED`) have **no
Dockerfile ARG at all** and are provably _not_ build-inlined — their names **survive in the shipped
client chunks of both the live Production image and the candidate**, which only happens when Next
does not inline them. They resolve from in-code defaults, so parity is structural.

The decisive entry is `NEXT_PUBLIC_LEARNBOX_PROFILE_IDENTITY_ENABLED=true`: the canonical v1.2.1 build
passes `true` while the Dockerfile ARG defaults **false**, so "all NEXT_PUBLIC false" would have
silently disabled a live learner feature.

### Replacement build (reproducible cross-build, Production host untouched)

| Field              | Value                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source SHA         | `8b7b32905ccbae09977cd0c102df62cf79e58bd5`                                                                                                                                                                                         |
| Platform           | `linux/amd64` (`--platform`, BuildKit cross-build)                                                                                                                                                                                 |
| Builder            | `docker buildx v0.37.1 0b265a9f62db554fa9aba6dd19e1bd5704bc7d8a`, engine `29.8.1`                                                                                                                                                  |
| Image tag          | `learnbox-app:cp9-candidate-amd64`                                                                                                                                                                                                 |
| **New digest**     | **`sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`**                                                                                                                                                      |
| OCI revision label | `8b7b32905ccbae09977cd0c102df62cf79e58bd5`                                                                                                                                                                                         |
| Build args         | `APP_SOURCE_SHA=8b7b329…`, `PROFILE_IDENTITY_ENABLED=true`, `BINARY_REVIEW_UI=false`, `QUEUE_QUARANTINE=false`, `SERVER_SESSION_PLAN=false`, `GOAL_UX_REMOVED=false`, `SESSION_EXPIRY_UX=false`, `--provenance=false --sbom=false` |
| Script             | `/Users/test/.hermes/cache/scratch/cp9-rebuild.sh` (exit 0) — out-of-tree operator scratch path, recorded verbatim as run; not a repository artifact                                                                               |

Built on the development machine per owner preference; the Production VPS was **not** used and its
repository was **not** checked out or updated.

### Replacement artifact verification — 11/11 PASS

`tools/cp8/cp9-replacement-artifact-proof.sh` (all proofs re-run from scratch; **no evidence inherited**
from the rejected artifact):

| #   | Check                                                  | Result                                           |
| --- | ------------------------------------------------------ | ------------------------------------------------ |
| 1   | architecture is `linux/amd64`                          | PASS `linux/amd64`                               |
| 2   | OCI revision label = approved SHA                      | PASS `8b7b329…`                                  |
| 3   | runtime `APP_SOURCE_SHA` = approved SHA, not `unknown` | PASS `8b7b329…`                                  |
| 4   | binary review UI gate inlined FALSE (D-2)              | PASS `binaryWire:!1`                             |
| 5   | Profile Identity inlined TRUE (Production parity)      | PASS `profileIdentityFlag:A="true"`              |
| 6   | the 3 non-ARG flags remain runtime lookups             | PASS `3/3`                                       |
| 7   | runner stage has no `NEXT_PUBLIC_LEARNBOX` env         | PASS `count=0`                                   |
| 8   | N1 preflight compiled into the artifact                | PASS `present`                                   |
| 9   | preflight wired into the store                         | PASS `refs=6`                                    |
| 10  | **amd64 image starts and serves HTTP**                 | PASS `http=200`, Next.js 15.5.25 ready in 124 ms |
| 11  | running container reports the approved SHA             | PASS `8b7b329…`                                  |

Check 10 is the one the rejected artifact could never have passed — it proves **runnable on the
Production architecture**, not merely transferable.

### Architecture-discrepancy check (owner stop-condition) — none found

- Client bundles: **60 chunks in both** amd64 and arm64 builds, hashes identical; the only diff is
  Next's random build-ID directory name (`09cOEJq…` vs `TRre-NPD…`) in 2 manifest paths.
- Native binaries: only 2 `.node` files, both **x64** (`@img/sharp-linux-x64`,
  `@img/sharp-linuxmusl-x64`); ELF `e_machine=3e00` (x86-64) for both **and** for
  `/usr/local/bin/node`. No `@next/swc` native package in the runner. `node -p process.arch` → **x64**.
- Full suite on the committed source: **781 passed / 0 failed** (99 files).

No arm64 leakage, so no fallback to building on Production was needed.

### Production freeze re-verified after remediation

Container `bd96b2335ca5`, image `learnbox-app:production`, `APP_SOURCE_SHA=4ade0a88…`, compose
unchanged (`image: learnbox-app:production`), **0** feature flags, health `200`, ledger still `0022`.
Rollback assets intact: `learnbox-app:rollback-v121-20261002T103214Z` (`5370578d187c`, identical to the
live image) and the verified dump `cp9-20261002T103329Z.dump`. Host disk 66 % used (13 GB free), so the
inert arm64 candidate is retained as failure evidence per owner instruction.

### Status

**Paused at the Stage-2 gate.** The replacement artifact is verified but **not deployed** and **not
transferred to the host**. The previously approved digest `sha256:9f14c7c8…` is **rejected**; the new
digest `sha256:6318eb28…` requires explicit owner approval before Stage 3.

## 12. Independent adversarial review of the replacement artifact (2026-10-02)

Read-only reviewer, isolated context, no Production access (Decision B). Verdict: **PASS — 0 BLOCKER,
0 MAJOR, 6 MINOR.** Every material claim was re-verified in-parent before acceptance; one was
**rejected on evidence**.

### Confirmed clean by the reviewer (independently of my own checks)

Architecture (`linux/amd64`, both `.node` binaries ELF `0x3e`=x86-64, `uname -m`=`x86_64`, no
`darwin/*` or `arm64/*` paths); provenance (OCI label, runtime env and live `exec` all report
`8b7b329…`; compiled `binary-review-preflight.js` matches the committed `.ts`); the full 9-flag
matrix including the three non-ARG flags at `3/3`; feature parity (all five CP4/CP5 client flags off,
N1 inert until the operator sets `LEARNBOX_BINARY_REVIEW=true`); and that checks 8–9 cannot pass
vacuously.

A useful independent catch: `NEXT_PUBLIC_LEARNBOX_ADMIN_PASSKEY_UI_ENABLED` exists but is
**`apps/admin`-only**, which is not built into this image — so the 9-flag matrix remains complete for
this artifact.

### Finding REJECTED after in-parent verification

**"sharp is unreachable code; tighten `outputFileTracingRoot`" — WRONG, and the fix would have been
harmful.** The reviewer concluded `sharp` arrives only via an `apps/admin` transitive trace and is
never required at runtime. Verified otherwise: `sharp` is required by **Next.js itself** at
`next/dist/server/image-optimizer.js:208`, and the learner app imports `next/image` in **4
components** (`LaunchScreen`, `Bobo`, `TodayScreen`, `ProfileDetailsPanel`). It is _not_ a dependency
of `apps/website`/`apps/api` in `package.json` — which is exactly why it looked orphaned — but it is
reachable through Next's own optimizer. Excluding it would have broken production image optimization.
`outputFileTracingRoot` is left unchanged.

### Findings ACCEPTED and fixed in `tools/cp8/cp9-replacement-artifact-proof.sh`

| Severity | Finding                                                                               | Verified                                                                                                                                     | Fix                                                                                           |
| -------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| MINOR    | check 4 `binaryWire` grep scoped to `chunks/app/page-*.js`                            | Confirmed: exactly 1 chunk contains it today; a chunk split would yield a confusing false FAIL                                               | glob widened to the whole `chunks` tree                                                       |
| MINOR    | check 5 regex `[A-Za-z_$]{1,4}` breaks on a ≥5-char minified identifier               | Reproduced: `profileIdentityFlag:Abcde="true"` does **not** match; widened `[^=]{1,12}` matches both                                         | regex widened                                                                                 |
| MINOR    | check 10 label overstates what a non-`000` HTTP code proves                           | Reproduced: with an unreachable DB `/` returns **200** while `/api/health` returns **503**                                                   | label corrected to "Node binary starts and Next binds port (DB connectivity NOT proven here)" |
| MINOR    | no `.dockerignore`, so the gitignored staging-DSN file still enters the build context | Confirmed absent; `tools/` is in no `COPY`, so image content was never affected                                                              | content-neutral `.dockerignore` added (below)                                                 |
| MINOR    | `set -euo` missing                                                                    | Confirmed `set -uo pipefail` only; reviewer also confirmed **no current check can pass vacuously** (all capture via `$()`; empty ≠ expected) | left as-is deliberately: `-e` would abort on the intentional `                                |     | true` cleanup lines; risk is latent, not manifest |
| MINOR    | sharp adds ~4 MB                                                                      | Accepted as fact, but see rejected finding — it is **required**, not dead weight                                                             | no change                                                                                     |

### Two checks ADDED in response (suite now 14)

The critique of check 10 implied two invariants nothing was asserting:

- **check 12** — the API layer must be _reachable and fail gracefully_: with an unreachable DB,
  `/api/health` must return **503**, not hang or kill the process. Distinguishes "app works" from
  "static shell served while every route is dead". Verified: `health=503`.
- **check 13 — security invariant** — anonymous protected media must never return 200 from this
  artifact: `/api/content-media/abc/image` → **401**. Verified directly against the running amd64
  container. This is the owner's standing no-public-content rule, now proven at the artifact level
  rather than assumed from Production.
- **check 14** — container self-reports `x86_64`.

### `.dockerignore` — deliberately content-neutral

Every excluded path (`tools/`, `docs/`, `*.md`, `.git`, `.env*`, `*.dump`, `*.log`) is one the
Dockerfile never `COPY`s, so image content cannot change and the verified digest stays valid —
**proven by rebuilding with the file present and comparing digests**, not asserted.

`**/node_modules` and `**/.next` were **deliberately NOT excluded**: they sit inside the COPYd
directories (`COPY apps/website apps/website`, Dockerfile:25–28), so excluding them would change the
build context, void the verified digest and require a full re-verification cycle. Recorded as
next-cycle build hygiene rather than slipped in after Stage-2 verification.

## 13. Stage 3 PASSED / Stage 4 BLOCKED — Production cutover (2026-10-02)

### Pre-resume baseline recheck (read-only) — PASS

Live `4ade0a88`, 0 CP9 flags, health 200, anon media 401, ledger 22 rows / max `0022` / no `0023`,
disk 66%. **R0** `learnbox-app:rollback-v121-20261002T103214Z` image id `5370578d187c` = id of the
then-live `:production` tag. **R1** `cp9-20261002T103329Z.dump` sha256 `a2703d5a28e7…` — byte-identical
to the Stage-1 verified value — and proven _usable_, not merely present: `pg_restore --list` yields
**214 TOC entries** including `TABLE DATA` for `users`, `cards`, `card_schedules`, `review_events`,
`schema_migrations`.

### Stage 3 — deploy approved digest — **PASSED**

Artifact transferred by `docker save | ssh docker load`; host-side identity re-verified _on the
Production host_: digest `sha256:6318eb28…`, `linux/amd64`, OCI revision `8b7b329…`.

Deployed **by digest, not a mutable tag**: compose pinned to
`learnbox-app@sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`
(`stale_tag_refs=0`; digest resolved and `docker compose config` validated _before_ restart).
Pre-change `compose.yaml` and `.env` preserved as `*.cp9-pre` (**R3**).

| Gate                        | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| deployed `APP_SOURCE_SHA`   | `8b7b32905ccbae09977cd0c102df62cf79e58bd5` ✓                    |
| running image               | `sha256:6318eb28…` (= approved digest) ✓                        |
| container / restarts        | `1416a78823fc` healthy, `restarts=0` ✓                          |
| CP9 flags                   | `0` ✓ · Scheduler V2 `NONE_SET` ✓                               |
| health ×2                   | 200 / 200 ✓                                                     |
| anon protected media        | 401 ✓                                                           |
| arch in container           | `x86_64` ✓                                                      |
| error/5xx log hits (3m)     | `0` ✓                                                           |
| data fingerprints           | users 2 / cards 35 / schedules 31 / events 90 — **unchanged** ✓ |
| grades                      | forgot 21 · hard 7 · mastered 32 · remembered 30 — unchanged ✓  |
| C-1 accuracy                | old 30/90 → new **69/90 (76.7%)** = approved projection ✓       |
| duplicate `client_event_id` | 0 ✓ · orphan events 0 ✓                                         |
| auth/session                | anon `/api/auth/session` → `{"authenticated":false}`, no leak ✓ |

**Two self-corrections during the gate** (both my error, not Production's):

1. My first accuracy probe used a non-existent grade label `known_hard` (verified `n=0`) and returned
   `new_correct=62`, contradicting the baseline 69. Corrected SQL (`hard`/`remembered`/`mastered`)
   returns exactly **69** — baseline match. The discrepancy was in my query, never in the data.
2. `/login` returned 404. Rather than assume, I booted the **R0 v1.2.1 image** in isolation (no
   traffic) and diffed route lists: byte-identical, no `/login` route in v1.2.1 either. Pre-existing,
   not a cutover regression.

### Stage 4 — apply migration 0023 — **BLOCKED, stopped per abort conditions**

Two runbook deviations found and handled before applying:

- **D-D:** runbook names `dist/database/migrate.js --to 0023`; the artifact ships
  **`dist/database/run-migrations.js`** and the runner has **no `--to` flag** — it applies all
  pending. Rather than improvise, I proved the blast radius: shipped 23 vs applied 22, **pending set =
  exactly `{0023_learning_persistence}`**, and applied-but-not-shipped = **empty**. So "all pending"
  is provably identical to "only 0023".

**Failure:** the approved `learnbox_migrator` path cannot apply 0023.

```
error: must be owner of table users
code: 42501   routine: aclcheck_error   file: aclchk.c:2981
```

0023's first statement is `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text`. In PostgreSQL
`ALTER TABLE` requires **table ownership**, which is not implied by any `GRANT`. Role reality:

| Capability                                                       | `learnbox_migrator` |
| ---------------------------------------------------------------- | ------------------- |
| SELECT on `users`                                                | ✓                   |
| INSERT on `schema_migrations`                                    | ✓                   |
| CREATE in schema `public`                                        | ✓                   |
| superuser / createrole / bypassrls                               | ✗ ✗ ✗               |
| **owner of `users`** (all public tables owned by `neondb_owner`) | ✗                   |

So the role can create 0023's _new_ tables but cannot `ALTER` the _existing_ ones. This is a
provisioning gap in the approved path, not a defect in 0023 or the artifact.

**Abort was clean — zero partial application.** The runner is transactional and advisory-locked, and
it failed on the first statement:

| Post-failure check              | Value                        |
| ------------------------------- | ---------------------------- |
| ledger rows / max version       | 22 / `0022` (unchanged)      |
| `users.timezone` column         | 0                            |
| `review_events.response` column | 0                            |
| `learner_daily_plans` table     | 0                            |
| advisory locks held             | **0** (no stuck lock)        |
| data fingerprints               | 2 / 35 / 31 / 90 — unchanged |
| health / anon media             | 200 / 401                    |

### Current Production state (left deliberately)

The **Stage-3 artifact remains deployed** — Stage 3 passed its full gate and was authorized; all CP9
flags are OFF so every Category-A path is inert, and the artifact is designed to run on the pre-0023
schema. Rollback remains fully provable (R0 image, R1 verified dump, R3 config copies).

**Stages 5–6 not started.** Stage 5 depends on 0023 (`LEARNBOX_TZ_PERSIST` and the CP4 flags need the
new columns), and Stage 6 binary review would hit the N1 preflight and return 503 on a pre-0023
schema. Proceeding would violate the documented dependency order.

**Stage 7 remains NOT authorized; `LEARNBOX_SCHEDULER_V2` absent/OFF throughout.**

## 14. Stage 4 PASSED — migration 0023 applied to Production (2026-10-02)

Applied `2026-10-02T12:15:13Z` through the **canonical runner** (`run-migrations.js`), no hand-applied
SQL, using a one-time elevated DSN supplied by the owner through a guided hidden-entry script. The
credential was held only in `/dev/shm` (dir 0700, file 0600), passed on **stdin** (never argv, never an
env var, never a repo file), and shredded on exit. It is not in compose, not in `.env`, not persistent.
`/dev/shm` residue after the run: **0**.

### Elevated role sufficiency (pre-execution gate)

```
role=neondb_owner is_superuser=false alterable_targets=2/2
```

Negative control proved the gate works: feeding the insufficient `learnbox_migrator` DSN produced
`alterable_targets=0/2` and exit 3 with **zero** schema/ledger/data change.

### OWNERSHIP_CHANGED=YES — investigated, BENIGN

The script's `diff` compared a snapshot of ALL `public` tables. Both diff directives were **appends**
(`19a20`, `30a32`), i.e. new lines only — not modifications. Independently confirmed:

| Assertion                                          | Result                       |
| -------------------------------------------------- | ---------------------------- |
| total public tables                                | 40 (38 pre-existing + 2 new) |
| pre-existing tables still present                  | **38**                       |
| tables NOT owned by `neondb_owner`                 | **0**                        |
| tables owned by `learnbox_migrator`/`learnbox_app` | **0**                        |
| 0023 text containing `OWNER TO`                    | **0 occurrences**            |

Verdict: no pre-existing table changed owner. The comparison was too coarse (it included newly created
tables, which by definition cannot appear in a "before" snapshot). The check, not Production, was wrong.

### Ledger and checksum

| Assertion            | Expected                                                           | Actual                          |
| -------------------- | ------------------------------------------------------------------ | ------------------------------- |
| ledger rows          | 22 -> 23                                                           | **23**                          |
| max version          | `0023_learning_persistence`                                        | ✓                               |
| recorded checksum    | `ef364bd54dae164a28975d0c8e3f88ddf077aa8bdaeff6abd7321cd3eebc9b4e` | ✓ identical to repo file        |
| applied_at           | —                                                                  | `2026-10-02 12:15:13.677971+00` |
| advisory locks after | 0                                                                  | **0**                           |

### Schema assertions (all positive)

- `users.timezone` = `text`, nullable, default NULL ✓
- `review_events.response` = `text`, nullable, default NULL ✓
- `review_events.engine_version` = `smallint`, nullable, default NULL ✓
- `learner_daily_plans` 5 columns, PK `(user_id, local_day)`, `new_card_ids uuid[]` default `'{}'` ✓
- `review_event_rejections` 5 columns, `bigserial` PK, bounded `reason` CHECK ✓
- 3 CHECK constraints present with exact expected definitions ✓
- `review_event_rejections_user_idx` = `btree (user_id, received_at DESC)` ✓
- 2 FKs to `users` with ON DELETE CASCADE ✓
- grade CHECK still the original four values — **untouched** ✓

### Historical data — nothing backfilled, nothing rewritten

| Assertion                                      | Value                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| users / cards / card_schedules / review_events | **2 / 35 / 31 / 90** (identical to baseline)                           |
| `review_events.response` non-NULL              | **0**                                                                  |
| `review_events.engine_version` non-NULL        | **0**                                                                  |
| `users.timezone` non-NULL                      | **0**                                                                  |
| grade distribution                             | forgot:21, hard:7, mastered:32, remembered:30 (identical)              |
| new tables row counts                          | 0 / 0                                                                  |
| duplicate `(client_event_id, user_id)`         | 0                                                                      |
| `occurred_at` range                            | `2026-09-24 20:32:55.192+00 .. 2026-09-30 19:17:07.426+00` (unchanged) |
| C-1 accuracy                                   | old 30/90, new 69/90 — as approved                                     |

### Runtime after migration

image digest `sha256:6318eb28…`, `APP_SOURCE_SHA=8b7b32905ccbae09977cd0c102df62cf79e58bd5`,
restarts 0, health 200 x3, anon protected media 401, anon session `{"authenticated":false}`,
0 error/5xx log hits. All six CP9 flags ABSENT in container and `.env` (`env_flag_lines=0`).
**`LEARNBOX_SCHEDULER_V2` ABSENT — Scheduler V2 OFF.**

0023's runtime grants verified effective: `learnbox_app` can read the two new tables
(ACL `learnbox_app=ar/neondb_owner` = SELECT+INSERT only, no UPDATE, no DELETE).

### Findings recorded (NOT Stage-4 blockers, NOT caused by CP9)

**P1 — `learnbox_migrator` cannot run `ALTER TABLE`.** PostgreSQL requires table _ownership_ for
`ALTER TABLE`; no GRANT confers it. Every `public` table is owned by `neondb_owner`, so the
least-privilege migrator can create new objects but not alter existing ones. This made an elevated
one-time DSN necessary for Stage 4. Infrastructure/provisioning design issue for a later dedicated
fix (do not redesign roles during a cutover).

**P2 — `learnbox_app` holds `arwd` (incl. UPDATE/DELETE) on `users`, `review_events`,
`card_schedules`.** Wider than the append-only intent. **Not caused by 0023**: the ledger checksum
proves the executed SQL was byte-identical to the repo file, whose only GRANTs are `SELECT, INSERT`
on the two _new_ tables plus sequence USAGE. The broad grant pre-dates CP9 (out-of-band LB-B30 role
split). Recorded for the same dedicated provisioning fix.

### Deviation D-E

While probing P2 I executed `update review_events set response='known' where false` as a privilege
test. The `where false` predicate affects **zero** rows; re-verified afterwards that
`response` non-NULL = 0 and all counts/grades are unchanged. No Production data was modified, but a
write statement was issued against a Production table — disclosed rather than omitted.

**STAGE 4 GATE: PASSED.** Stage 5 not started.

## 15. Stage 5 PASSED — CP4 server flags activated incrementally (2026-10-02)

Four flags activated **one at a time**, in the runbook's dependency order, each with its own
before/after evidence gate and its own rollback point. No batching, no collapsed steps.

### Deviation D-F — no systemd unit exists for the app

The runbook says each flag must be added to **both** `.env` and the systemd unit's `Environment=`.
On this host there is **no `learnbox-app.service`** — `systemctl status learnbox-app` reports
"could not be found". The app is managed purely by Docker Compose with `env_file: .env`. The only
`learnbox-*` units are the backup/error-scan/restore-drill/uptime-monitor timers, none of which run
the app. The "both places" instruction is therefore inapplicable; `.env` + container recreate is the
complete and only activation path. Verified live in-container after every single flag.

### Per-flag results

Fingerprint format: `users|cards|scheds|events|ldp|rer|resp_set|engine_set|tz_set|grades|events_md5|scheds_md5`

Baseline, and identical after **every** flag:
`2|35|31|90|0|0|0|0|0|forgot:21,hard:7,mastered:32,remembered:30|273f88ecf29ffc3c656abd348c9772c8|5f6282e276ac1bd003a6b941581ea7cc`

The last two components are **content hashes**, not counts — they detect a silent rewrite of any
review event id or any `(stability_days, due_at)` schedule value, which counts alone would miss.

| #   | Flag                           | before | after  | container      | health | fp change | errors | GATE     |
| --- | ------------------------------ | ------ | ------ | -------------- | ------ | --------- | ------ | -------- |
| 1   | `LEARNBOX_TZ_PERSIST`          | ABSENT | `true` | `4062928e28a8` | 200×3  | none      | 0      | **RC=0** |
| 2   | `LEARNBOX_SERVER_SESSION_PLAN` | ABSENT | `true` | `e1fdea3b97ad` | 200×3  | none      | 0      | **RC=0** |
| 3   | `LEARNBOX_TODAY_WORKLOAD`      | ABSENT | `true` | `8a7f3320af2e` | 200×3  | none      | 0      | **RC=0** |
| 4   | `LEARNBOX_QUEUE_QUARANTINE`    | ABSENT | `true` | `040cd572dfff` | 200×3  | none      | 0      | **RC=0** |

Each gate asserted: flag live in-container, fingerprint byte-identical, Scheduler V2 ABSENT, and
image digest still `sha256:6318eb28…` (drift check). Every flag was additive — the live set grew
1 → 2 → 3 → 4, never replaced.

### Writes: zero, synthetic or real

`learner_daily_plans = 0` and `review_event_rejections = 0` after all four activations, and all
pre-existing counts/hashes unchanged. **No synthetic or test writes were made to Production during
Stage 5**, and no real learner data was altered. The distinction the owner asked for is therefore
trivially satisfied: the write count of both kinds is zero.

### Consolidated state after all four

- image digest `sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`
- `APP_SOURCE_SHA=8b7b32905ccbae09977cd0c102df62cf79e58bd5`
- compose still **digest-pinned**; mutable-tag refs **0**
- restarts **0**, container health `healthy`, no orphan containers from the 4 recreates
- 90-second soak: health **200 ×6**, `/` 200, anon media **401**
- error/5xx hits across the entire 20-minute Stage-5 window: **0**
- `.env`: 28 keys = 24 original + 4 flags, **0** duplicate keys, `DATABASE_URL` intact, perms `600 ubuntu:ubuntu`
- authenticated learner endpoints still require auth: `/api/learner/{today,state,profile}` → **401** anon
- `LEARNBOX_SCHEDULER_V2` **ABSENT** · `LEARNBOX_BINARY_REVIEW` **ABSENT**

### Client twins remain off (server-only activation)

`SERVER_SESSION_PLAN` and `QUEUE_QUARANTINE` also have `NEXT_PUBLIC_*` client counterparts. Those are
**build-time baked false** in this artifact: 0 runtime `NEXT_PUBLIC_*` vars for them in the container
and 0 mentions in the served HTML. Stage 5 changed **server behaviour only** — consistent with D-2.

### Rollback readiness (R5) — verified as a chain, not just "files exist"

| Backup                                     | flags inside | DATABASE_URL |
| ------------------------------------------ | ------------ | ------------ |
| `1_LEARNBOX_TZ_PERSIST_env.bak-*`          | 0            | ✓            |
| `2_LEARNBOX_SERVER_SESSION_PLAN_env.bak-*` | 1            | ✓            |
| `3_LEARNBOX_TODAY_WORKLOAD_env.bak-*`      | 2            | ✓            |
| `4_LEARNBOX_QUEUE_QUARANTINE_env.bak-*`    | 3            | ✓            |
| current `.env`                             | 4            | ✓            |

A perfect 0→1→2→3→4 ladder in `/home/ubuntu/learnbox/cp9-stage5/`, so **any** flag can be rolled back
to its exact prior state. R0 image, R1 dump (480780 B), R3 compose backup all still present.

### Limitation stated plainly

These gates prove **activation safety**: the flags are live, the service is healthy, no data moved,
no errors. They do **not** prove authenticated end-to-end learner behaviour for each flag — that
needs a real logged-in session, which is Stage 6's scripted real-account observation (D-3). No
behavioural claim beyond the evidence is made here.

**STAGE 5 GATE: PASSED.** Stage 6 not started.

## 16. Stage 6 — LEARNBOX_BINARY_REVIEW activated; E2E proven on post-0023 staging (2026-10-02)

### 16.1 Baseline re-verified before the change

| Item                     | Required                | Observed                                               |
| ------------------------ | ----------------------- | ------------------------------------------------------ |
| Image digest             | `sha256:6318eb28…dfa0c` | MATCH (compose digest-pinned, 0 mutable-tag refs)      |
| `APP_SOURCE_SHA`         | `8b7b3290…58bd5`        | MATCH                                                  |
| Migration ledger         | 23 / `0023`             | MATCH                                                  |
| Stage-5 flags            | exactly 4 ON            | MATCH                                                  |
| `LEARNBOX_BINARY_REVIEW` | OFF/absent              | ABSENT                                                 |
| `LEARNBOX_SCHEDULER_V2`  | OFF/absent              | ABSENT                                                 |
| Service                  | healthy                 | healthy, restarts 0, health 200                        |
| Rollback R0/R1/R3/R5     | intact                  | image 1, dump 480780 B, compose present, 4-step ladder |

### 16.2 Activation (flag 5, same gated harness as Stage 5)

`LEARNBOX_BINARY_REVIEW`: ABSENT → `true`, container `32070c3b5fb2`, GATE_RC=0.
Fingerprint before == after: `2|35|31|90|0|0|0|0|0|forgot:21,hard:7,mastered:32,remembered:30|273f88ec…|5f6282e2…`.
No 503 and zero preflight errors after activation — N1 satisfied because 0023 is applied (Stage 4).

### 16.3 Flag semantics (read from the deployed source)

`LEARNBOX_BINARY_REVIEW` is **permissive-only**: it sets `binaryResponses` in the wire parser, allowing
a `response` field to be _accepted_. It changes no scheduling and writes no column by itself. With
`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=false` (D-2) the learner UI never sends `response`, so the
learner-visible behaviour of the web client is unchanged by this activation.

### 16.4 Binary-review E2E — 21/21 PASS (post-0023 schema, real compiled store)

Harness `tools/cp8/cp9-stage6-binary-e2e.mjs` against a fresh isolated DB `lb_cp9_s6`
(port-55443 guard, migrations 0001–0022 + 0023, 35 real cards), using the **same compiled
`PostgresReviewEventStore` and preflight as the deployed artifact**:

- binary KNOWN / UNKNOWN accepted, persisted once, `response` stored exactly
- idempotent exact replay = no duplicate
- replay with a _different_ payload on the same `clientEventId` → `ReviewIdempotencyConflictError`, stored response **not** overwritten (anti-tamper)
- schedules attributable to the scripted synthetic account only
- no legacy row gained a `response`
- v1.2.1 grade-only path still accepted; grade-only row keeps `response = NULL` (no silent default)
- missing-schema → deterministic `BinaryReviewPreflightError` (non-retryable)
- transient DB error (`57P01`) NOT misreported as deterministic (stays retryable)
- flag OFF → `response` item refused at item level; flag ON → accepted with shadow grade
- **CONTROL assertion** included so a malformed fixture cannot produce a vacuous pass
- synthetic rows fully deleted afterwards

### 16.5 Production write accounting — Stage 6 window

| Class                                                                  | Count                                        |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| Authorized scripted-account writes **on Production**                   | **0** (none attempted)                       |
| Real learner activity during the window                                | **0**                                        |
| `review_events` with `applied_at` > window start                       | 0                                            |
| `card_schedules` with `updated_at` / `last_reviewed_at` > window start | 0 / 0                                        |
| `learner_daily_plans` / `review_event_rejections`                      | 0 / 0                                        |
| Newest Production event                                                | `2026-09-30 19:17:07+00` (before the window) |

All scripted writes were made on the isolated staging DB and are ledgered there
(3 events, 2 schedules, synthetic user, all cleaned up). No learner history was deleted or rewritten.

### 16.6 Integrity fingerprints (Stage-5 formula, identical expression)

| Metric                                        | Before                                        | After      |
| --------------------------------------------- | --------------------------------------------- | ---------- |
| users/cards/schedules/events                  | 2/35/31/90                                    | 2/35/31/90 |
| response / engine_version / timezone non-NULL | 0/0/0                                         | 0/0/0      |
| ldp / rer                                     | 0/0                                           | 0/0        |
| grades                                        | forgot:21, hard:7, mastered:32, remembered:30 | identical  |
| `events_md5`                                  | `273f88ecf29ffc3c656abd348c9772c8`            | identical  |
| `scheds_md5`                                  | `5f6282e276ac1bd003a6b941581ea7cc`            | identical  |

### 16.7 Boundaries and soak

Soak 90 s: health `200 200 200 200 200 200`, restarts 0, healthy.
anon media **401**, anon `POST /api/learner/reviews` **401**, foreign-origin **403**,
`/api/reviews/mobile` **503** (native isolation holds, `MOBILE_REVIEW_SYNC_ENABLED` absent),
`binaryWire` mentions in served HTML **0**, error/preflight hits **0**.
`.env`: 29 keys, 0 duplicates, 1 `DATABASE_URL`.

### 16.8 Deviation D-G — Production real-account observation NOT performed (BLOCKER for the D-3 gate)

The runbook's Stage 3-OBS requires **N = 20** binary reviews through the real web client on a
_dedicated owner-approved test account_. **No such account exists on Production.** The only two
accounts are real learners (`451b0433…` 58 events, `b4efb0a4…` 32 events), and prior approved
evidence explicitly forbids mutating `451b0433…`. Additionally `LEARNBOX_OTP_TEST_UI_ENABLED=false`
and `SMS_IR_ENABLED=true`, so a new account would need a real SMS OTP.

Therefore the **N=20 Production event-count gate is NOT satisfied**. Elapsed-time observation was
_not_ substituted for it. The binary path is proven on a byte-identical post-0023 schema with the
same compiled store, which is strong but is **not** the Production authenticated-client proof.

### 16.9 Stage 6 status

Activation, isolation, integrity and rollback: **PASS**.
D-3 Production real-account observation: **NOT PERFORMED** (no approved test account).
Stage 6 is therefore submitted as **PASS-WITH-EXCEPTION**, owner to rule on D-G.

### 16.10 Stage 7 readiness (not authorization)

Technically ready to _consider_: 0023 applied, binary path proven, flags stable, rollback intact.
Still blocking: **D16** — `apps/mobile/lib/features/sync/http_review_sync_transport.dart` must treat
422 `schedulerRejected` as non-retryable with tests. `LEARNBOX_SCHEDULER_V2` remains ABSENT.

## 17. Stage 6 / D-G — D-3 observation BLOCKED by the baked UI flag (2026-10-02)

Owner authorized using an existing owner account (`b4efb0a4…` as test, `451b0433…` as control) and
forbade creating a third account. Baselines were captured and the account question is resolved — but
a **different, hard blocker** stops the N=20 run. **No Production write was made.**

### 17.1 Baseline re-verified (read-only, unchanged)

digest `sha256:6318eb28…dfa0c` · `APP_SOURCE_SHA=8b7b3290…58bd5` · ledger **23** · container
`32070c3b5fb2` healthy · 5 flags ON (`TZ_PERSIST`, `SERVER_SESSION_PLAN`, `TODAY_WORKLOAD`,
`QUEUE_QUARANTINE`, `BINARY_REVIEW`) · `LEARNBOX_SCHEDULER_V2` **ABSENT** · health 200.

### 17.2 Pre-test fingerprints — BOTH owner accounts (immutable baseline for this window)

|                                    | test `b4efb0a4…` (Mona)                     | control `451b0433…` (بهرام)                   |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------- |
| events                             | **32**                                      | **58**                                        |
| response / engine_version non-NULL | 0 / 0                                       | 0 / 0                                         |
| events md5                         | per-account captured                        | per-account captured                          |
| grades                             | forgot:3, hard:1, mastered:21, remembered:7 | forgot:18, hard:6, mastered:11, remembered:23 |
| schedules (due now)                | **15** (15)                                 | **16** (16)                                   |
| scheds md5                         | `8793e62b2ca74e900a750459586f1dd7`          | `a6cd0e28db1518708fae05a9f2c21013`            |
| timezone                           | NULL                                        | NULL                                          |

Global: users 2, cards 35, schedules 31, events 90, `events_md5 273f88ec…`,
`scheds_md5 5f6282e2…`, `learner_daily_plans` 0, `review_event_rejections` 0.
The two accounts are distinguishable by id, name, counts and distinct schedule md5s.

### 17.3 BLOCKER (D-H): the approved artifact cannot emit a binary answer from the browser

`apps/website/app/LearnerHome.tsx:96` reads the flag as a direct member expression:

```
const binaryReviewUiEnabled = process.env.NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI === 'true';
```

Next.js **inlines `NEXT_PUBLIC_*` at build time**, so the approved CP9 build (`UI=false`, D-2)
compiled the literal `false` and the bundler dead-code-eliminated the binary branch.

Measured on the running container `32070c3b5fb2`:

| Probe                                                           | Result                                                           | Meaning                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `grade-grid-binary` in client chunk `page-52b0acd350b36071.js`  | **0**                                                            | binary branch eliminated                         |
| `grade-grid-binary` in server bundle `.next/server/app/page.js` | **0**                                                            | eliminated server-side too                       |
| binary instruction `این واژه را بلد بودی؟` in bundles           | **0 files**                                                      | binary UI not shipped                            |
| four-grade instruction `چقدر یادت آمد؟` in bundles              | **2 files / present**                                            | four-grade UI is the live branch                 |
| `بلد بودم` / `بلد نیستم` labels                                 | present, but only inside the inert `binaryAnswers` array literal | strings retained as data; no branch renders them |
| `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI` at runtime              | **ABSENT (0)**                                                   | not overridable at runtime                       |

Consequently the browser renders the **four-grade** UI, and `flushWebReviewQueue` receives
`binaryWire: false`, so the web client sends `grade` only and **never** a `response` field.

### 17.4 Why no substitute was used

The authorized D-3 path is browser/UI → web client → HTTP route → service → store → Production
PostgreSQL, with both «بلد بودم» and «بلد نیستم» exercised. On this artifact that path cannot
produce a `response` at all. Direct API calls, in-process handlers, staging writes, synthetic
inserts and elapsed-time observation are all explicitly excluded, so **no alternative is permitted**
and none was attempted.

Twenty four-grade reviews were also **not** generated: they would not exercise known/unknown
mapping (so would not satisfy D-3), yet would permanently alter real owner learner history and
schedules — and deletion/reset is not authorized by the current instruction.

### 17.5 What satisfying D-3 would require (owner decision, outside Stage 6 scope)

Rebuilding the artifact with `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=true`, which would
(a) reverse owner decision **D-2**, (b) produce a **new image digest** needing re-approval and a
fresh 14/14 artifact proof, and (c) require a new Production deployment. That is a new
build + cutover, not part of Stage 6. Not performed.

### 17.6 Status

`LEARNBOX_BINARY_REVIEW` (server) remains correctly ON and verified permissive-only.
Stage 6 stays **OPEN / PASS-WITH-EXCEPTION**; **D-G cannot be satisfied on the deployed artifact**
and is superseded by blocker **D-H**. Production unchanged this step: events 90,
`events_md5 273f88ec…`, `scheds_md5 5f6282e2…`, zero writes.

## 18. CP9 CLOSED — server-side Production cutover complete; D-3 DEFERRED (2026-10-02)

Owner decision: **Option C**. No UI rebuild/redeploy in CP9. D-H accepted as the explanation for why
D-3 cannot execute against the approved artifact. **D-3 is DEFERRED, not waived and not passed.**

### 18.1 Precise classification

| Statement                                                           | Status                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Server-side `LEARNBOX_BINARY_REVIEW=true` deployed, permissive-only | **TRUE — verified**                                                       |
| Deployed learner UI                                                 | **legacy four-grade UI**                                                  |
| Production browser binary-review observation                        | **NOT PERFORMED**                                                         |
| 21/21 isolated E2E/store/wire proof                                 | **valid for the server-side binary path only — NOT a substitute for D-3** |
| Production learner history modified to manufacture evidence         | **NO — zero writes**                                                      |

### 18.2 Final Production state (re-verified at closure)

| Item                                    | Value                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Image digest                            | `sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`                                                |
| `APP_SOURCE_SHA`                        | `8b7b32905ccbae09977cd0c102df62cf79e58bd5`                                                                               |
| Compose pinning                         | digest-pinned (1), mutable-tag refs **0**                                                                                |
| Container                               | `32070c3b5fb2`, healthy, restarts **0**                                                                                  |
| Migration ledger                        | **23**, max `0023_learning_persistence` (read as `learnbox_migrator`)                                                    |
| 0023 objects                            | `users.timezone` 1, `review_events.response` 1, `engine_version` 1, `learner_daily_plans` 1, `review_event_rejections` 1 |
| Table ownership                         | tables NOT owned by `neondb_owner`: **0**                                                                                |
| Server flags ON (exactly 5)             | `TZ_PERSIST`, `SERVER_SESSION_PLAN`, `TODAY_WORKLOAD`, `QUEUE_QUARANTINE`, `BINARY_REVIEW`                               |
| `LEARNBOX_SCHEDULER_V2`                 | **ABSENT**                                                                                                               |
| `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI` | **false (baked)**; runtime var ABSENT                                                                                    |
| `.env`                                  | 29 keys, 0 duplicates, 1 `DATABASE_URL`                                                                                  |

Security/health: health **200**, root **200**, anon media **401**, anon POST reviews **401**,
foreign origin **403**, `/api/reviews/mobile` **503**, anon session `{"authenticated":false}`,
error hits in last 60 min **0**.

### 18.3 Binary UI absence proven structurally (not by surviving strings)

Earlier counts of the Persian instruction string were unreliable because nested shell quoting
corrupted the pattern (it reported 10 files). Re-measured with `grep -lF -f <pattern-file>`:

| Probe                                                          | Result                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| binary instruction `این واژه را بلد بودی؟` anywhere in `.next` | **0 files**                                                              |
| four-grade instruction `چقدر یادت آمد؟`                        | **2 files** (live branch)                                                |
| `grade-grid-binary` in served JS (`static/chunks`, `server/`)  | **0**                                                                    |
| `grade-grid-binary` anywhere                                   | **1 file — `static/css/4a0fab1f973c7b80.css`** (an unused CSS rule only) |

So the binary branch is absent from every executable bundle; only a dead CSS rule and the inert
`binaryAnswers` string array survive. The UI cannot emit `known`/`unknown`.

### 18.4 Both owner-account fingerprints — PRESERVED, unchanged

|                     | test `b4efb0a4…` (Mona)                        | control `451b0433…` (بهرام)                    |
| ------------------- | ---------------------------------------------- | ---------------------------------------------- |
| events              | **32**                                         | **58**                                         |
| events md5          | `d105b78e4d93051ccea2ff45468d2a3c`             | `3da4b6537766f8b285ef256a46f477a7`             |
| `response` non-NULL | 0                                              | 0                                              |
| schedules           | **15**, md5 `8793e62b2ca74e900a750459586f1dd7` | **16**, md5 `a6cd0e28db1518708fae05a9f2c21013` |

Global: users 2, cards 35, schedules 31, events 90, response/engine_version/timezone non-NULL 0/0/0,
`learner_daily_plans` 0, `review_event_rejections` 0, grades `forgot:21, hard:7, mastered:32,
remembered:30`, `events_md5 273f88ec…`, `scheds_md5 5f6282e2…`. Newest event
`2026-09-30 19:17:07+00` — predates all CP9 activity. **Neither account deleted or reset.**

### 18.5 Rollback artifacts still available

R0 `learnbox-app:rollback-v121-20261002T103214Z` (1) · R1 `cp9-20261002T103329Z.dump` **480780 B** ·
R3 `compose.yaml.cp9-pre` present · R5 `.env` ladder **5 steps** (0→1→2→3→4 flags, each retaining `DATABASE_URL`).

### 18.6 CP9 result

**CLOSED.** Server-side Production cutover (Stages 0–6) complete: artifact deployed, migration 0023
applied, five CP4/CP9 server flags active, zero data movement, rollback intact.
**D-3 explicitly DEFERRED** to the release that ships `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=true`
(blocker **D-H**). Stage 7 / Scheduler V2 **not authorized, not started**; `LEARNBOX_SCHEDULER_V2`
remains ABSENT.

## 19. MANDATORY FUTURE GATE — Binary UI Activation (D-3 deferred target)

This checkpoint **must not be called PASS until D-3 actually passes**. All ten requirements are
mandatory:

1. Build an approved Production artifact with `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI=true`.
2. Prove the binary UI is **present in the built artifact structurally** — assert
   `grade-grid-binary` and the binary instruction string appear in the **served JS bundles**
   (`static/chunks`, `server/app/page.js`), not merely that labels or CSS survive. Surviving
   strings/CSS are NOT acceptable proof (see §18.3).
3. Run the full artifact/security/regression verification for the **new digest** (14/14 artifact
   proof, full suite, anon-media 401, foreign-origin 403, native-route isolation).
4. Deploy only after **explicit owner approval of that exact digest**.
5. Test account `b4efb0a4…` (Mona); control `451b0433…` (Bahram) — unless a new verified reason changes it.
6. Execute D-3: **N=20** reviews through the real authenticated Production path
   browser/UI → web client → HTTP route → service → store → Production PostgreSQL.
   No direct API calls, in-process handlers, staging writes, synthetic inserts, or elapsed-time substitutes.
7. Exercise **both** «بلد بودم» / known and «بلد نیستم» / unknown — not 20 identical answers.
8. Maintain exact event-by-event accounting: `clientEventId`, submitted response, persisted response,
   shadow/legacy grade, event identity, schedule before/after, due/stability transition,
   Today/session-plan change, queue disposition, idempotency/replay result.
9. Prove the **control account remains fingerprint-identical** throughout the window.
10. Verify Today/session-plan/queue coherence, refresh/reload persistence (no duplicates),
    idempotency, response↔shadow-grade mapping, and **zero unexplained Production writes**.

Baselines captured 2026-10-02 for use as the starting point are in §18.4.
