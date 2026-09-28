# LearnBox v1.1 — Backlog Deep-Dive & Scope Options

> **Planning snapshot — NOT a second canonical backlog.**
> The canonical backlog remains [`BACKLOG.md`](../../BACKLOG.md) at the repository root.
> This document is decision-support analysis for choosing v1.1 scope. Where this
> document and `BACKLOG.md` disagree, `BACKLOG.md` wins.

| Field                 | Value                                        |
| --------------------- | -------------------------------------------- |
| Snapshot date         | 2026-09-28                                   |
| Analysed backlog      | 21 normalized items (LB-B01 … LB-B21)        |
| Shipped application   | `v1.0.0` → `2acdcef4`                        |
| Production image      | `sha256:4e008803b22c…`                       |
| Repository visibility | PRIVATE (LB-B10 containment)                 |
| Repository HEAD       | `33131ec6`                                   |
| Mode                  | Analysis / planning only — no implementation |

---

## 1. Executive summary

v1.0.0 is live and its **application security boundary is sound**: authenticated
protected media returns `200` with `private, no-store`, anonymous returns `401`,
public/static paths return `404`. Nothing in this backlog indicates a broken
learner experience in production.

The backlog's real centre of gravity is **operational maturity, not product
features**. The two highest-value items (LB-B01 automated database backups,
LB-B02 monitoring/alerting) were verified absent by direct read-only inspection
of the production host: no backup timer, no backup cron, no monitoring agent, no
error-tracking dependency anywhere in the codebase. LearnBox currently has live
users and **no automated way to detect an outage or recover lost data**. That is
the defining risk of the post-launch period.

A focused stabilization release is therefore well supported by evidence. A
notable finding is that several items are **smaller than their backlog rows
suggest** — OTP resend and rate limiting already exist server-side (LB-B08), and
LB-B03's 503 has a proven one-variable root cause. Conversely one item is
**larger** than recorded: LB-B09's stale lifecycle flags are asserted across
~30 files, so it is a genuine multi-file change, not a one-line edit.

Recommendation: **Option B**.

---

## 2. Authoritative 21-item backlog snapshot

Read from `BACKLOG.md` at HEAD `33131ec6`. No duplicates, no contradictions, no
obsolete items found. All 21 IDs preserved.

| ID     | Title                                                       | Category        | Priority           |
| ------ | ----------------------------------------------------------- | --------------- | ------------------ |
| LB-B01 | No automated database backup schedule                       | INFRA/OPS       | P1                 |
| LB-B02 | No monitoring, alerting or uptime checks                    | INFRA/OPS       | P1                 |
| LB-B03 | Learner Profile endpoint returns 503                        | PRODUCT DEBT    | P2                 |
| LB-B04 | No account deletion, privacy notice or support route        | PRODUCT DEBT    | P1                 |
| LB-B05 | Starter audio is synthetic TTS                              | CONTENT/QUALITY | P2                 |
| LB-B06 | Learning media ships inside the application image           | INFRA/OPS       | P2                 |
| LB-B07 | SMS.ir OTP delivery latency is variable                     | INFRA/OPS       | P2                 |
| LB-B08 | No OTP delivery-failure recovery path for users             | PRODUCT DEBT    | P2                 |
| LB-B09 | Canonical media manifest still records pre-activation flags | TECH DEBT       | P2                 |
| LB-B10 | Protected assets were anonymously downloadable              | SECURITY        | **P0 — CONTAINED** |
| LB-B11 | Progress analytics are device-local, not server-backed      | PRODUCT DEBT    | P3                 |
| LB-B12 | Personal vocabulary is device-local with a 30-word cap      | PRODUCT DEBT    | P3                 |
| LB-B13 | Admin panel operations incomplete                           | PRODUCT DEBT    | P2                 |
| LB-B14 | Accessibility matrix not exercised                          | TECH DEBT       | P2                 |
| LB-B15 | Content Factory AI generation incomplete                    | FUTURE FEATURE  | P3                 |
| LB-B16 | Native Android / Cafe Bazaar release                        | FUTURE FEATURE  | P3                 |
| LB-B17 | Payments, premium packs and entitlements                    | FUTURE FEATURE  | P3                 |
| LB-B18 | Native iOS / StoreKit                                       | FUTURE FEATURE  | P3                 |
| LB-B19 | Notifications and reminders                                 | FUTURE FEATURE  | P3                 |
| LB-B20 | Leagues, social, gamification, theming                      | FUTURE FEATURE  | P3                 |
| LB-B21 | Stale prototype/alpha language across documentation         | DOCUMENTATION   | P3                 |

---

## 3. Backlog dossiers

### LB-B01 — No automated database backup schedule

- **Category / Priority:** INFRA/OPS · P1 · **Confidence: PROVEN**
- **Issue:** No scheduled, automated, verified database backup exists.
- **Current state:** Read-only inspection of the production host shows
  `systemctl list-timers` contains only `dpkg-db-backup.timer` and
  `apt-daily-upgrade.timer` — both OS-level, neither database-related. No user
  crontab; `/etc/cron.d` holds only `e2scrub_all` and `sysstat`. No backup or
  restore tooling under `/home/ubuntu`. One **manual** Neon branch backup exists
  (expiry Never) taken before migration 0018.
- **Evidence:** production host inspection; `BACKLOG.md`.
- **User impact:** None until an incident; total learner progress loss after one.
- **Business impact:** Data loss would be unrecoverable beyond the manual branch
  and would destroy user trust permanently.
- **Technical/operational impact:** No RPO or RTO can currently be stated.
- **Security/privacy/data impact:** Direct — this _is_ the data-safety item.
  Note that backups themselves become personal-data stores (see LB-B04).
- **Root cause:** **PROVEN** — automation was never configured; v1 relied on
  manual pre-migration branches.
- **Dependencies:** None. Can start immediately.
- **What could break if done wrong:** A backup job that holds long transactions
  or saturates I/O can degrade the live database; credentials for the backup job
  are a new secret-handling surface; an unverified backup is false assurance.
- **Risk of deferring:** **Highest in the backlog.** Every day of live usage
  accumulates unbacked learner data.
- **Blocks:** Nothing formally, but it is the precondition for claiming
  operational readiness for LB-B17 (payments).
- **Blocked by:** Nothing.
- **Owner input required:** Yes — retention period, and cost tolerance.
- **Disposition:** **STRONG V1.1 CANDIDATE**
- **Rationale:** Highest-consequence, lowest-dependency item. A restore _drill_,
  not just a backup job, is the real deliverable.

### LB-B02 — No monitoring, alerting or uptime checks

- **Category / Priority:** INFRA/OPS · P1 · **Confidence: PROVEN**
- **Issue:** No monitoring agent, uptime check, or alert route exists. Outages
  are discovered only by manually looking, or by a user complaining.
