# LearnBox stable project state

**Last reviewed:** 2026-09-09

## Product

LearnBox is an online-first German vocabulary Leitner product for Persian-speaking learners. The free app includes approximately 35 complete A1 words. Premium vocabulary packs are purchased separately. Temporary connectivity loss is tolerated with a durable local queue and idempotent reconnect sync.

## Boundaries

- `learnboxapp.com` is an independent informational landing site only.
- Learner Web is the current online learner surface and interim iOS route.
- Android is a native learner surface; native iOS is a later App Store milestone.
- Admin manages content, AI drafts, media QA, packs, catalog, commerce and operations.
- API/backend owns identity, learning state, sync, content, purchases and entitlements.

## Current implementation truth

- Web and Flutter learner foundations include Today, Words, Progress, review scheduling, active recall, media/pronunciation foundations, recovery and local pending review events. Web Progress now labels daily/streak figures as browser/device-local, exposes unacknowledged local review answers only when present and explicitly withholds server weekly history (PR #229 at `506b334`).
- Profile is the fourth persistent learner destination on Web and Android, with truthful child Settings surfaces and no premature sign-out/deletion controls. Device-local pronunciation preferences and real playback gating are merged on Web (PR #244 at `b5b07fc`) and Android (PR #245 at `610441a`). A dormant, default-off Web-only masked identity read is merged in PR #248 at `b580d59`; runtime activation and Android identity remain separately gated.
- Admin foundations include protected authentication boundaries, content review workspace, pack readiness/release panel and owner-only splash replacement control. The current merged Admin build (`254276e`, PR #214) is deployed to isolated staging with the Passkey UI compiled into the image; unauthenticated access shows the Passkey login, bootstrap remains closed, and local review actions remain non-persistent. Production is unchanged.
- Persisted Admin content review is merged but dormant (PR #252 at `a2a75e9`, LB-DS-049): migration `0017` ingests the 35 committed Start Pack drafts as canonical `cards`/version-1 `card_versions` rows in `needs_review` with six pending checks each (deterministic identities, faithful content, fail-closed rerun guards, no release values), and the Admin queue/check/decision runtime sits behind the default-off `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED` gate with session-only actors, DB role authorization, no-store reads, origin/CSRF/recent-auth writes, row locks, idempotency and atomic audit — approval never publishes. The migration has not been executed outside an ephemeral validation container, the flag is not enabled, and no staging/Preview/Production change is included.
- Web learner foundations include a fail-closed server-backed learner-state read (`GET /api/learner/state`, `WEB_LEARNER_STATE_ENABLED` defaults false, merged in PR #163); the actionable Today figure stays local until approved/published Start Pack catalog rows exist. M1-D cursor persistence, request validation and the dormant reconciliation read route are merged (PRs #169–#172, #184–#185 and #209); PR #219 at `82afe3b` hardens the read against checkpoint races and out-of-range BIGINT cursors. Network sync and client composition remain disabled.
- Content Factory includes schemas, normalization, batch validation, duplicate foundations, review gates and media-plan boundaries; AI generation and complete Admin job UX remain incomplete.
- Native mobile auth client, UI, fail-closed runtime and local lifecycle harness exist; real native online auth is blocked until a non-SSO gateway is available.
- Commerce currently has provider-neutral foundations only. Real Web bank, Cafe Bazaar and Apple StoreKit adapters, server verification and entitlements are planned.

## Release position

The repository is a tested product foundation, not a released commercial application. M1/M2 foundations and controlled Preview slices exist; the next release target remains a real closed alpha, with production activation, payment and public release gated.

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
