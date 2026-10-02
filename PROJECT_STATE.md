# LearnBox stable project state

**Last reviewed:** 2026-10-02

## Release position

**Web/PWA v1 is LIVE and CLOSED.** Public activation completed 2026-09-28.

### At v1.0.0 public activation (2026-09-28, historical record)

| Fact                           | Value                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| Production application source  | `2acdcef4bc4e06c020f08de1fd16e4fbad2e1ea3`                                |
| Production image digest        | `sha256:4e008803b22c63cc08ccbce4514834ceddeed0209f44c8e296c7efb665ae3bef` |
| Live learner surface           | `app.learnboxapp.com`                                                     |
| Starter pack                   | 35/35 canonical cards                                                     |
| Canonical media                | 105/105 verified assets                                                   |
| Release blockers at activation | none                                                                      |
| Production drift at activation | zero                                                                      |
| Release record                 | annotated tag `v1.0.0` + GitHub Release, targeting `2acdcef4`             |
| Repository visibility          | private (security decision, 2026-09-28)                                   |

### Production as deployed today (reconciled at CP11, 2026-10-02)

Production has since advanced through the v1.2.1 security patch and the **LB-B35 CP9 server-side
cutover**. These are the current live facts; the table above is the v1.0.0 activation record and must
not be read as current.

| Fact                                    | Value                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Production application source           | `8b7b32905ccbae09977cd0c102df62cf79e58bd5`                                                 |
| Production image digest                 | `sha256:6318eb286ec3187bd3857389bab5e2b9de6b105ba76307f936d1257b958dfa0c`                  |
| Migration ledger applied                | `0001`–`0023` (includes `0023_learning_persistence`)                                       |
| Server flags ON                         | `TZ_PERSIST`, `SERVER_SESSION_PLAN`, `TODAY_WORKLOAD`, `QUEUE_QUARANTINE`, `BINARY_REVIEW` |
| `LEARNBOX_SCHEDULER_V2`                 | **ABSENT / not authorized**                                                                |
| `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI` | `false` (baked into the artifact; learner UI is legacy four-grade)                         |
| Latest release tag                      | `v1.0.0` still targets `2acdcef4` and is **not** moved                                     |

Repository `main` may advance beyond the Production application SHA through documentation-only
commits. That is intentional and is **not** application drift: compare the Production application
SHA above, not the repository HEAD. Do not deploy merely to equalize the two.

**Source-continuity note (CP11, 2026-10-02).** The CP9 runtime source deployed as `8b7b3290` was
restored to `main` by the runtime-continuity PR #345 after it was found to exist only on an unpushed
local branch. Production was **not** rebuilt, redeployed or reconfigured to achieve this; only the
repository was brought forward. `main` and the Production SHA are therefore still expected to differ,
and that difference must not be "fixed" by a deployment.

Android/Cafe Bazaar, every payment path, premium packs and native iOS remain v1.1 or later.
Future work begins at v1.1; the normalized backlog lives in `BACKLOG.md`.

## Product

LearnBox is an online-first German vocabulary Leitner product for Persian-speaking learners. Web/PWA v1 shipped with 35 free A1 words and no payment requirement. Premium packs and their payment/entitlement paths begin in v1.1. Temporary connectivity loss is tolerated with a durable local queue and idempotent reconnect sync.

## Boundaries

- `learnboxapp.com` is an independent informational landing site only.
- `app.learnboxapp.com` is the LIVE learner Web/PWA surface and interim iOS route.
- Native Android/Cafe Bazaar is a v1.1 learner surface; native iOS is a later App Store milestone.
- Admin manages content, AI drafts, media QA, packs, catalog, commerce and operations.
- API/backend owns identity, learning state, sync, content, purchases and entitlements.

## Current implementation truth

