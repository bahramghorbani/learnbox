# Active agent brief

Use this brief after `AGENTS.md` and `AI_BOOTSTRAP.md`. The canonical product status is [`docs/PRODUCT_STATUS.md`](../../docs/PRODUCT_STATUS.md); this file is only an execution aid.

**This is the single provider-neutral entry point.** Hermes, Claude, Codex and any future agent start here to learn what is done, what is deployed, what is blocked, what is approved next and what it may actually do. It is a short index, not a second source of truth: every claim below links to the canonical document that owns it, and when the two disagree the canonical document wins.

## State of the system (reviewed 2026-10-16)

**Start here for current Production and content work:** [`ADMIN_PRODUCTION_STATUS.md`](./ADMIN_PRODUCTION_STATUS.md) — running release, rollback, capabilities, the Admin workflow from title to publication, and collaboration rules. Product rules for new packs: [`PDR-010`](../product-decisions/PDR-010-ARTICLE-AWARE-AUDIO-AND-MEDIA-STANDARDS.md#owner-pack-content-decisions-2026-10-16).

**Deployed and verified (Iran Production host, 2026-10-16)**

- Product source `15e6783` (PR #426). Learner App `sha256:87490d60…`, Admin `sha256:ba7cfcf5…`, both healthy, schema head `0038_card_media_completion`. Software rollback: App `175daeb8…`, Admin `6e77c2f7…` (image swap only; `0038` stays).
- `main` is `93794c3` (PR #429): release tooling and docs only on top of the deployed source. Do not deploy to equalize SHAs.
- Text AI and Media AI are on in the Admin only; Learner Profile Identity is on; payments are off; private Starter-media attachment is off and unrelated to new pack media.
- Open: #427 (Starter editorial values), #428 (Starter pack id rejected by Admin routes), #430 (cause of the earlier lost Profile flag unproven; live symptom fixed). The ArvanCloud timeout risk for long Admin AI requests is unverified.

**Not done, and not to be assumed**

- **Payments are inactive.** Zarinpal credentials have never been supplied and payment activation is pending an owner decision. `LEARNBOX_ZARINPAL_ENABLED` is absent in Production. Revenue and sales metrics are therefore `unavailable`, not zero-valued facts.
- **Android development has not started.** `apps/mobile` holds no shipped product. No build, signing key, store listing or placeholder artifact exists, and none may be created without a separate owner decision.
- **No component has a published release under the new tag scheme.** Admin and Android have never published any release at all.

**Four distinct actions — never collapse them**

Merging a PR, creating a Git tag, publishing a GitHub Release, and deploying to Production are four separate actions. A merge authorizes none of the other three; a GitHub Release does not deploy anything; a deployment does not publish a release. The last three each need their own owner authorization. Rules and release contents: [`docs/release/VERSIONING.md`](../release/VERSIONING.md).

**Shared-backend invariant**

The Learner PWA and the future Android app are two clients of **one** backend. They share accounts, learning progress, entitlements and the review-sync contract. Android never gets its own database, account namespace or divergent sync protocol. Any change that would fork them is out of scope without an explicit architecture decision.

## Versions

| Product     | Version on `main` | Tag namespace    | Published releases                                                             |
| ----------- | ----------------- | ---------------- | ------------------------------------------------------------------------------ |
| Learner PWA | `1.2.2`           | `learner/vX.Y.Z` | `v1.0.0`–`v1.2.1` (legacy repository-wide tags, history); tag `learner/v1.2.2` |
| Admin Web   | `0.1.0`           | `admin/vX.Y.Z`   | none — deployed is not released                                                |
| Android     | `0.1.0+1`         | `android/vX.Y.Z` | none — not started                                                             |

Each version comes from that product's own file and is shown in its own UI (Learner: bottom of the Profile screen; Admin: bottom of the RTL sidebar). `pnpm verify:version-sources` fails if a product can display another's version.

## Next permitted task

Nothing in this brief authorizes new work. Before starting anything, read [`.ai/WORK_QUEUE.md`](../../.ai/WORK_QUEUE.md) for the authorized task and [`CURRENT_WORK.md`](../../CURRENT_WORK.md) for unmerged branches, and confirm no open PR already covers it. Work that is **explicitly not approved** right now: payment activation, Android implementation, Production deployment or configuration change, Merge, tag creation, GitHub Release publication, any change to the live Learner PWA, Starter changes, and any paid AI call by an agent. Each needs its own explicit owner authorization; paid generation is done by the owner in the Admin UI.

## Release rules

Release artifacts follow [`RELEASE_ARTIFACT_PREFLIGHT.md`](./RELEASE_ARTIFACT_PREFLIGHT.md): build from the exact pushed source SHA for `linux/amd64`, compare the public build-flag matrix against the running image, and stop on any missing or changed approved flag. Never bypass the preflight. Production steps (backup, migration, deploy, rollback) are in the Iran runbook on the open PR #423 branch (`docs/operations/IRAN_MIGRATION_RUNBOOK.md`; not yet on `main`). [`ADMIN_RELEASE_HANDOFF.md`](./ADMIN_RELEASE_HANDOFF.md) describes the earlier Admin release and is historical.

## Current product truth

- LearnBox is an online-first German vocabulary Leitner product, not an offline-only app and not a prototype.
- Web/PWA v1 is live with the 35-word A1 Starter pack; Android and payment are not active. New packs are built in the Admin and published only by a human.
- Temporary connectivity loss is tolerated by a durable local queue and idempotent reconnect sync.
- `learnboxapp.com` is an independent informational landing site and must not be coupled to learner, admin, API or private media.
- Web is the current learner/iOS interim surface; Android is native; native iOS is a later App Store milestone.
- Future payments remain platform-specific (Web bank, Cafe Bazaar, Apple IAP) with shared server entitlement, but none is a Web v1.0 requirement.
- AI can generate pack drafts and media candidates; human review is required before publication.

## Read order

1. `AGENTS.md`
2. `AI_BOOTSTRAP.md`
3. `PROJECT_STATE.md`
4. `docs/PRODUCT_STATUS.md`
5. `ROADMAP.md`
6. `docs/release/VERSIONING.md` before anything that touches a version, tag, release or deployment
7. `.ai/WORK_QUEUE.md` and `.ai/WORKSTREAMS.md`
8. `CURRENT_WORK.md` for unmerged work
9. Task-specific design, tests and operations docs

## Delivery model

Work by the S0–S5 dates and exit gates in `ROADMAP.md`, not serial micro-tasks. Use at most two independent worktrees for genuinely disjoint paths. Auth/session, database, infrastructure and release remain serial with high-reasoning review.

## Safety

- Do not call paid providers, use real payment, send OTP, enable Production, mutate DNS, enter secrets or perform destructive actions without the relevant owner gate.
- Never claim prototype/test code is a released feature.
- Never present a deployed artifact as a published release, or a merged PR as a deployment.
- Never add secrets, receipts, phone numbers, OTPs or personal data to docs, logs or handoffs.
- Keep Splash, Profile, Settings, Progress, Purchases, Personal Vocabulary and Sync Status in product scope.
