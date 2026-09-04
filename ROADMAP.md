# LearnBox release roadmap

**Canonical roadmap:** milestones describe product outcomes, not a list of micro-commits. Dates are estimates from a confirmed baseline and exclude provider approval, owner credentials, store review and major scope changes.

## Product strategy

LearnBox is an online-first German vocabulary Leitner product. The free app includes approximately 35 complete A1 words. Premium vocabulary packs are sold through platform-appropriate payment adapters: direct bank gateway on Web, Cafe Bazaar in-app billing on Android, and Apple In-App Purchase on iOS. All verified purchases produce shared backend entitlements. Temporary connectivity loss is tolerated through a local pending queue and idempotent sync.

The landing site at `learnboxapp.com` is informational only and remains independent from learner, admin, API and private-media surfaces.

## Milestones

| Milestone                      | Outcome                                    | Scope                                                                                                                                                    | Exit criteria                                                                           |                                          Estimate |
| ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------: |
| M0 Product truth               | One current product model                  | inventory, boundaries, docs governance, decisions, architecture                                                                                          | status matrix reviewed; stale docs marked; queue aligned                                |                                          3–5 days |
| M1 Online learning core        | A learner can use the product online       | account/auth, 35-word A1 free pack, Today, review scheduling, progress, server persistence, offline pending queue and reconnect sync                     | complete learner journey tested on Web and Android; no lost or duplicate review events  |                                         3–5 weeks |
| M2 Admin/content operations    | Team can produce and release quality packs | AI request-to-draft, batch generation, duplicate scan, human review, media QA, pack versioning, release/rollback                                         | one approved pack released through Admin with evidence and rollback                     | 3–4 weeks; overlaps M1 only on disjoint contracts |
| M3 Profile and learner account | User can manage their account and learning | profile, settings, purchases, packs, sync status, support, privacy, personal vocabulary and duplicate checks                                             | account center works on Web/Android with truthful loading/error/offline states          |                         2–3 weeks; overlaps M1/M2 |
| M4 Commerce MVP                | Real premium pack purchases work           | catalog, platform offers, Web bank gateway, Cafe Bazaar adapter, iOS StoreKit contract, receipt verification, entitlement, restore, refund/revoke, audit | one controlled real purchase per enabled platform is reconciled to a shared entitlement |         4–6 weeks after provider/server readiness |
| M5 Native mobile alpha         | Android is an online-first real app        | native gateway, auth/session, online sync, premium access, device QA, release build discipline                                                           | owner device completes auth, sync and premium access; rollback proven                   |                  2–3 weeks after server readiness |
| M6 Closed beta                 | Limited invited users can use it safely    | cohort operations, support, observability, abuse limits, backups, load/recovery, content cadence                                                         | agreed cohort completes learning and purchase journeys with incident runbook            |                                         3–4 weeks |
| M7 Android public release      | Android commercial release                 | Cafe Bazaar listing, signing, store compliance, support, production release and rollback                                                                 | approved production release with monitoring and rollback evidence                       |                                         3–5 weeks |
| M8 Native iOS release          | iOS App Store product                      | native iOS shell, StoreKit, account/entitlement handling, privacy/deletion, device QA, App Store submission                                              | App Store review-ready build and operational support                                    |                                4–7 weeks after M4 |

## Design gates

Visual design is a delivery track, not polish after engineering. It runs alongside M0–M3 and gates implementation of new surfaces:

- **D0 Visual language:** tokens, typography, RTL/LTR rules, iconography, Bobo/brand usage and responsive grid.
- **D1 Learner UI kit:** Splash, Onboarding, Today, Review, Words, Progress, Profile and Settings with loading, empty, error, offline and sync states.
- **D2 Commerce/Admin UI:** Store, Pack detail, offers, checkout result, Purchases, My Packs and Content Factory/review.
- **D3 Visual verification:** target-size screenshots, Web responsive checks, accessibility, reduced motion and implementation parity.

The current evidence and readiness matrix live in [`docs/design/DESIGN_STATUS.md`](docs/design/DESIGN_STATUS.md). Existing concept images may be shown for review, but a concept is not a release approval. A new surface may enter production implementation only after its design states, copy, accessibility behavior and acceptance criteria are recorded.

```text
M0
 ↓
M1 ─────┐
M2 ─────┼──> M3 ──> M4 ──> M5 ──> M6 ──> M7
Landing boundary remains independent                 └──> M8
```

M1, M2 and M3 can overlap only where their contracts and allowed paths are disjoint. M4–M8 are dependency-heavy and should not be split into unrelated micro-tasks.

## Release definitions

### Closed alpha

- Independent landing remains unchanged.
- Web learner completes sign-in, daily review, progress and recovery.
- 35-word A1 free collection is usable and editorially approved.
- Admin can create/review/release a pack or controlled content update.
- Real purchases are enabled only for the explicitly approved provider/platform path.
- Web gateway, Android Cafe Bazaar and iOS StoreKit are separate adapters.
- Sync is online-first and lossless under temporary disconnect.
- Support, refund and rollback procedures exist.

### Private beta

- Invited users can use Web and Android without operator intervention for normal flows.
- Premium purchase and entitlement reconciliation are verified.
- Profile, settings, purchases and personal vocabulary are usable.
- Observability, backups, abuse controls and incident response are exercised.

### Public v1

- Android store release is stable and supported.
- Native iOS release is separately reviewed and compliant.
- Content factory can sustain a quality release cadence.
- Payment, restore, refund, account deletion and support are operational.
- Production flags and deployment rollback are owner-approved and evidenced.

## What is deliberately not on the critical path

- Social network, leaderboard and complex gamification.
- Subscription before one-time vocabulary-pack commerce is stable.
- AI-generated content publishing without human review.
- Making the informational landing site depend on the product backend.
- Native iOS before the Web/PWA and entitlement model are proven.
