# LearnBox product status

**Document role:** canonical, human-readable product and delivery status.
**Last reviewed:** 2026-08-30.
**Status vocabulary:**

- **Implemented:** code or documented foundation exists.
- **Verified:** implemented and supported by current tests/evidence.
- **Dormant:** implemented but deliberately disabled or unreachable in normal builds.
- **Partial:** meaningful pieces exist, but the user journey is not a complete release feature.
- **Blocked:** design/code exists but an external dependency prevents safe activation.
- **Planned:** approved direction, not implemented as a release feature.
- **Out of scope:** not part of the current product release.

## Product definition

LearnBox is an online-first German vocabulary Leitner application for Persian-speaking learners. The app is free to download and includes a complete free A1 starter collection of approximately 350 words. Premium vocabulary packs are purchased separately. Account, content ownership, progress and entitlements are server-backed; a temporary loss of connectivity must preserve local review actions and synchronize them idempotently after reconnect.

## Product surfaces and boundaries

| Surface           | Purpose                                                             | Current truth                                                                                   |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `learnboxapp.com` | Informational marketing landing only                                | Independent boundary; no learner, admin, API, auth or private-media dependency is allowed       |
| Learner Web App   | Online learner experience and interim iOS access                    | Substantial learner loop exists; release hardening and commercial journeys remain               |
| Android app       | Native learner experience                                           | Offline-tolerant learner shell and auth seams exist; online activation and store release remain |
| Native iOS app    | Final App Store client                                              | Planned after web/iOS validation and commercial contracts                                       |
| Admin panel       | Content, pack, commerce and operational control                     | Auth, review, pack-release and splash foundations exist; full operations remain                 |
| API/backend       | Accounts, learning state, sync, content, purchases and entitlements | Domain foundations exist; production server activation remains gated                            |
| Workers           | AI content, media, notifications and reconciliation jobs            | Content-pipeline foundations exist; production orchestration remains planned                    |

## Capability inventory

### Learner experience

