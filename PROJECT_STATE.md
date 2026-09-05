# LearnBox stable project state

**Last reviewed:** 2026-09-05

## Product

LearnBox is an online-first German vocabulary Leitner product for Persian-speaking learners. The free app includes approximately 35 complete A1 words. Premium vocabulary packs are purchased separately. Temporary connectivity loss is tolerated with a durable local queue and idempotent reconnect sync.

## Boundaries

- `learnboxapp.com` is an independent informational landing site only.
- Learner Web is the current online learner surface and interim iOS route.
- Android is a native learner surface; native iOS is a later App Store milestone.
- Admin manages content, AI drafts, media QA, packs, catalog, commerce and operations.
- API/backend owns identity, learning state, sync, content, purchases and entitlements.

## Current implementation truth

- Web and Flutter learner foundations include Today, Words, Progress, review scheduling, active recall, media/pronunciation foundations, recovery and local pending review events.
- Admin foundations include protected authentication boundaries, content review workspace, pack readiness/release panel and owner-only splash replacement control.
- Web learner foundations include a fail-closed server-backed learner-state read (`GET /api/learner/state`, `WEB_LEARNER_STATE_ENABLED` defaults false, merged in PR #163); the actionable Today figure stays local until approved/published Start Pack catalog rows exist. M1-D cursor persistence, request validation and the dormant reconciliation read route are merged (PRs #169–#172, #184–#185 and #209); network sync and client composition remain disabled.
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