- **Current state:** `docker ps` on production shows exactly four containers
  (app, admin, landing, caddy) — no exporter, agent or collector. No
  Prometheus/Grafana/node_exporter/Datadog/netdata service running. No
  `sentry`/`bugsnag`/`rollbar` dependency anywhere in `package.json`. Docker
  healthchecks _do_ exist (the container reports `healthy`) — so container-level
  health is observed, but **nothing escalates it to a human**.
- **Evidence:** production host inspection; dependency grep.
- **User impact:** Outage duration is bounded by luck rather than response time.
- **Business impact:** Silent failures during the launch window are the most
  expensive kind — early users rarely return after a bad first session.
- **Technical impact:** No error aggregation means recurring runtime exceptions
  are invisible; debugging is retrospective and log-only.
- **Root cause:** **PROVEN** — never installed.
- **Dependencies:** Pairs naturally with LB-B01 (both are "operational
  visibility"), but is independently deliverable.
- **What could break if done wrong:** An over-scoped observability platform adds
  cost and maintenance burden disproportionate to a single-VPS deployment;
  agents with broad access widen the attack surface; noisy alerts get muted and
  become worse than no alerts.
- **Risk of deferring:** High and immediate.
- **Owner input required:** Yes — alert destination and acceptable cost.
- **Disposition:** **STRONG V1.1 CANDIDATE**
- **Rationale:** The directive's caution is correct — the evidence justifies
  _uptime checks + error tracking + an alert route_, not a platform build-out.

### LB-B03 — Learner Profile endpoint returns 503

- **Category / Priority:** PRODUCT DEBT · P2 · **Confidence: PROVEN**
- **Issue:** `GET /api/learner/profile` returns `503 {"error":"serverUnavailable"}`.
- **Current state:** Confirmed still represented by this item and still
  reproducible from safe evidence. `readWebLearnerProfileRuntimeConfig()` in
  `apps/website/lib/learner-profile-web-runtime.ts` returns `null` unless
  `WEB_LEARNER_PROFILE_ENABLED === 'true'`, and a `null` config makes the route
  report unavailable. Production `.env` contains **zero** occurrences of
  `WEB_LEARNER_PROFILE_ENABLED` (verified by name-only count, no values read).
- **Evidence:** source file above; production env key count.
- **User impact:** The profile surface is unavailable. Core learning (cards,
  reviews, progress) is unaffected.
- **Root cause:** **PROVEN** — feature flag unset. This is a deliberate
  feature-gate, **not a crash and not a defect**.
- **Dependencies:** The same config path requires a valid `DATABASE_URL` and a
  session secret of ≥32 chars — both already satisfied in production.
- **What could break if done wrong:** Enabling the flag opens a **new
  database-backed request path** (`pg.Pool` via a global) that has not carried
  production traffic. Connection-pool exhaustion is the realistic failure mode.
  A `503` is honest; a slow or pool-starved app is worse.
- **Risk of deferring:** Low — but the endpoint's existence in a shipped product
  while permanently disabled is itself a small integrity problem.
- **Blocks:** LB-B04 partially — an account/privacy surface is the natural home
  for profile data.
- **Owner input required:** Yes — whether v1.1 should expose a profile surface.
- **Disposition:** **V1.1 OPTIONAL** (becomes STRONG if LB-B04 is selected)
- **Rationale:** Cheap to switch on, but must be load-verified first, and only
  makes sense bundled with the account surface.

### LB-B04 — No account deletion, privacy notice or support route

- **Category / Priority:** PRODUCT DEBT · P1 · **Confidence: PROVEN**
- **Issue:** A live product collecting phone numbers offers no way to delete an
  account, no privacy notice, and no support contact.
- **Current state:** Verified absent — a search of `apps/website/app` for
  privacy/support/delete/account routes returns only an unrelated
  `SupportivePlusOffer.tsx` component. There is no privacy page, no deletion
  endpoint, no support route.
- **Evidence:** route inspection.
- **Decomposition** (per directive section I):
  - **Legal/product UX:** privacy notice text, data-retention statement,
    contact route. Requires owner authorship and possibly legal review.
  - **Backend behavior:** account-deletion endpoint with cascade semantics
    across users, reviews, progress; must also address **backups** — deleting a
    row does not delete it from a backup taken yesterday (direct interaction
    with LB-B01 retention).
  - **Operational workflow:** who answers support requests, within what time,
    and how deletion requests are logged and audited.
- **User impact:** Users cannot exercise basic control over their own data.
- **Business impact:** This is the single largest **compliance and app-store
  blocker**. Both Cafe Bazaar (LB-B16) and Apple (LB-B18) require an account
  deletion path and a privacy policy. It blocks the entire platform-expansion
  cluster.
- **Security/privacy impact:** Direct and central.
- **Root cause:** **PROVEN** — deliberately deferred; `BACKLOG.md` records it as
  release-critical scope that did not ship.
- **Dependencies:** Interacts with LB-B01 (backup retention vs. deletion) and
  LB-B03 (profile surface).
- **What could break if done wrong:** A cascade deletion with wrong foreign-key
  semantics can orphan or over-delete rows; an irreversible deletion with no
  grace period invites accidental self-destruction; deletion that misses backups
  is a false privacy promise.
- **Risk of deferring:** High — grows with every new user, and blocks store
  submission.
- **Blocks:** LB-B16, LB-B17, LB-B18.
- **Owner input required:** Yes — privacy policy content, retention period,
  support channel, and whether deletion is immediate or grace-period based.
- **Disposition:** **STRONG V1.1 CANDIDATE**
- **Rationale:** Highest user-facing legitimacy item and an unblocker for all
  future distribution.

### LB-B05 — Starter audio is synthetic TTS

- **Category / Priority:** CONTENT/QUALITY · P2 · **Confidence: UNCERTAIN**
- **Issue:** All 70 audio assets are synthesized rather than human-recorded.
- **Decomposition** (per directive section C):
  - **Correctness:** Two recorded exceptions exist —
    `start-a1-essen-sentence` and `start-a1-gross-word`, both
    `automated_transcription_discrepancy`, state `recorded_not_resolved`, at
    28/30 exact normalized matches. These are **known and documented**, not
    newly discovered.
  - **Intelligibility:** No evidence either way. No learner feedback mechanism
    exists to gather it (which is itself part of LB-B04's support gap).
  - **Naturalness:** Inherently limited by synthesis; no measurement exists.
  - **Consistency:** Strong — single pipeline, uniform across all 70 assets.
  - **Content scalability:** The decisive dimension. Synthesis is what makes
    LB-B13/LB-B15 pack expansion economically viable; human recording does not
    scale to hundreds of items without recurring cost.
- **Evidence:** `start-a1-35-human-review-packet.json` `knownExceptions`; no TTS
  dependency in `package.json` (generation was external to the repo).
- **User impact:** Unmeasured. Plausibly the difference between "useful" and
  "pleasant", but no data supports a stronger claim.
- **Root cause:** **UNKNOWN** for quality; the two transcription discrepancies
  have a PROVEN recorded provenance but no proven cause.
- **What could break if done wrong:** Regenerating audio invalidates the
  canonical 105-asset manifest, the owner's 210-check approval artifact, and the
  media integrity chain — a disproportionate amount of validated work for an
  unmeasured benefit.
- **Risk of deferring:** Low.
- **Owner input required:** Yes — is synthetic audio acceptable as the permanent
  model, or a temporary stage?
- **Disposition:** **INVESTIGATE FIRST**
- **Rationale:** Cannot be scoped honestly without learner feedback. The correct
  v1.1 move is to _gather evidence_, not regenerate audio.

### LB-B06 — Learning media ships inside the application image

- **Category / Priority:** INFRA/OPS · P2 · **Confidence: PROVEN**
- **Issue:** All protected media is baked into the container image rather than
  served from object storage.
- **Current state:** `infrastructure/production/app/Dockerfile` line 30
  (`COPY content content`) and line 57 (`COPY --from=builder … ./content`).
  Payload is **15 MB across 170 files**. Serving is correctly gated behind the
  authenticated `content-media` route — the boundary is sound; only the
  _storage model_ is in question.
- **Trade-offs** (per directive section B):
  - _Current model — media in image._ Strengths: atomic deploys, no storage
    credentials at runtime, no per-request egress cost, media version is
    inseparable from application version, trivially reproducible. Weaknesses:
    image grows with every pack; content changes require a full rebuild and
    redeploy; media enters Git and therefore Git history (**the mechanism behind
    LB-B10**); does not scale to premium/paid packs.
  - _Object storage._ Strengths: content updates without redeploy, keeps media
    out of Git entirely, supports per-entitlement access for LB-B17, image stays
    small. Weaknesses: new runtime credential and failure domain, signed-URL
    expiry logic must be correct or it becomes a _new_ leak path, egress cost,
    and deploy atomicity is lost (app and media can now disagree).
  - Infrastructure for this already exists: an isolated private store was
    provisioned and all 105 assets were verified into it, but was never
    attached. A documented plan exists at
    `docs/operations/ISOLATED_PRIVATE_MEDIA_STORAGE.md`.
- **Relationship to Git history:** Migrating to object storage is the
  _precondition_ that makes removing media from Git history meaningful. Doing
  history cleanup without it just means the next pack re-adds media to Git.
- **Relationship to premium packs:** LB-B17 requires per-entitlement media
  access, which the in-image model cannot express.
- **Root cause:** **PROVEN** — deliberate v1 simplification.
- **What could break if done wrong:** This is the highest-blast-radius item in
  the backlog. A migration error can break media for **all** live users at once;
  signed URLs that leak or outlive their session reopen LB-B10 in a worse form;
  losing deploy atomicity creates version-skew failure modes that do not exist
  today.
- **Risk of deferring:** Low at current scale (15 MB, one pack). Rises sharply
  with pack count.
- **Blocks:** LB-B17 (hard), Git-history cleanup (practically).
- **Owner input required:** Yes — storage provider, and whether premium packs
  are near-term enough to force this now.
- **Disposition:** **INVESTIGATE FIRST** (design in v1.1; migrate later)
- **Rationale:** Architecturally correct, currently unforced. Migrating a
  working media boundary without a driving requirement risks a live regression
  for no user-visible gain.

### LB-B07 — SMS.ir OTP delivery latency is variable

- **Category / Priority:** INFRA/OPS · P2 · **Confidence: UNCERTAIN**
- **Issue:** OTP arrival time varies; some users wait noticeably.
- **Current state (per directive section F — separating the two):**
  - _Application correctness:_ **No evidence of an application defect.** The OTP
    request path returns structured outcomes including `resendAvailableAt` and
    `retryAfterMs`, with `429` + `retry-after` on limit. Delivery was proven
    working at activation (`deliveryState=5`).
  - _Provider latency:_ An external SMS.ir characteristic LearnBox does not
    control.
- **Evidence:** `apps/website/lib/otp-http.ts`; activation records.
- **Classification:** This should **not** be treated as an application bug. The
  honest framing is _third-party dependency risk with no fallback_.
- **Root cause:** **UNKNOWN** — no measurement of provider latency distribution
  exists. Nothing currently records send→deliver timing.
- **What could break if done wrong:** Adding a second SMS provider doubles the
  credential surface, doubles the failure modes, and introduces routing logic
  that can itself fail.
- **Risk of deferring:** Moderate — OTP is the _only_ way into the product, so
  provider failure is a total-outage scenario.
- **Blocked by:** LB-B02 — you cannot measure delivery latency without
  monitoring.
- **Owner input required:** Only if a second provider is contemplated.
- **Disposition:** **INVESTIGATE FIRST** (measure under LB-B02)
- **Rationale:** Do not engineer against an unmeasured problem. Instrument
  first; decide with data.

### LB-B08 — No OTP delivery-failure recovery path for users

- **Category / Priority:** PRODUCT DEBT · P2 · **Confidence: LIKELY**
- **Issue:** A user whose SMS never arrives has no recovery route.
- **Current state — materially better than the backlog row implies.** The server
  already returns `resendAvailableAt` and enforces per-phone and per-IP limits
  with `retry-after`. So **resend is already modelled server-side**; the gap is
  (a) how clearly the UI surfaces resend and waiting state, and (b) that there
  is no alternative channel or support escape hatch when SMS never arrives.
- **Evidence:** `apps/website/lib/otp-http.ts` lines 16–72;
  `apps/website/lib/otp-client.ts` handling of `429`/`request_limited`.
- **User impact:** **Total** for an affected user — no SMS means no access, and
  a locked-out user cannot even contact support (LB-B04).
- **Business impact:** Silent, unmeasurable signup loss.
- **Root cause:** **PROVEN** for the missing support escape hatch (LB-B04 gap);
  **UNKNOWN** for how often delivery actually fails (LB-B02/LB-B07 gap).
- **Dependencies:** Overlaps LB-B04 (support route) and LB-B07 (measurement).
- **What could break if done wrong:** Loosening rate limits to "help" users
  turns the OTP endpoint into an SMS-cost amplification and abuse vector.
- **Risk of deferring:** Moderate.
- **Disposition:** **V1.1 OPTIONAL** — scoped as UX + support route, bundled
  with LB-B04, **not** as a new auth mechanism.
- **Rationale:** Much of the backend already exists; the remaining work is
  presentation and escalation, which is cheap alongside LB-B04.

### LB-B09 — Canonical media manifest still records pre-activation flags

- **Category / Priority:** TECH DEBT · P2 · **Confidence: PROVEN**
- **Issue:** Post-activation, validation artifacts still assert a
  pre-activation world.
- **Current state — larger than recorded.** `publicationBlocked` appears in
  **30 files**. The final media manifest still declares `publicationBlocked: true`,
  `attachmentAllowed: false`, `uploadPerformed: false`, `urlsIncluded: false`,
  `privatePackageInRepo: false`, `learnerExposure: false`, and
  `state: prepared_awaiting_private_upload` — while in reality media **is**
  packaged in the repo/image and **is** exposed to authenticated learners. The
  review packet additionally declares
  `finalManifestLifecycleFieldsAreCurrentTruth: false` — the artifacts already
  _admit internally_ that their lifecycle fields are not current truth.
  Hard assertions (`!== true` → throw) exist across
  `build-start-35-final-media-manifest.mjs`,
  `build-start-35-human-review-packet.mjs`,
  `validate-start-35-final-private-media-attachment.mjs`,
  `build-start-35-final-private-media-attestation.mjs`,
  `build-start-slice-attachment-draft.mjs`, plus tests in `scripts/*.test.mjs`,
  `apps/api/test/start-catalog-seed-gate.test.ts` and
  `services/content-factory/test/batch-validation.test.ts`.
- **Evidence:** the greps and files above.
- **User impact:** None whatsoever.
- **Technical impact:** The manifest is the integrity record for the 105-asset
  media chain. A record that contradicts reality degrades every future audit
  that relies on it, and future contributors cannot tell which fields are
  historical and which are live assertions.
- **Root cause:** **PROVEN** — these flags were designed as _pre-release gates_
  and no post-activation transition was ever modelled. There is no "activated"
  state in the schema.
- **What could break if done wrong:** Flipping the flags breaks build scripts
  and CI tests that assert them — exactly why it was left untouched during v1
  closure. The correct fix is to introduce an explicit post-activation lifecycle
  state and update assertions coherently, **not** to edit JSON until tests pass.
- **Risk of deferring:** Low short-term; compounding.
- **Owner input required:** No — engineering-internal.
- **Disposition:** **V1.1 OPTIONAL**
- **Rationale:** Genuine integrity debt with zero user impact. Worth doing in a
  stabilization release _because_ that is when no feature deadline competes —
  but it is a real multi-file change and must be scoped as such.

### LB-B10 — Protected assets were anonymously downloadable (CONTAINED)

- **Category / Priority:** SECURITY/HARDENING · **P0 — CONTAINED** ·
  **Confidence: PROVEN**
- **Issue:** All 105 protected assets were anonymously retrievable from the
  public repository via `raw.githubusercontent.com`.
- **Current state:** Contained by making the repository PRIVATE. Verified after
  CDN TTL expiry: 0/12 original probes and 0/20 cold-sample assets return bytes;
  contents API, codeload tarball, archive zip and git-upload-pack all refuse.
  The application boundary was independently re-verified unchanged.
- **Residual work assessment** (per directive section A):
  1. **Git history still contains every protected blob.** Anyone granted
     repository read access can retrieve all 105 assets regardless of the
     application's auth. The boundary moved from "the entire internet" to
     "people with repo access" — a large reduction, not elimination.
  2. **Anything copied while public is unrecallable.** Clones, forks and mirrors
     made during the public window cannot be audited or withdrawn. **No cleanup
     can ever fix this** — it is permanent and must be accepted.
  3. **Repository privacy is now a load-bearing security control.** Making the
     repo public again instantly reopens the P0. Recorded in `PROJECT_STATE.md`.
  4. **Future public-source option is now conditional.** Open-sourcing the code
     would require history cleanup _and_ LB-B06 migration first.
- **Root cause:** **PROVEN** — media was committed to Git, and the repo was public.
- **Dependencies:** Meaningful permanent remediation requires **LB-B06 first**
  (move media out of Git), then history cleanup. Doing history cleanup alone is
  wasted work — the next pack would re-add media to Git.
- **What could break if done wrong:** History rewriting is destructive and
  irreversible: it invalidates every existing clone, breaks the `v1.0.0` tag's
  commit identity, and can corrupt the audit chain linking `2acdcef4` to the
  running production image. Explicitly out of scope by owner directive.
- **Risk of deferring:** **Low while the repo stays private** — entirely
  contingent on that control holding.
- **Owner input required:** Yes — accept repo-access retrieval permanently, or
  commit to the LB-B06 → history-cleanup sequence.
- **Disposition:** **DEFER TO LATER** for residual history work;
  **ongoing operations** for the privacy control.
- **Rationale:** Containment is real and verified. The residual is an
  architecture question that should not be rushed; the _decision_ belongs in
  v1.1 planning, the _work_ does not.

### LB-B11 — Progress analytics are device-local, not server-backed

- **Category / Priority:** PRODUCT DEBT · P3 · **Confidence: PROVEN**
- **Issue:** Streak and analytics live in `localStorage`, not the database.
- **Current state:** `LearnerHome.tsx` uses storage key
  `learnbox:learning-streak:v1:local-prototype` — the key literally says
  `local-prototype`. Important distinction: **core review data is already
  server-backed** (`/api/learner/reviews`, `/progress`, `/state`, `/today` all
  exist). Only streak/analytics presentation is device-local.
- **User impact:** Streak resets on device change, browser-data clear, or
  private browsing. Actual learning progress is **not** lost.
- **Business impact:** Streaks are a primary retention mechanic; a streak that
  silently resets actively damages the motivation it exists to create.
- **Root cause:** **PROVEN** — prototype implementation never promoted.
- **What could break if done wrong:** Migrating existing device-local streaks
  server-side without a merge strategy will either discard real user streaks or
  fabricate inflated ones.
- **Risk of deferring:** Low-moderate.
- **Disposition:** **V1.1 OPTIONAL**
- **Rationale:** Smaller than it appears since the server data layer exists, and
  it strengthens retention — but it is not a stabilization item.

### LB-B12 — Personal vocabulary is device-local with a 30-word cap

- **Category / Priority:** PRODUCT DEBT · P3 · **Confidence: LIKELY**
- **Issue:** Personal vocabulary is device-bound and capped.
- **Current state:** `personalWordLimit` is defined in
  `apps/website/app/product-experience.ts` as a tier property, with `null`
  (unlimited) for a higher tier — i.e. **the cap is a deliberate tier boundary,
  not a technical limitation.**
- **User impact:** Users lose personal words on device change.
- **Business impact:** Directly tied to LB-B17 — the cap is a monetization lever.
- **Root cause:** **PROVEN** for the tier cap; **LIKELY** for device-local
  storage being prototype-stage.
- **Dependencies:** Strongly coupled to LB-B17 (entitlements) and LB-B11 (same
  device-local → server-backed migration).
- **What could break if done wrong:** Server-syncing personal words without the
  entitlement model in place gives away a paid differentiator permanently, and
  reversing that later is a trust-damaging takeaway.
- **Risk of deferring:** Low.
- **Disposition:** **DEFER TO LATER** (v1.2, with LB-B17)
- **Rationale:** Deciding this before the monetization model is settled
  forecloses a pricing decision by accident.

### LB-B13 — Admin panel operations incomplete

- **Category / Priority:** PRODUCT DEBT · P2 · **Confidence: UNCERTAIN**
- **Issue:** The admin application does not fully cover operational needs.
- **Current state:** `apps/admin` exists and is deployed
  (`learnbox-admin-production-admin-1` is running). It has `api`, `bootstrap`,
  `components` and a root page. Exactly which operations are missing is **not
  specified** by any evidence found.
- **User impact:** None — internal tool.
- **Operational impact:** Gaps here are absorbed as manual work (direct database
  access), which is both slower and riskier than a purpose-built tool.
- **Root cause:** **UNKNOWN** — the item lacks a concrete gap list.
- **Risk of deferring:** Low, but manual database operations on a live system
  carry their own standing risk.
- **Owner input required:** Yes — which specific operations are actually needed?
- **Disposition:** **INVESTIGATE FIRST**
- **Rationale:** Cannot be scoped without a definition of "complete".

### LB-B14 — Accessibility matrix not exercised

- **Category / Priority:** TECH DEBT · P2 · **Confidence: LIKELY**
- **Issue:** No accessibility verification has been performed.
- **Current state — concrete, evidence-backed gaps** (per directive section J,
  avoiding "accessibility" as one vague task):
  1. **No tooling exists.** No `axe`, `pa11y`, `lighthouse-ci` or equivalent in
     any `package.json`; no a11y test files in `apps/website/test`. The gap is
     _verified absence of verification_, not a list of known violations.
  2. **RTL/Persian-first rendering** is the core presentation model, and
     bidirectional text with embedded Latin (German) words is a well-known
     source of screen-reader and focus-order problems — specific to this product.
  3. **Audio-dependent learning** means pronunciation content needs a non-audio
     path for hearing-impaired users.
  4. **The 3D card-flip interaction** needs keyboard operability and a
     reduced-motion path.
- **Honest limitation:** items 2–4 are _areas where problems are likely_, not
  confirmed defects. No audit has run, so no violation can be asserted.
- **Root cause:** **PROVEN** — never exercised.
- **Risk of deferring:** Moderate — accessibility defects found late are
  expensive, and app stores increasingly check.
- **Disposition:** **V1.1 OPTIONAL** — scope as _run an audit and triage_, not
  _fix all of accessibility_.
- **Rationale:** An audit is cheap and converts an unbounded item into a
  bounded, evidence-backed one.

### LB-B15 — Content Factory AI generation incomplete

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: LIKELY**
- **Current state:** `services/content-factory` exists with validation tests
  that assert `publicationBlocked` — the safety gates are built, the generation
  pipeline is not complete.
- **Business impact:** The long-term content scaling engine and the economic
  basis for pack expansion.
- **Root cause:** **PROVEN** — deliberately out of v1 scope.
- **Dependencies:** Relates to LB-B05 (audio strategy) and LB-B06 (where
  generated media would live).
- **What could break if done wrong:** Auto-generated learning content that
  bypasses human review would compromise the owner-approval integrity model
  that v1 was built around.
- **Disposition:** **DEFER TO LATER** (future major release)

### LB-B16 — Native Android / Cafe Bazaar release

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: PROVEN**
- **Current state:** Not started. Web/PWA is the shipped surface.
- **Business impact:** Cafe Bazaar is the dominant Iranian distribution channel
  — the largest growth lever available, but a full platform workstream.
- **Blocked by:** **LB-B04 is a hard gate** — store policy requires account
  deletion and a privacy policy.
- **Root cause:** N/A — planned scope, not a defect.
- **Disposition:** **DEFER TO LATER** (future major release)
- **Rationale:** Including it would turn v1.1 into a second v1.

### LB-B17 — Payments, premium packs and entitlements

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: PROVEN**
- **Current state:** Not started; `paywall.ts` and tier scaffolding exist
  (`personalWordLimit` tiering), so the product model anticipates it.
- **Business impact:** The revenue mechanism. Highest business value in the
  backlog — and highest risk.
- **Blocked by:** LB-B06 (per-entitlement media access is impossible with media
  baked into the image), LB-B04 (legal/refund/support obligations), LB-B01 and
  LB-B02 (taking money without backups or monitoring is indefensible).
- **What could break if done wrong:** Payment bugs cost real money and trust
  directly, and are the least forgiving class of defect.
- **Disposition:** **DEFER TO LATER** (v1.2 at the earliest)
- **Rationale:** Operational maturity must precede monetization — the strongest
  argument for doing Option B now rather than chasing revenue first.

### LB-B18 — Native iOS / StoreKit

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: PROVEN**
- **Current state:** Not started.
- **Business impact:** Low priority for the Persian-speaking target market
  relative to Android; App Store access also carries regional constraints.
- **Blocked by:** LB-B04, and realistically LB-B16 first.
- **Disposition:** **DEFER TO LATER** (future major release)

### LB-B19 — Notifications and reminders

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: LIKELY**
- **Current state:** Not implemented.
- **Business impact:** Spaced repetition depends on _timely return_; without
  reminders, the Leitner scheduling advantage is partly wasted.
- **Dependencies:** Web-push works on PWA but is unreliable on iOS; SMS
  reminders would add cost on top of existing OTP spend.
- **What could break if done wrong:** Over-notification is the fastest route to
  uninstalls and permission revocation, which cannot be undone.
- **Disposition:** **DEFER TO LATER** (v1.2 candidate)

### LB-B20 — Leagues, social, gamification, theming

- **Category / Priority:** FUTURE FEATURE · P3 · **Confidence: PROVEN**
- **Current state:** Not implemented.
- **Business impact:** Engagement mechanics; unproven for this audience.
- **Dependencies:** Social features imply new personal-data exposure, which
  re-enters LB-B04's privacy scope.
- **Disposition:** **DEFER TO LATER** (future major release)
- **Rationale:** Lowest evidence-to-effort ratio in the backlog.

### LB-B21 — Stale prototype/alpha language across documentation

- **Category / Priority:** DOCUMENTATION · P3 · **Confidence: PROVEN**
- **Current state:** Substantially reduced by the v1 closure audit — `README`,
  `PROJECT_STATE`, `CURRENT_WORK`, `PRODUCT_STATUS` and `BACKLOG` were
  corrected. Residual stale language persists in historical documents (recovery
  reports, older `docs/` material). Note that some are **historical records that
  should not be rewritten** — an archive correctly describes the past.
- **User impact:** None. Contributor/continuity impact only.
- **Root cause:** **PROVEN** — documents accreted across phases.
- **Risk of deferring:** Low, but this class of drift is what made the v1
  closure audit necessary.
- **Disposition:** **V1.1 OPTIONAL** — bundles naturally with LB-B09.

---

## 4. Dependency / cluster map

**Clusters**

- **Reliability / Operations:** LB-B01, LB-B02, LB-B07
- **Security / Media Architecture:** LB-B10 (residual), LB-B06
- **Account / Privacy:** LB-B04, LB-B03, LB-B08
- **Core Learner UX:** LB-B11, LB-B12, LB-B14
- **Content Quality:** LB-B05, LB-B15
- **Platform Expansion:** LB-B16, LB-B17, LB-B18, LB-B19, LB-B20, LB-B13
- **Documentation / State Integrity:** LB-B09, LB-B21

**Blocking edges (evidence-backed)**

```
LB-B04 ──blocks──> LB-B16, LB-B17, LB-B18   (store policy + legal obligation)
LB-B06 ──blocks──> LB-B17                   (per-entitlement media access)
LB-B06 ──enables─> LB-B10 residual cleanup  (history purge is futile before it)
LB-B02 ──enables─> LB-B07                   (cannot measure what is uninstrumented)
LB-B01 ──constrains─> LB-B04                (deletion vs. backup retention)
LB-B03 ──supports─> LB-B04                  (profile surface hosts account data)
LB-B11 ──shares path──> LB-B12              (same device-local → server migration)
LB-B17 ──gated by──> LB-B01, LB-B02         (no monetization without ops maturity)
```

**Solve together**

- LB-B01 + LB-B02 — one operational-visibility workstream, same access, same
  alert destination.
- LB-B04 + LB-B03 + LB-B08 — one account/privacy/support surface; the support
  route is simultaneously LB-B08's escape hatch.
- LB-B09 + LB-B21 — one state-integrity pass over artifacts and docs.
- LB-B11 + LB-B12 — the same device-local → server-backed migration.

**Do NOT bundle**

- LB-B06 with LB-B10 history cleanup **in the same change** — migrate first,
  verify in production, and only then consider history. Doing both at once
  couples a live-media regression risk to an irreversible operation.
- LB-B04 with LB-B17 — conflating legal obligation with monetization delays the
  legal work behind commercial decisions.
- LB-B05 regeneration with LB-B15 — do not rebuild the content pipeline and
  replace validated content simultaneously.
- LB-B01 with LB-B04 deletion semantics **in one step** — establish backups
  first, then define deletion against a known retention model.

---

## 5. Option A — Minimum Stabilization

- **Included:** LB-B01, LB-B02
- **Excluded/deferred:** all other 19 items
- **Objective:** Ensure LearnBox can _detect_ failure and _recover_ data.
- **Why together:** Both are operational-visibility gaps on the same host, need
  the same access, and share one alert destination. Neither depends on anything.
- **Dependencies:** None — deliverable immediately.
- **Principal risks:** Backup jobs competing with live traffic; alert fatigue
  from bad thresholds; leaves the LB-B04 compliance gap fully open.
- **What the user notices:** Nothing directly — shorter outages over time.
- **What operators gain:** A stated RPO/RTO, a verified restore drill, outage
  alerts, and error aggregation.
- **Release-level DoD:** Automated backups running on schedule; **at least one
  documented successful restore into a scratch target**; retention documented;
  uptime check alerting to an owner-reachable channel; error tracking capturing
  a deliberately triggered test error; production still `2acdcef4` unless a code
  change is explicitly authorized.

## 6. Option B — Recommended Balanced v1.1

- **Included:** LB-B01, LB-B02, LB-B04, LB-B03, LB-B08, LB-B09, LB-B21
- **Excluded/deferred:** LB-B05, LB-B06, LB-B07, LB-B10 residual, LB-B11,
  LB-B12, LB-B13, LB-B14, LB-B15, LB-B16, LB-B17, LB-B18, LB-B19, LB-B20
- **Objective:** Make LearnBox operationally sound and legally legitimate — a
  product that can be _run_ responsibly and _trusted_ by its users.
- **Why these belong together:** They form exactly two coherent workstreams plus
  a cleanup pass. Operations (B01+B02) makes failure visible and survivable.
  Account/privacy (B04+B03+B08) makes the product legitimate — and each piece
  reinforces the others: the support route created for B04 _is_ B08's escape
  hatch, and B03's profile endpoint _is_ where account data belongs. State
  integrity (B09+B21) closes documentation/artifact drift while no feature
  deadline competes. Every item is either dependency-free or depends only on
  another item inside this set.
- **Dependencies:** B01 should land before B04's deletion semantics (retention
  interaction). B03 should be load-verified before being exposed through B04.
- **Principal risks:** B04 is the largest item and needs owner-authored legal
  content — it can stall on owner availability rather than engineering. B09
  touches ~30 files and must not be "fixed" by editing JSON until tests pass.
  Enabling B03 introduces a new database path that needs load verification.
- **What the user notices:** They can delete their account, read a privacy
  notice, contact support, see a profile surface, and recover from a failed OTP.
- **What operators gain:** Backups with a proven restore, outage alerting, error
  aggregation, and validation artifacts that no longer contradict reality.
- **Release-level DoD:** See section 10.

## 7. Option C — Expanded v1.1

- **Included:** Option B **plus** LB-B14 (audit + triage), LB-B11, LB-B07
  (measurement only)
- **Excluded/deferred:** LB-B05, LB-B06, LB-B10 residual, LB-B12, LB-B13,
  LB-B15, LB-B16, LB-B17, LB-B18, LB-B19, LB-B20
- **Objective:** Stabilization plus user-visible quality — accessibility
  evidence, durable streaks, and measured OTP delivery.
- **Why together:** These are the only three remaining items that are
  _evidence-bounded_ rather than open-ended. B14 is scoped as audit-and-triage,
  B07 as measurement-only riding on B02's instrumentation, B11 as a migration
  onto a data layer that already exists.
- **Dependencies:** B07 measurement strictly requires B02 first. B11 requires a
  streak merge strategy decision.
- **Principal risks:** **Scope creep is the main danger** — B14's audit _will_
  surface defects, and the temptation to fix them inside v1.1 is exactly how a
  stabilization release becomes a second v1. B11's migration can corrupt or
  inflate existing user streaks if the merge rule is wrong.
- **What the user notices:** Streaks survive device changes; some accessibility
  improvements; clearer OTP waiting experience.
- **What operators gain:** Everything in B, plus an accessibility baseline and
  OTP delivery data to decide LB-B07 properly.
- **Release-level DoD:** Option B's DoD, plus a published accessibility audit
  report with triaged findings (fixes explicitly deferrable to v1.2), streak
  migration proven non-destructive on real data, and OTP delivery latency
  recorded for a meaningful sample.

---

## 8. Recommended option and rationale

**Recommendation: Option B.**

- **Launch stability:** LB-B01 and LB-B02 are the only items whose absence can
  cause _unrecoverable_ harm. Verified absent on the live host today. Everything
  else in the backlog degrades experience; these two risk the product itself.
- **User impact:** LB-B04 is the largest user-facing legitimacy gap. A live
  product holding phone numbers with no deletion path, no privacy notice and no
  support contact is not defensible, independent of regulation.
- **Security:** LB-B10 is contained and verified. The residual (Git history)
  depends on LB-B06, and rushing an architecture migration to chase an
  already-contained issue would _add_ risk to a working media boundary. Option B
  correctly leaves it alone.
- **Operational maturity:** Backups, alerting and error tracking are the
  preconditions for every commercial ambition (LB-B17). This sequencing is not
  optional — taking payments without them is indefensible.
- **Scope control:** Option A is too thin — it leaves a live product without a
  privacy notice or deletion path, a real liability and a hard store blocker.
  Option C is defensible, but B14's audit produces findings whose fix cost is
  unknown _before_ the audit runs, which is precisely how a stabilization
  release loses its shape.
- **Dependency ordering:** Option B contains no item blocked by an excluded
  item. That is not true of any larger scope.

**Argument against this recommendation, stated honestly:** Option B contains no
revenue work and little the user will _notice_ beyond legal surfaces. If the
owner's priority is growth, B looks like a release spent on plumbing. The
counter is that LB-B17 is blocked by LB-B06 _and_ LB-B04 _and_ needs
LB-B01/B02 to be responsible — so the fastest real route to revenue still runs
through most of Option B. But if the owner disagrees with that ordering, that is
a legitimate business judgement, not an error.

---

## 9. Proposed implementation sequence (Option B)

Sequenced by workstream and dependency. **Not authorization to execute.**

1. **Foundation — operational visibility**
   LB-B02 uptime + error tracking first (fastest feedback, makes every
   subsequent change observable), then LB-B01 automated backups **including a
   restore drill**. Backups before any account-deletion semantics exist.

2. **Data-safety contract**
   Settle retention (LB-B01) so LB-B04's deletion can be defined against a known
   backup model. Deletion that ignores backups is a false promise.

3. **Account / privacy / support**
   LB-B04 backend deletion + privacy notice + support route.
   Then LB-B03 (enable the profile flag, **load-verify the new database path**
   before exposing it).
   Then LB-B08 UX — surface resend state and route failures to the support
   channel created in this step.

4. **State integrity**
   LB-B09 — model an explicit post-activation lifecycle state and update
   assertions coherently across all ~30 files. Do **not** edit JSON until tests
   pass. Then LB-B21 documentation cleanup, preserving historical records as
   history.

5. **Validation / release**
   Regression suite, security-boundary re-verification, production smoke, then
   release under the `release-guardian` skill with exact
   source→artifact→production identity proof.

---

## 10. Draft v1.1 Definition of Done (Option B) — for owner approval

- **Scope items resolved:** LB-B01, LB-B02, LB-B04, LB-B03, LB-B08, LB-B09,
  LB-B21 each demonstrably closed with evidence, not assertion.
- **Regression tests:** Existing suites green; new tests covering account
  deletion cascade, profile endpoint enabled-path, and OTP resend/limit
  behaviour.
- **Security boundaries re-proven unchanged:** authenticated protected media
  `200` + `private, no-store`; anonymous `401`; public/static `404`; repository
  remains PRIVATE with anonymous `raw` retrieval still refused.
- **Data safety:** Automated backup verified by **at least one successful
  restore into a scratch target**; retention documented; account deletion proven
  to remove data from live storage with documented backup-retention behaviour.
- **Migration/rollback:** Any schema change forward-only, preserving data, no
  drop/truncate/reset; rollback image and env backup captured before deploy;
  pre-deploy database backup taken.
- **Authenticated/anonymous behavior:** Explicitly re-verified for every new
  route — deletion, support, privacy, profile — anonymous must never reach
  authenticated data.
- **Monitoring/backup evidence:** Alert delivered to the owner channel during a
  deliberate test; error tracking capturing a deliberately triggered error;
  backup job's last successful run recorded.
- **Production smoke:** OTP login end-to-end, card review submission, protected
  media on all three kinds, profile surface, deletion path on a test account.
- **Docs/state alignment:** `BACKLOG.md`, `PROJECT_STATE.md`,
  `docs/PRODUCT_STATUS.md` updated; resolved items marked with evidence; this
  planning snapshot superseded or updated.
- **Exact identity:** `source SHA → image digest → running production digest`
  proven equal, and recorded in the release notes.
- **Release Guardian:** The `release-guardian` skill drives the release; its
  mandatory stops are honoured rather than worked around.
- **No unresolved blocker inside agreed scope**, and any newly discovered issue
  is recorded in `BACKLOG.md` with a new stable ID rather than silently fixed or
  silently dropped.

---

## 11. Deferred-item destination map

| ID     | Destination            | Note                                                             |
| ------ | ---------------------- | ---------------------------------------------------------------- |
| LB-B05 | Investigate separately | Gather learner feedback before deciding; do not regenerate audio |
| LB-B06 | v1.2 candidate         | Design in v1.1 discussion, migrate in v1.2; gates LB-B17         |
| LB-B07 | Ongoing operations     | Measure under LB-B02 before engineering anything                 |
| LB-B10 | Ongoing operations     | Privacy control is permanent; history cleanup follows LB-B06     |
| LB-B11 | v1.2 candidate         | Needs streak merge strategy                                      |
| LB-B12 | v1.2 candidate         | Decide with LB-B17 entitlements, not before                      |
| LB-B13 | Investigate separately | Needs a concrete gap list before it can be scoped                |
| LB-B14 | v1.2 candidate         | Run audit first; fixes scoped from findings                      |
| LB-B15 | Future major release   | Depends on LB-B06 and LB-B05 strategy                            |
| LB-B16 | Future major release   | Hard-blocked by LB-B04                                           |
| LB-B17 | v1.2 at earliest       | Blocked by LB-B06, LB-B04; gated by LB-B01, LB-B02               |
| LB-B18 | Future major release   | After LB-B16                                                     |
| LB-B19 | v1.2 candidate         | Real retention value; keep scope small                           |
| LB-B20 | Future major release   | Needs measured user behaviour first                              |

No item disappears. Every excluded item has a recorded destination.

---

## 12. Newly discovered candidates

Recorded separately; **the canonical set remains 21**. These are _not_ added to
`BACKLOG.md` by this planning task.

- **NDC-01 — Validation artifacts internally declare their own lifecycle fields
  untrue.** `start-a1-35-human-review-packet.json` contains
  `finalManifestLifecycleFieldsAreCurrentTruth: false`, and
  `validate-start-35-human-review-packet.mjs` (lines 509–511) _asserts_ it stays
  `false`. **Evidence:** those two files. Arguably a sub-case of LB-B09 rather
  than a new item, but worth recording because the contradiction is _encoded and
  enforced_, not merely stale — a fix must change validators, not just data.
  **Suggested disposition:** fold into LB-B09 scope.

- **NDC-02 — Streak storage key is explicitly named `local-prototype` in
  production.** The key `learnbox:learning-streak:v1:local-prototype` ships to
  live users. **Evidence:** `apps/website/app/LearnerHome.tsx` line ~78. Beyond
  LB-B11's substance, any future migration must handle this legacy key name
  explicitly or silently orphan existing users' streaks. **Suggested
  disposition:** note inside LB-B11.

---

## 13. Uncertainties requiring investigation

- **LB-B05:** No data on whether synthetic audio actually impairs learning. The
  two transcription exceptions are recorded but their cause is unproven.
- **LB-B07:** OTP delivery latency has never been measured; the
  provider-vs-application split is reasoned, not quantified.
- **LB-B13:** "Incomplete" is undefined — no gap list exists.
- **LB-B14:** No audit has run; the four gap areas are _likely_ problem
  surfaces, not confirmed defects.
- **LB-B03:** The database path behind the profile flag has never served
  production traffic; pool behaviour under load is unknown.
- **LB-B10 residual:** The size of the public-exposure window, and whether any
  clone/fork was made, is **unknowable**.

---

## 14. Owner decisions required

1. **v1.1 scope:** Option A, B or C. _(Recommended: B)_
2. **Backup retention period and cost tolerance** (LB-B01).
3. **Alert destination and monitoring budget** (LB-B02).
4. **Privacy policy content, deletion model (immediate vs. grace period), and
   support channel** (LB-B04) — requires owner authorship.
5. **Whether v1.1 exposes a profile surface at all** (LB-B03).
6. **LB-B10 residual:** accept repo-access retrieval permanently, or commit to
   the LB-B06 → history-cleanup sequence later.
7. **Media storage direction** (LB-B06) — needed before LB-B17 can be planned.
8. **Synthetic audio:** permanent model or temporary stage? (LB-B05)
9. **Which admin operations are actually required** (LB-B13).

---

## 15. خلاصهٔ مالک — جدول ساده

| شناسه  | معنی به زبان ساده                                                         | چرا مهم است                                                       | نسخهٔ پیشنهادی    | تصمیم مالک لازم است؟  |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- | --------------------- |
| LB-B01 | از اطلاعات کاربران نسخهٔ پشتیبان خودکار گرفته نمی‌شود                     | اگر مشکلی پیش بیاید، پیشرفت همهٔ کاربران برای همیشه از بین می‌رود | **۱.۱**           | بله — مدت نگهداری     |
| LB-B02 | اگر برنامه از کار بیفتد، کسی خبردار نمی‌شود                               | ممکن است ساعت‌ها قطع باشد و ما ندانیم                             | **۱.۱**           | بله — راه اطلاع‌رسانی |
| LB-B03 | صفحهٔ پروفایل کاربر خاموش است                                             | یک قابلیت ساخته‌شده که کاربر به آن دسترسی ندارد                   | **۱.۱** (اختیاری) | بله — می‌خواهیدش؟     |
| LB-B04 | کاربر نمی‌تواند حسابش را حذف کند، متن حریم خصوصی و راه پشتیبانی هم نیست   | حق قانونی کاربر است و برای انتشار در کافه‌بازار هم الزامی است     | **۱.۱**           | بله — متن و سیاست     |
| LB-B05 | صدای کارت‌ها ماشینی است، نه صدای انسان                                    | ممکن است کیفیت یادگیری را کم کند — ولی هنوز داده‌ای نداریم        | بررسی جداگانه     | بله — ماندگار است؟    |
| LB-B06 | فایل‌های صوتی و تصویری داخل خود برنامه بسته‌بندی شده‌اند                  | برای بسته‌های پولی آینده این روش جواب نمی‌دهد                     | ۱.۲               | بله — محل ذخیره‌سازی  |
| LB-B07 | گاهی پیامک کد ورود دیر می‌رسد                                             | تأخیر از سرویس پیامک است، نه از برنامه؛ اول باید اندازه‌گیری شود  | عملیات جاری       | خیر                   |
| LB-B08 | اگر پیامک نرسد، کاربر راه دیگری برای ورود ندارد                           | کاربر کاملاً پشت در می‌ماند و جایی هم برای شکایت نیست             | **۱.۱** (اختیاری) | خیر                   |
| LB-B09 | برخی فایل‌های فنی هنوز می‌گویند «منتشر نشده»، درحالی‌که منتشر شده         | سوابق فنی با واقعیت نمی‌خواند و ممیزی‌های بعدی را گمراه می‌کند    | **۱.۱** (اختیاری) | خیر                   |
| LB-B10 | قبلاً فایل‌های آموزشی از گیت‌هاب برای همه قابل دانلود بود — الان بسته شده | خطر اصلی رفع شده؛ ولی نسخه‌های قدیمی هنوز در تاریخچه باقی است     | عملیات جاری       | بله — تاریخچه         |
| LB-B11 | «روزهای پیاپی مطالعه» فقط روی همان دستگاه ذخیره می‌شود                    | با عوض کردن گوشی، انگیزهٔ کاربر صفر می‌شود (پیشرفت واقعی حفظ است) | ۱.۲               | خیر                   |
| LB-B12 | واژه‌های شخصی کاربر روی دستگاه می‌ماند و سقف ۳۰ کلمه دارد                 | این سقف عمداً برای نسخهٔ پولی گذاشته شده                          | ۱.۲               | بله — با قیمت‌گذاری   |
| LB-B13 | پنل مدیریت همهٔ کارهای لازم را ندارد                                      | کارها باید دستی و پرخطر انجام شود                                 | بررسی جداگانه     | بله — چه کارهایی؟     |
| LB-B14 | دسترس‌پذیری برای کاربران دارای معلولیت بررسی نشده                         | ممکن است بخشی از کاربران نتوانند استفاده کنند                     | ۱.۲               | خیر                   |
| LB-B15 | کارخانهٔ تولید محتوا با هوش مصنوعی کامل نیست                              | برای ساخت بسته‌های بعدی لازم است                                  | نسخهٔ بزرگ بعدی   | خیر                   |
| LB-B16 | نسخهٔ اندروید و کافه‌بازار ساخته نشده                                     | بزرگ‌ترین راه رشد در ایران — ولی تا LB-B04 حل نشود ممکن نیست      | نسخهٔ بزرگ بعدی   | خیر                   |
| LB-B17 | پرداخت و بسته‌های پولی وجود ندارد                                         | تنها راه درآمد — ولی اول باید پشتیبان‌گیری و پایش آماده باشد      | ۱.۲               | بله — مدل درآمد       |
| LB-B18 | نسخهٔ آیفون ساخته نشده                                                    | بازار کوچک‌تری برای مخاطب ماست                                    | نسخهٔ بزرگ بعدی   | خیر                   |
| LB-B19 | یادآوری و اعلان وجود ندارد                                                | بدون یادآوری، فایدهٔ مرور فاصله‌دار نصف می‌شود                    | ۱.۲               | خیر                   |
| LB-B20 | رقابت، لیگ و قابلیت‌های اجتماعی نیست                                      | جذاب است ولی هنوز دلیلی برایش نداریم                              | نسخهٔ بزرگ بعدی   | خیر                   |
| LB-B21 | بعضی مستندات هنوز می‌گویند پروژه «نمونهٔ آزمایشی» است                     | باعث سردرگمی در ادامهٔ کار می‌شود                                 | **۱.۱** (اختیاری) | خیر                   |

**پیشنهاد نهایی:** گزینهٔ **B** — یعنی نسخهٔ ۱.۱ روی این کارها تمرکز کند:
پشتیبان‌گیری خودکار (B01)، هشدار قطعی (B02)، حذف حساب و حریم خصوصی و پشتیبانی
(B04)، فعال‌کردن پروفایل (B03)، بهبود تجربهٔ کد ورود (B08)، و تمیزکاری سوابق
فنی و مستندات (B09 + B21).