| Capability                          | Surface             | Status                | Evidence / next step                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persian RTL shell and design system | Web / Android       | Verified              | Existing learner screens, Flutter tests and design packages                                                                                                                                                                                             |
| Launch splash experience            | Web / Android       | Verified / controlled | Launch components and owner splash boundary; retain as real product UX                                                                                                                                                                                  |
| Today daily learning session        | Web / Android       | Verified foundation   | Three-card Start flow and active recall tests; server-backed figures behind `WEB_LEARNER_STATE_ENABLED` (LB-DS-022, merged in PR #163) with local figure until the Start Pack ↔ canonical `contentId` join is approved; expand to server-backed catalog |
| Leitner/adaptive scheduling         | Shared engine       | Verified foundation   | Learning engine and review-grade tests; connect to server state                                                                                                                                                                                         |
| Words / vocabulary browsing         | Web / Android       | Verified foundation   | Existing Words screens; expand to pack/catalog and personal vocabulary                                                                                                                                                                                  |
| Progress and streak                 | Web / Android       | Partial               | Progress and calm streak behavior exist; full server-backed analytics remain                                                                                                                                                                            |
| Profile and account center          | Web / Android       | Planned               | Add account, settings, purchases, packs, sync and support                                                                                                                                                                                               |
| Personal vocabulary                 | Web / Android       | Partial foundation    | Add-word and duplicate-check journey must be completed                                                                                                                                                                                                  |
| User offline tolerance              | Web / Android       | Verified foundation   | Local queue/recovery exists; truthful loading/error/offline labels on Today; online-first server reconciliation is next                                                                                                                                 |
| Online account/auth                 | Web                 | Partial / gated       | Browser auth foundation exists; cookie subject = canonical `users.id`; production activation remains gated                                                                                                                                              |
| Native mobile auth                  | Android / iOS       | Dormant / blocked     | Client, UI, runtime and local harness exist; non-SSO native gateway required                                                                                                                                                                            |
| Notifications/reminders             | Web / Android / iOS | Planned               | Define preference, delivery and quiet-hour product behavior                                                                                                                                                                                             |

### Content and packages

| Capability                            | Status               | Truth                                                                                                 |
| ------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| Free A1 starter collection            | Partial / controlled | Start slice and validated content foundations exist; target product is about 350 words                |
| Vocabulary item schema                | Verified foundation  | Canonical items, media and validation boundaries exist                                                |
| AI pack generation from admin request | Partial foundation   | Content Factory and provider-neutral validation exist; admin generation UX and production jobs remain |
| Image and pronunciation package       | Partial foundation   | Media plans and QA contracts exist; complete pack production flow remains                             |
| Duplicate prevention                  | Partial foundation   | Normalization and within-batch checks exist; cross-pack and per-user dedupe must be completed         |
| Human editorial review                | Verified foundation  | Review gate blocks AI direct publication                                                              |
| Pack versioning/release/rollback      | Partial              | Release readiness panel and manifests exist; complete operational flow remains                        |
| Personal word generation              | Planned              | Keep personal content separate from official published catalog                                        |

### Admin panel

| Capability                           | Status              | Truth                                                                  |
| ------------------------------------ | ------------------- | ---------------------------------------------------------------------- |
| Admin authentication boundary        | Verified foundation | Passkey/AuthGate UI and security boundary tests exist                  |
| Content review workspace             | Verified foundation | Local review states and UI exist                                       |
| Pack readiness/release panel         | Verified foundation | Readiness checks and release UI exist                                  |
| Splash replacement control           | Verified foundation | Owner-only protected flow exists; retain and do not expose to learners |
| AI pack generator UI                 | Planned             | Natural-language request plus structured preview                       |
| Content/media QA queue               | Partial             | Contracts exist; unified operational queue remains                     |
| Pack catalog and pricing             | Planned             | Required for premium commerce                                          |
| Users/cohorts/support                | Planned             | Needed for closed alpha operations                                     |
| Purchases/entitlements/refunds       | Planned             | Requires verified provider adapters and audit log                      |
| Admin audit log/operations dashboard | Planned             | Required before real commercial rollout                                |

### Commerce

| Capability                       | Status             | Target                                                                   |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| Free app and free A1 entitlement | Approved direction | Launch baseline                                                          |
| Web direct bank gateway          | Planned            | Real closed-alpha purchases after provider/server readiness              |
| Android Cafe Bazaar billing      | Planned            | Native in-app purchase with server-side verification                     |
| iOS Apple In-App Purchase        | Planned            | StoreKit with server-side verification                                   |
| Platform-specific pricing        | Approved direction | Separate offers/prices/product IDs per platform; shared pack entitlement |
| Restore/refund/revoke            | Planned            | Required in commerce MVP                                                 |
| Subscription                     | Deferred           | Do not mix with one-time vocabulary packs until explicitly approved      |

### Infrastructure and release

| Capability                     | Status             | Truth                                                                                |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| Independent landing deployment | Owner-confirmed    | `learnboxapp.com`; keep separate                                                     |
| Cloudflare DNS                 | Owner-confirmed    | DNS configured by owner                                                              |
| Same-server app stack          | Foundation / gated | Internal Docker/Caddy stack exists; public production route remains to be configured |
| Native gateway                 | Blocked            | Requires secure server access, TLS, route isolation, limits and secrets              |
| CI quality/security gates      | Verified           | Existing checks are required at milestone boundaries                                 |
| Public production              | Not enabled        | No production activation without owner-approved release gate                         |
| Store release                  | Planned            | Android/Cafe Bazaar first; native iOS/App Store later                                |

## Design and visual readiness

The current design direction is credible and reviewed, but the complete application visual system is not yet production-ready. See [`docs/design/DESIGN_STATUS.md`](design/DESIGN_STATUS.md) for the evidence, readiness matrix and design gates. Existing concept screens may be shown as references; they must not be represented as completed product surfaces.

## Current release position

The repository is a tested foundation, not a finished commercial application. The next release target is a real closed alpha of the online learner web product plus operational admin/content tooling. Android remains a real learner app with offline tolerance, not an offline-only product. Native iOS is a later store release. Premium commerce is part of the product plan and must be designed now, but provider activation remains a separate controlled milestone.

## Source-of-truth order

1. This document for user-visible capability/status.
2. `ROADMAP.md` for milestones and exit criteria.
3. `docs/architecture/SYSTEM_CONTEXT.md` and `ARCHITECTURE.md` for boundaries.
4. `docs/product/FEATURE_CATALOG.md`, `docs/product/PRD.md` and `docs/product/MONETIZATION.md` for product contracts.
5. Feature-specific design, operation and evidence documents.
6. Historical storyboard/evidence documents, which retain history but cannot override current status without an explicit decision record.

Do not interpret a test, prototype, dormant flag or design document as a released feature unless this inventory says so.
