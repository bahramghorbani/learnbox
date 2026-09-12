# LearnBox release roadmap

**Baseline:** 2026-09-12 at `dfede397a9f2ffdccdd7e7fe916688f9fdc6685e`

**Forecast class:** planning envelope, not a commitment; recalculate at every season exit

**Canonical finish line:** Public v1.0 is the supported Android/Cafe Bazaar release plus the public learner Web/PWA, sharing server-authoritative accounts, learning state, content and entitlements.

## 1. Scope lock

### Public v1.0 must include

1. **Learner journey:** a Persian-speaking learner can authenticate, use Today, complete active-recall reviews, browse Words, see truthful Progress/Profile/Settings and resume after a temporary disconnect without lost or duplicate review events.
2. **Starter content:** all 35 A1 starter items are human release-approved, have approved image and `de-DE` audio, are attached to private storage, published through versioned catalog data and available on Web and Android.
3. **One commercial slice:** one human-reviewed premium pack, one Cafe Bazaar offer, server-side purchase verification, a shared entitlement, restore, refund/revoke reconciliation and audit evidence. Web can consume the entitlement; direct Web payment is deferred to v1.1.
4. **Operable content release:** Admin can review, approve, release and roll back a pack version without AI publishing directly.
5. **Account and operations:** support, privacy notice, account-deletion request/fulfilment, observability, alerting, backup/restore, incident handling and production rollback are exercised.
6. **Release evidence:** a closed alpha and closed beta complete without an unresolved severity-0/1 defect, security incident, learning-data loss or inaccessible critical journey; Cafe Bazaar submission and production activation receive explicit owner approval.

### Explicitly outside v1.0

- native iOS and StoreKit;
- direct Web bank payment;
- subscriptions, social features, leaderboards, leagues and notifications;
- AI pack-request/generation UI and autonomous content publishing;
- personal-vocabulary server sync or AI suggestions;
- catalog expansion beyond the free starter and one premium pack;
- Bobo asset expansion, seasonal themes and non-critical motion;
- growth experiments that do not close a v1.0 exit gate.

These remain valid later possibilities, not hidden prerequisites. Adding one to v1.0 requires a product decision record with schedule impact and an equal-sized scope removal or explicit date reforecast.

## 2. Current truth

- M0 product truth and current D0/D1 foundations are completed.
- M1 online-learning and M2 Admin/content foundations are partial. Server routes, idempotent reconciliation seams, protected Admin review persistence and client flows exist, but learner production flags remain off.
- M3 Profile/Settings foundations are partial on Web and Android; they are no longer “planned”.
- The starter catalog is 35/35 drafted and linguistically reviewed but 0/35 release-approved; publication and seed remain blocked. Media candidates exist, but real private attachment requires an owner-selected isolated target and separate authorization.
- Commerce has provider-neutral foundations only. No Cafe Bazaar adapter or live entitlement path exists.
- Native Android online identity/sync is blocked on a non-SSO gateway and activation evidence.
- There is no public release tag. Passing tests or a dormant flag is not a released capability.

## Milestones

```text
S0 Scope/canon freeze
  ↓
S1 Starter + Web closed alpha
  ↓
S2 Operable product + one premium pack
  ├───────────────┐
  ↓               ↓
S3 Commerce     S4 Android online
  └───────┬───────┘
          ↓
S5 Closed beta + public v1.0
```

Only disjoint work may overlap. Identity, database, payment, infrastructure and release activation remain serial and high-reasoning reviewed.

### S0 — Finish-line freeze and delivery control

**Outcome:** one release definition, one milestone model and a bounded backlog.

**Tasks**

- Reconcile `ROADMAP.md`, PRD, storyboard and backlog.
- Mark the long-horizon master specification and landing-only roadmap with correct authority/scope.
- Record v1.0 inclusions/exclusions and season ownership.
- Track functional delivery separately from documentation maintenance; fold normal status updates into the feature PR.
- Capture four delivery metrics: functional-vs-doc PR ratio, migration-bearing CI duration, owner-gate latency and unresolved blocker age.

**Exit gate**

- Canonical documents contain no conflicting alpha/v1/payment/iOS definition.
- One ordered critical path and one public-v1.0 definition are named.
- No obsolete 20-item or 30-stage gate controls new work.
- Roadmap-only reconciliation PRs are exceptional, not an automatic post-merge step.

**Forecast:** 2–5 working days.

### S1 — Release-approved starter and Web closed alpha

**Outcome:** invited learners can complete the real free learning loop on Web/PWA.

**Tasks**

1. Owner selects an isolated private-media target and accepts any cost; engineering verifies the merged fail-closed store-identity guard.
2. Upload and attach the 35-item approved image/audio set under separate owner gates; preserve private receipts outside Git.
3. Complete provenance, visual, audio and app-flow review; reach 35/35 release-approved versions.
4. Execute the idempotent starter seed/release path; verify exactly 35 learner-visible rows and rollback.
5. Activate Web identity, learner-state read and approved sync boundaries in a controlled environment; verify `401`, `no-store`, CSRF/origin and rollback behavior.
6. Run owner pilot, then 2–3 invited users through sign-in → Today → review → progress → reconnect.

**Exit gate**

