# Active agent brief

Use this brief after `AGENTS.md` and `AI_BOOTSTRAP.md`. The canonical product status is [`docs/PRODUCT_STATUS.md`](../../docs/PRODUCT_STATUS.md); this file is only an execution aid.

**This is the single provider-neutral entry point.** Hermes, Claude, Codex and any future agent start here to learn what is done, what is deployed, what is blocked, what is approved next and what it may actually do. It is a short index, not a second source of truth: every claim below links to the canonical document that owns it, and when the two disagree the canonical document wins.

## State of the system (reviewed 2026-10-12)

**Deployed and verified**

- **Learner PWA** is LIVE at `app.learnboxapp.com` from `fa44d21a`, image `sha256:65cd79695c1c…`, schema head `0034`. It is a **separate production surface from Admin and must remain untouched** by Admin or versioning work: do not rebuild, redeploy or restart it without its own owner authorization.
- **Admin Web** is deployed from `079a94a7`, image `sha256:756abad30bc7…`, healthy, and **operator-verified**: real operator Passkey sign-in and re-authentication were exercised against Production.
- **Admin Dashboard** is **activated and operator-verified** in Production (`LEARNBOX_ADMIN_DASHBOARD_ENABLED=true`, Admin service only). Its KPIs and charts were checked against real database aggregates; metrics with no data source render an explicit unavailable state rather than a fabricated number.

**Not done, and not to be assumed**

- **Payments are inactive.** Zarinpal credentials have never been supplied and payment activation is pending an owner decision. `LEARNBOX_ZARINPAL_ENABLED` is absent in Production; `store_listings = 0`, `purchase_events = 0`. Revenue and sales metrics are therefore `unavailable`, not zero-valued facts.
- **Android development has not started.** `apps/mobile` holds no shipped product. No build, signing key, store listing or placeholder artifact exists, and none may be created without a separate owner decision.
- **No component has a published release under the new tag scheme.** Admin and Android have never published any release at all.

**Four distinct actions — never collapse them**

Merging a PR, creating a Git tag, publishing a GitHub Release, and deploying to Production are four separate actions. A merge authorizes none of the other three; a GitHub Release does not deploy anything; a deployment does not publish a release. The last three each need their own owner authorization. Rules and release contents: [`docs/release/VERSIONING.md`](../release/VERSIONING.md).

**Shared-backend invariant**

The Learner PWA and the future Android app are two clients of **one** backend. They share accounts, learning progress, entitlements and the review-sync contract. Android never gets its own database, account namespace or divergent sync protocol. Any change that would fork them is out of scope without an explicit architecture decision.

## Versions

| Product     | Version on `main` | Tag namespace    | Published releases                                                               |
| ----------- | ----------------- | ---------------- | -------------------------------------------------------------------------------- |
| Learner PWA | `1.2.1`           | `learner/vX.Y.Z` | `v1.0.0`, `v1.2.0`, `v1.2.1` (legacy repository-wide tags, preserved as history) |
| Admin Web   | `0.1.0`           | `admin/vX.Y.Z`   | none — deployed is not released                                                  |
| Android     | `0.1.0+1`         | `android/vX.Y.Z` | none — not started                                                               |

Each version comes from that product's own file and is shown in its own UI (Learner: bottom of the Profile screen; Admin: bottom of the RTL sidebar). `pnpm verify:version-sources` fails if a product can display another's version.

## Next permitted task

Nothing in this brief authorizes new work. Before starting anything, read [`.ai/WORK_QUEUE.md`](../../.ai/WORK_QUEUE.md) for the authorized task and [`CURRENT_WORK.md`](../../CURRENT_WORK.md) for unmerged branches, and confirm no open PR already covers it. Work that is **explicitly not approved** right now: payment activation, Android implementation, Production deployment, tag creation, GitHub Release publication, and any change to the live Learner PWA.

## Current Admin release handoff

Admin release preparation is complete on `main` at `4d077214d05e7dc363fbfc968c0d74c6d7b3ee15`; Production deployment remains owner-gated. Read [`ADMIN_RELEASE_HANDOFF.md`](./ADMIN_RELEASE_HANDOFF.md) before any Admin release, recovery, or Production task. It is an index to the canonical readiness and recovery records, not a deployment authorization.

## Current product truth

- LearnBox is an online-first German vocabulary Leitner product, not an offline-only app and not a prototype.
- Web/PWA v1.0 targets 2026-10-12 with 35 complete A1 words; Android, premium packs and payment are v1.1+.
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
