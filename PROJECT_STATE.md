# LearnBox stable project state

**Last reviewed:** 2026-09-14

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
- Persisted Admin content review is merged (PR #252 at `a2a75e9`, LB-DS-049): migration `0017` ingests the 35 committed Start Pack drafts as canonical `cards`/version-1 `card_versions` rows in `needs_review` with six pending checks each (deterministic identities, faithful content, fail-closed rerun guards, no release values), and the Admin queue/check/decision runtime is session-only, DB-role authorized, `no-store`, origin/CSRF/recent-auth protected, idempotent and atomic-audited — approval never publishes. It is active only in isolated Admin staging; no human review check, decision, attachment, seed or publication has occurred.
- Private-media source truth and guarded upload tooling are merged through PR #286 at `da51c9ec`. The bounded owner-authorized operation uploaded exactly 105 private assets to the verified isolated target; all passed cache-disabled private-download byte-count and SHA-256 checks on both the initial and complete resume runs. The URL-free receipt remains outside Git. PR #288 subsequently merged the repository-only batched 35-item/six-dimension review packet, and Draft PR #289 records the returned owner intent without executing it. No attachment, Admin review outcome, seed, activation, deployment or publication occurred; Admin persistence and attachment remain separately owner-gated.
- The batched human-review packet for all 35 items is merged (PR #288 at `f0f413b`), and the owner returned that review: LB-DS-077 records 210/210 explicit owner-submitted `passed` checks (`ownerSubmittedOutcome` with `adminOutcomeRecorded: false` on every check, never a bare `outcome`) and 35 `approve` decisions with no `reject` or `return_for_revision` in `content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json`, validated against the merged packet, the migration `0006` vocabulary and the recorded merge commit by `scripts/validate-start-35-owner-review-decisions.mjs` (wired into `pnpm check`). The record states the accepted surface as one self-contained offline 35-card review artifact's content and card flow with `app_flow` still `pending_unproven` / `unproven_at_release_level` and `reviewPresentation` denying Production runtime, activation, Admin persistence or live database verification; it preserves both prior transcription exceptions as accepted-as-presented and unpersisted; and it marks `reviewerRole: 'owner'` as owner-asserted through the submitted artifact with no identity, cryptographic or session proof. That record is repository evidence of owner intent only: no Admin/database review row, media attachment, seed, runtime activation, provider call or publication occurred, and it keeps `seedable: false`, `attachmentAllowed: false` and `publicationBlocked: true` with 0/35 release-approved card versions.
- Web learner foundations include a fail-closed server-backed learner-state read (`GET /api/learner/state`, `WEB_LEARNER_STATE_ENABLED` defaults false, merged in PR #163); the actionable Today figure stays local until approved/published Start Pack catalog rows exist. The truthful Web no-due state, recovery Bobo, single focused Words action and mobile/reflow navigation correction merged in PR #257 at `d80c37e`; no server state or runtime flag was activated. PR #282 at `c67433c` adds accessible names and decorative-image semantics to the Web offline/error surfaces, keeps hydrated offline/reconnect headings and messages truthful, preserves one non-empty composed status announcement, and refreshes the static fallback through the owned service-worker cache version only. M1-D cursor persistence, request validation and the dormant reconciliation read route are merged (PRs #169–#172, #184–#185 and #209); PR #219 at `82afe3b` hardens the read against checkpoint races and out-of-range BIGINT cursors. PR #260 at `38e03bd` adds the strictly parsed, bounded Flutter reconciliation client/coordinator path while preserving POST-only queue removal. Production composition, auth and every sync flag remain disabled; no network route was activated.
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