- 35/35 starter items release-approved; `seedable: true`; `publicationBlocked: false` only after human evidence.
- Learner catalog returns exactly 35 current starter items with approved media.
- Disconnect/reconnect test produces zero lost and zero duplicate review events.
- Closed-alpha evidence records version, participants, issues, stop/go decision and rollback.
- Payment and public invitation remain off.

**Forecast from baseline:** best 2026-10-10; planning target 2026-10-31; outer case 2026-12-05. The window slips one-for-one with owner/media approval latency.

### S2 — Operable content and account release slice

**Outcome:** the team can operate the product and prepare exactly one premium pack without engineering-only database edits.

**Tasks**

- Complete Admin review, pack version, release/retire/rollback and audit workflows needed for two packs only.
- Produce, validate and human-review one bounded premium pack; no general AI-generation UI is required.
- Complete release-critical account/support/privacy/deletion flows and truthful entitlement placeholders.
- Activate minimal privacy-safe operational analytics, error reporting, health checks and support evidence.
- Prove backup restore on non-production data and record recovery time.

**Exit gate**

- One premium pack is release-ready but not yet publicly sold.
- Admin releases and rolls back both starter and premium versions from the protected workflow.
- A deletion request, support investigation and backup restore are exercised end-to-end.
- No unresolved severity-0/1 issue; release-critical accessibility states pass.

**Forecast:** 4–7 weeks after S1; bounded premium content review can overlap non-sensitive account/ops work.

### S3 — Cafe Bazaar commerce MVP

**Outcome:** one verified Android purchase grants one shared premium-pack entitlement.

**Tasks**

- Confirm merchant/developer account, product ID, pricing, terms and refund responsibilities.
- Implement Cafe Bazaar billing adapter and server-side receipt verification.
- Persist purchase, entitlement, restore, refund/revoke and reconciliation audit states.
- Expose truthful Store, pack detail, purchase result, Purchases/My Packs and support states.
- Exercise sandbox/provider tests, replay/idempotency, forged receipt rejection and operational rollback.

**Exit gate**

- One controlled provider transaction grants the correct server entitlement exactly once.
- Restore works; refund/revoke removes access according to policy; audit explains every transition.
- Clients never grant entitlement without server verification; secrets remain server-side.
- Provider/legal/cost acceptance is recorded by the owner.

**Forecast:** 6–10 engineering weeks after provider readiness; external onboarding is not bounded until account status is measured.

### S4 — Native Android online and closed beta candidate

**Outcome:** Android uses the real online account, content, learning and entitlement contracts.

**Tasks**

- Provision the non-SSO native gateway with TLS, rate limits, secret isolation and rollback.
- Activate native auth/session, catalog/media, review sync and entitlement composition.
- Verify offline queue/reconnect behavior and account switching on physical devices.
- Complete low-end performance, RTL/LTR, screen-reader, keyboard/switch where applicable and interruption testing.
- Prepare signed release candidate and Cafe Bazaar listing assets without publishing.

**Exit gate**

- Owner device and the supported device matrix complete auth → starter review → reconnect → premium entitlement.
- Zero known learning-data loss/duplication; critical security and accessibility findings are closed.
- Signed candidate, rollback build, support runbook and store draft are ready.

**Forecast:** 5–8 weeks; gateway work may overlap S3 only after contracts stabilize.

### S5 — Closed beta, release gate and public v1.0

**Outcome:** evidence supports a controlled public Android/Web release.

**Tasks**

- Run staged closed beta cohorts with stop thresholds, privacy-safe telemetry and support coverage.
- Exercise production monitoring, alerting, backup/restore, incident response and rollback.
- Complete Cafe Bazaar compliance, privacy, data-deletion, screenshots, signing and release notes.
- Resolve all severity-0/1 and release-blocking severity-2 defects.
- Obtain explicit owner approval for Production and marketplace publication; use a phased rollout.

**Exit gate / definition of done**

- The six Public v1.0 requirements in §1 are evidenced on one immutable release candidate.
- Required CI, security, migration, Web and Flutter checks are green.
- Closed-beta go decision is recorded; no open release blocker remains.
- Production rollback is proven and on-call/support ownership is named.
- A signed tag and changelog entry exist; the public route and Cafe Bazaar release are verified after activation.

**Forecast:** best 2027-01-30; planning target 2027-04-03; outer case 2027-06-19. Confidence is low until the media target, owner review pace, native gateway and Cafe Bazaar onboarding are measured.

## 4. Forecast assumptions and controls

The forecast assumes one AI-supervised engineering lane, independent high-risk review, bounded parallelism only for disjoint paths, owner responses within five working days and no redesign of the release scope. Dates exclude an unmeasured provider/store queue only where explicitly stated.

Update the forecast at every season exit using:

- median owner decision latency over the latest five gates;
- functional PR share (target ≥70%; docs-only maintenance target ≤15%);
- median CI wall time for code/migration PRs;
- human media/content QA minutes per item;
- native gateway provisioning lead time;
- Cafe Bazaar account, billing and review lead time;
- open release blockers by severity and age.

If an input is unknown, preserve a range rather than inventing a point date. A season cannot be called complete from merged foundations alone; every exit gate needs current executable or human evidence.

## 5. Scope-change rule

New ideas enter a post-v1 backlog. They enter the v1.0 critical path only if they fix a security/legal blocker or replace an existing scoped item through an explicit decision record. This is the main control against indefinite project growth.
