# LearnBox stable project state

**Last reviewed:** 2026-09-20

## Product

LearnBox is an online-first German vocabulary Leitner product for Persian-speaking learners. Official Web/PWA v1.0 targets 2026-10-12 with 35 free A1 words and no payment requirement. Premium packs and their payment/entitlement paths begin in v1.1. Temporary connectivity loss is tolerated with a durable local queue and idempotent reconnect sync.

## Boundaries

- `learnboxapp.com` is an independent informational landing site only.
- Learner Web is the current online learner surface and interim iOS route.
- Native Android/Cafe Bazaar is a v1.1 learner surface; native iOS is a later App Store milestone.
- Admin manages content, AI drafts, media QA, packs, catalog, commerce and operations.
- API/backend owns identity, learning state, sync, content, purchases and entitlements.

## Current implementation truth

- Web and Flutter learner foundations include Today, Words, Progress, review scheduling, active recall, media/pronunciation foundations, recovery and local pending review events. Web Progress now labels daily/streak figures as browser/device-local, exposes unacknowledged local review answers only when present and explicitly withholds server weekly history (PR #229 at `506b334`).
- Profile is the fourth persistent learner destination on Web and Android, with truthful child Settings surfaces and no premature sign-out/deletion controls. Device-local pronunciation preferences and real playback gating are merged on Web (PR #244 at `b5b07fc`) and Android (PR #245 at `610441a`). A dormant, default-off Web-only masked identity read is merged in PR #248 at `b580d59`; runtime activation and Android identity remain separately gated.
- Admin foundations include protected authentication boundaries, content review workspace, pack readiness/release panel and owner-only splash replacement control. Isolated Admin staging now runs immutable image `learnbox-admin:351f8e3bfbb512bd36c3b43346f496ce0003200e` from merged PR #268: the authenticated shell uses stable inline line SVGs instead of font-dependent sidebar glyphs, while the reviewed LB-DS-054 persistence/runtime state remains unchanged. Migration `0017` retains the reviewed checksum and `35 / 210 / 210 / 0 / 0` truth; only the protected Admin review runtime is enabled. Anonymous session and review reads remain `401` with `no-store`, bootstrap options remain `404`, and the prior `e4e80dcc` image is retained for rollback. The owner authenticated with Passkey and accepted all five deployed line icons and the collapse chevron. Axe and the full assistive-technology matrix remain open. Production, learner delivery, seed, review decisions and publication remain unchanged.
- Persisted Admin content review is merged (PR #252 at `a2a75e9`, LB-DS-049): migration `0017` ingests the 35 committed Start Pack drafts as canonical `cards`/version-1 `card_versions` rows in `needs_review` with six pending checks each (deterministic identities, faithful content, fail-closed rerun guards, no release values), and the Admin queue/check/decision runtime is session-only, DB-role authorized, `no-store`, origin/CSRF/recent-auth protected, idempotent and atomic-audited — approval never publishes. It is active only in isolated Admin staging; no owner decision has been persisted as an Admin review check/decision, and no attachment, seed or publication has occurred.
- Private-media source truth and guarded upload tooling are merged through PR #286 at `da51c9ec`. The bounded owner-authorized operation uploaded exactly 105 private assets to the verified isolated target; all passed cache-disabled private-download byte-count and SHA-256 checks. PR #292 at `ad0b158` added protected staging delivery and the final attestation, whose canonical state remains `private_storage_verified_not_attached` with publication blocked. The URL-free receipt remains outside Git; attachment, seed, activation and publication remain separately gated. LB-DS-080 (branch `feat/s1-start35-private-media-attachment`, local commit awaiting review, unpushed) adds the canonical digest-anchored attachment record `content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json`. It records `private_media_attached` as repository evidence only — `publicationBlocked: true` with `learnerDeliveryActivated`, `databaseMediaRowsWritten` and `providerCallPerformed` false — and states the verified exposure truth that 60 of the 105 attested assets across 20 of the 35 content IDs are byte-identical to legacy copies already tracked in this public repository, while 45 assets across 15 content IDs have no public byte-identical copy. It changed no route, flag, environment, migration, database row, provider call, deployment, seed or publication.
- The batched human-review packet for all 35 items merged in PR #288 at `f0f413b`; PR #289 at `00d8b98` merged LB-DS-077's record of 210/210 explicit owner-submitted `passed` checks (`adminOutcomeRecorded: false`) and 35 `approve` decisions with no reject/return. It remains repository evidence of owner intent only: no Admin/database review outcome, media attachment, seed, runtime activation, provider call or publication occurred, and 0/35 card versions are release-approved.
- Web learner foundations include fail-closed authenticated learner-state reads with runtime flags default-off. PR #293 at `6f1eb9e` replaced eager all-catalog schedule bootstrap with targeted idempotent creation for the one submitted approved card. PR #294 at `21c624a` added a bounded learner-scoped pool of approved/published, unscheduled `start-a1-%` candidates, carries canonical `contentId` beside card UUID, admits at most three after due reviews and none in recovery mode, and performs no read-side schedule write. The truthful Web no-due/recovery/accessibility work and M1-D reconciliation foundations remain merged; Production composition and every sync flag remain disabled.
- Content Factory includes schemas, normalization, batch validation, duplicate foundations, review gates and media-plan boundaries; AI generation and complete Admin job UX remain incomplete.
- Native mobile auth client, UI, fail-closed runtime and local lifecycle harness exist; real native online auth is blocked until a non-SSO gateway is available.
- Commerce currently has provider-neutral foundations only. Real Web bank, Cafe Bazaar and Apple StoreKit adapters, server verification and entitlements are planned.

## Release position

The repository is a tested product foundation, not a released application. The active target is official public Web/PWA v1.0 by 2026-10-12 after a real closed alpha; production activation and public release remain gated. Android/Cafe Bazaar and every payment path are post-v1.0.

## Canonical references

- Product requirements: `docs/product/MASTER_SPEC.md`.
- Product decisions remain traceable in `docs/product-decisions/`, including `PDR-003` for the Bobo/content visual decision.
- Current capability truth: `docs/PRODUCT_STATUS.md`.
- Delivery roadmap: `ROADMAP.md`.

## Safety state

- Production services, broad public cohort, live payment, native gateway and store release remain gated.
- Preview SSO must not be bypassed with client secrets.
- No real phone, OTP, receipt, token or provider secret belongs in repository evidence.
- Main remains buildable through reviewed PRs.