- Web and Flutter learner foundations include Today, Words, Progress, review scheduling, active recall, media/pronunciation foundations, recovery and local pending review events. Web Progress now labels daily/streak figures as browser/device-local, exposes unacknowledged local review answers only when present and explicitly withholds server weekly history (PR #229 at `506b334`).
- Profile is the fourth persistent learner destination on Web and Android, with truthful child Settings surfaces and no premature sign-out/deletion controls. Device-local pronunciation preferences and real playback gating are merged on Web (PR #244 at `b5b07fc`) and Android (PR #245 at `610441a`). A dormant, default-off Web-only masked identity read is merged in PR #248 at `b580d59`; runtime activation and Android identity remain separately gated.
- Admin foundations include protected authentication boundaries, content review workspace, pack readiness/release panel and owner-only splash replacement control. Isolated Admin staging now runs immutable image `learnbox-admin:351f8e3bfbb512bd36c3b43346f496ce0003200e` from merged PR #268: the authenticated shell uses stable inline line SVGs instead of font-dependent sidebar glyphs, while the reviewed LB-DS-054 persistence/runtime state remains unchanged. Migration `0017` retains the reviewed checksum and `35 / 210 / 210 / 0 / 0` truth; only the protected Admin review runtime is enabled. Anonymous session and review reads remain `401` with `no-store`, bootstrap options remain `404`, and the prior `e4e80dcc` image is retained for rollback. The owner authenticated with Passkey and accepted all five deployed line icons and the collapse chevron. Axe and the full assistive-technology matrix remain open. Production, learner delivery, seed, review decisions and publication remain unchanged.
- Persisted Admin content review is merged (PR #252 at `a2a75e9`, LB-DS-049): migration `0017` ingests the 35 committed Start Pack drafts as canonical `cards`/version-1 `card_versions` rows in `needs_review` with six pending checks each (deterministic identities, faithful content, fail-closed rerun guards, no release values), and the Admin queue/check/decision runtime is session-only, DB-role authorized, `no-store`, origin/CSRF/recent-auth protected, idempotent and atomic-audited — approval never publishes. It is active only in isolated Admin staging; no owner decision has been persisted as an Admin review check/decision, and no attachment, seed or publication has occurred.
- Private-media source truth and guarded upload tooling are merged through PR #286 at `da51c9ec`. The bounded owner-authorized operation uploaded exactly 105 private assets to the verified isolated target; all passed cache-disabled private-download byte-count and SHA-256 checks. PR #292 at `ad0b158` added protected staging delivery and the final attestation, whose canonical state remains `private_storage_verified_not_attached` with publication blocked. The URL-free receipt remains outside Git; attachment, seed, activation and publication remain separately gated. LB-DS-080 (branch `feat/s1-start35-private-media-attachment`) adds the canonical digest-anchored attachment record `content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json` and is merged in PR #296 at merge commit `3edc699f4133b7def2a28639fb03ebe312db6953`. It records `private_media_attached` as repository evidence only — `publicationBlocked: true` with `learnerDeliveryActivated`, `databaseMediaRowsWritten` and `providerCallPerformed` false — and states the verified exposure truth that 60 of the 105 attested assets across 20 of the 35 content IDs are byte-identical to copies already tracked in this public repository, while 45 assets across 15 content IDs have no public byte-identical copy. It changed no route, flag, environment, migration, database row, provider call, deployment, seed or publication.
- Starter media canonicalization supersedes the historical 15-card private-Blob attachment assumption. Later evidence showed that historical private upload was not proven for the 15 previously incomplete cards: `start-a1-15-candidate-media-attachment-draft.json` records `uploadPerformed: false` with no checksums, the attested store's object count could not be reconciled against the 105-asset claim, and no byte-identical copy of those 45 assets existed on any reachable disk or in Git history (an exhaustive SHA-256 disk sweep matched 0 of 45). The owner therefore authorized a newly generated, QC-validated replacement set. `content/packs/learnbox-start/validation/start-a1-35-canonical-starter-media-manifest.json` is the canonical single source of truth from this release forward: 35/35 cards and 105/105 media slots (35 images, 35 word audios, 35 sentence audios) with per-asset `bytes`, `sha256`, MIME and runtime identifier, marked 45 `NEW_OWNER_AUTHORIZED_REPLACEMENT` plus 60 `EXISTING_PRESERVED`. All historical records are preserved unchanged for audit (`historicalRecordsDeleted: false`). Delivery stays on the existing authenticated `/api/content-media/[contentId]/[kind]` server-media path — authenticated `200` with `private, no-store`, anonymous `401` with `no-store`, no public/static learning media and no service-worker API caching. `pnpm verify:start-35-canonical-starter-media` and `pnpm test:start-35-canonical-starter-media` fail the release on any missing, mismapped, duplicated, zero-byte, wrong-MIME or digest-drifted slot. Public Activation is not performed and remains owner-gated.
- The batched human-review packet for all 35 items merged in PR #288 at `f0f413b`; PR #289 at `00d8b98` merged LB-DS-077's record of 210/210 explicit owner-submitted `passed` checks (`adminOutcomeRecorded: false`) and 35 `approve` decisions with no reject/return. It remains repository evidence of owner intent only: no Admin/database review outcome, media attachment, seed, runtime activation, provider call or publication occurred, and 0/35 card versions are release-approved.
- Web learner foundations include fail-closed authenticated learner-state reads with runtime flags default-off. PR #293 at `6f1eb9e` replaced eager all-catalog schedule creation with targeted idempotent creation for the one submitted approved card. PR #294 at `21c624a` added a bounded learner-scoped pool of approved/published, unscheduled `start-a1-%` candidates, carries canonical `contentId` beside card UUID, admits at most three after due reviews and none in recovery mode, and performs no read-side schedule write. The truthful Web no-due/recovery/accessibility work and M1-D reconciliation foundations remain merged; Production composition and every sync flag remain disabled. LB-DS-081 (branch `feat/v1-web-vertical-loop`) is merged in PR #297 at merge commit `f727ce5204b04852844fbd4f0cfc79826d5d757e`: signed-cookie server state maps only to canonical Start faces; cookie-authenticated same-origin JSON review POST with request-boundary validation; durable offline queue with lossless reconnect retry; authoritative learner-state refresh; no mobile bearer transport. All gates remain default-off; no runtime flag, database mutation, provider call, seed, activation, deployment or publication occurred.
- Content Factory includes schemas, normalization, batch validation, duplicate foundations, review gates and media-plan boundaries; AI generation and complete Admin job UX remain incomplete.
- Native mobile auth client, UI, fail-closed runtime and local lifecycle harness exist; real native online auth is blocked until a non-SSO gateway is available.
- Commerce currently has provider-neutral foundations only. Real Web bank, Cafe Bazaar and Apple StoreKit adapters, server verification and entitlements are planned.

## Release position

Superseded by the "Release position" section at the top of this document: Web/PWA v1 is LIVE and
CLOSED at Production application SHA `2acdcef4`. The historical pre-activation statement that this
repository was "a tested product foundation, not a released application" applied until
2026-09-28 and is retained here only as history.

## Canonical references

- Product requirements: `docs/product/MASTER_SPEC.md`.
- Product decisions remain traceable in `docs/product-decisions/`, including `PDR-003` for the Bobo/content visual decision.
- Current capability truth: `docs/PRODUCT_STATUS.md`.
- Delivery roadmap: `ROADMAP.md`.

## Safety state

- Web/PWA v1 Production is LIVE. Further Production deployment, DB mutation, credential change,
  SMS configuration change and public-surface change remain owner-gated.
- Live payment, native gateway and store release remain gated and are v1.1 or later.
- Preview SSO must not be bypassed with client secrets.
- No real phone, OTP, receipt, token or provider secret belongs in repository evidence.
- Main remains buildable through reviewed PRs.
- Rollback images, environment backups and the database backup are preserved; do not delete
  recovery evidence without explicit owner authorization naming the artifacts.
- The repository is private because protected learning media is tracked in Git. Do not make it
  public again: anonymous retrieval of protected media through GitHub was a confirmed P0 (LB-B10)
  and repository privacy is what contains it. The media blobs remain in Git history.

## v1.1.0 Option B — released

Tag `v1.1.0` marks the released application commit `46cc45e24bfd54fc1f3f23dd0429c2d4ebb3744f`,
deployed to Production on 2026-09-28 as image
`sha256:a985b81d463b15694282355e7b87a0a91a885fdd470bdf12b45e31caee76ef7c` and merged to `main`
in PR #303. The tag, the image's OCI revision label and the container's runtime `APP_SOURCE_SHA`
all name that one commit. Migration `0019` is applied; it added two tables (34 → 36) and changed
no row of existing data. Scope delivered: LB-B01, LB-B02, LB-B03, LB-B04, LB-B08, LB-B09, LB-B21.

- **Operations (LB-B02).** Daily database backup, uptime monitoring, error capture with proven
  secret redaction, and a weekly restore drill run as systemd timers, alerting through
  `@learnboxmonitoringbot`. The monitoring bot and the learner-facing `@learnboxsupportbot` are
  fully separate — separate tokens and chats — and operational alerts never reach learners.
  The scheduled backup is proven by a real execution: the first timer-driven run
  (`2026-09-29 02:31:01 UTC`) produced a 36-table dump with a clean `gzip -t` and an intact
  dump-complete marker, under a 30-day retention window. The scheduled restore drill has still
  never executed and stays pending until it does — an active timer and a green `Result` are both
  defaults for a unit that never started, so only a non-empty `ExecMainStartTimestamp` counts.
- **Account deletion (LB-B04).** Deletion removes learner data while preserving a
  privacy-minimized deletion audit record and a purchase-ownership claim, and is idempotent
  through a `request_id` unique index. It is covered by unit tests and an 18-check integration
  proof against a copy of the Production database, and it is **Production-proven**: a full
  end-to-end run was executed in Production with a dedicated disposable account, re-proving session
  invalidation, re-registration of the same phone, learner-data removal, audit-record retention and
  the purchase-ownership claim. No real account was used.
- **Lifecycle integrity (LB-B09).** The canonical Starter media manifest now models media exposure
  and release stage independently. `mediaPublicExposureBlocked` and `mediaExposure`
  `authenticated_only` are permanent invariants enforced at every stage; the release stage is
  forward-only and a released claim must carry its Production verification evidence. The previous
  two-boolean schema could only describe the pre-release world. Public announcement remains
  recorded as not performed.
- **Privacy notice.** Rewritten to describe the real system: phone-based OTP authentication with
  hashed short-lived codes, per-phone and per-IP rate limiting, 30-day backup retention, and the
  honest consequence that deletion does not immediately purge backups.
- **Restore-purchase boundary.** Deletion records a purchase-ownership claim so a later
  re-registration of the same phone can be reconciled. No payment, entitlement engine or purchase
  restoration is implemented; that remains out of scope.

Deferred by directive and untouched: LB-B05, LB-B06, LB-B10 residual, LB-B11–LB-B20, Android,
payments, premium packs, iOS, notifications, Content Factory expansion, media migration, audio
regeneration, and Git history cleanup (media blobs remain in history; repository privacy contains
LB-B10).
