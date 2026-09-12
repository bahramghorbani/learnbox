# LearnBox release roadmap

**Baseline:** 2026-09-12 at `32aad4c4cffdbdd6211263d9fe5f7ed2d9f191ee`

**Planning target:** public Web/PWA v1.0 by **2026-10-12**

**Scope decision:** the owner chose a Web/PWA-first official release. Native Android and every payment path move to v1.1. This supersedes the broader forecast in PR #276.

## 1. Public v1.0 finish line

Public v1.0 is complete only when one immutable Web/PWA release candidate proves all of these:

1. The public learner Web/PWA runs over HTTPS with approved account sign-in, Persian RTL, isolated German text and accessible loading, empty, error and offline states.
2. The free Start Pack contains exactly 35 human release-approved A1 items with approved image and de-DE pronunciation media; the catalog is published and learner-visible.
3. Today → active recall → answer → progress → return works against server-authoritative learning state.
4. A temporary disconnect retains pending review events and reconnect creates zero lost or duplicate answers.
5. Profile/Settings, privacy notice, support route, account-data deletion request, sync status and recovery are truthful and usable.
6. Monitoring, alerts, backup/restore, incident response, rollback and support ownership are exercised for the release candidate.
7. Closed-alpha evidence has no open severity-0/1 or release-blocking severity-2 defect, and the owner explicitly approves phased public activation.

A passing build, dormant flag, local fixture, Preview route or test alone does not satisfy the finish line.

## 2. Scope excluded from v1.0

The following are v1.1 or later and cannot delay the 2026-10-12 release:

- native Android online release and Cafe Bazaar publication;
- Cafe Bazaar billing, premium packs and shared paid entitlements;
- direct Web bank payment;
- native iOS and StoreKit;
- subscriptions and notifications;
- general AI pack-generation UX and broader catalog expansion;
- personal-vocabulary server sync and AI suggestions;
- leagues, social/gamification, non-critical Bobo expansion, themes and motion polish.

Existing foundations remain in the repository but are not release requirements.

## 3. Current truth and critical path

At the baseline:

- 35 starter drafts exist, but 0/35 are release-approved, `seedable` is false and publication remains blocked.
- Private-media guard code is merged, but no owner-selected isolated target, authorized upload or attachment exists.
- Web learning, server-read and reconciliation foundations exist behind disabled boundaries; production composition is not active.
- Admin review and release foundations exist, but human review, content publication and production release have not occurred.
- No payment provider is needed for this Web-first v1.0.

Critical path:

```text
isolated media target
  → guarded upload/attachment
  → 35/35 human approval
  → idempotent seed/catalog release
  → Web server truth + sync activation
  → account/ops hardening
  → 2–3-user closed alpha
  → phased public Web/PWA release
```

Only disjoint preparation may overlap. Upload, attachment, approval, seed, activation and release remain serial gates.

## Milestones

### S0 — Scope freeze and 30-day control

**Dates:** September 12–13
**Outcome:** one Web-first finish line, one schedule and no Android/payment dependency.

**Tasks**

- Align roadmap, PRD, backlog, product status, storyboard, workstreams and queue.
- Record Android, commerce, native iOS and broad product expansion as v1.1+.
- Establish gate deadlines, work-in-progress limits and daily blocker reporting.

**Exit gate**

- Canonical documents agree on Web/PWA v1.0 and 2026-10-12.
- No active record makes Android, payment, premium content or iOS a v1.0 requirement.
- Required owner gates and dates are visible.

### S1 — Starter content and private media

**Dates:** September 12–23
**Outcome:** all 35 starter items are attached, reviewed and eligible for release.

**Tasks**

- By Sep 14, owner selects or creates an isolated private-media target and accepts its cost. This does not authorize upload.
- Independently verify target isolation with the merged fail-closed guard.
- By Sep 16, owner separately authorizes the exact guarded upload/attachment operation.
- By Sep 21, execute separately authorized guarded upload and attachment for all starter media; retain out-of-repo receipts.
- Present one batched 35-item approve/return review while preserving six auditable review dimensions.
- Close returned defects and reach 35/35 release approval by Sep 22.

**Exit gate**

- Exactly 35 canonical items have approved linguistic, translation, provenance, visual, audio and app-flow evidence.
- Required media is privately attached with no repository credential or locator leakage.
- `seedable: true` and `publicationBlocked: false` are justified by review evidence, not forced.

### S2 — Web server truth and lossless sync

**Dates:** September 17–26
**Outcome:** authenticated Web learners use the approved catalog and server-authoritative learning state.

**Tasks**

- Prepare authenticated Web state, catalog/media and reconciliation activation on disjoint paths while S1 review proceeds.
- After 35/35 approval, run the idempotent seed/release and verify exactly 35 learner-visible rows.
- Activate only required Web flags in a controlled environment with documented rollback.
- Verify Today, Words, review scheduling, progress, reconnect acknowledgement and account switching.
- Prove zero lost and zero duplicate review events under disconnect/retry tests.

**Exit gate**

- Approved account → Today → review → progress → reconnect works end to end.
- Anonymous reads fail closed; authenticated responses retain required cache/security boundaries.
- Seed/release reruns are idempotent and rollback is exercised.

### S3 — Operable Web product

**Dates:** September 22–October 3
**Outcome:** the release candidate is supportable, reversible and legally presentable.

**Tasks**

- Complete only release-critical Profile/Settings, sync status, support, privacy and deletion-request gaps.
- Exercise monitoring, alerts, backup/restore, incident response and rollback.
- Verify Persian RTL, German LTR isolation, keyboard, screen-reader basics, reduced motion, mobile reflow and supported browsers.
- Run security, migration, dependency, performance and production-boundary checks.
- Freeze features on Oct 3; only release blockers may enter afterward.

**Exit gate**

- No severity-0/1 issue is open.
- Support, privacy, deletion request, backup/restore, monitoring and rollback have named evidence and owners.
- The candidate passes required CI and real-device/browser checks.

### S4 — Closed alpha

**Dates:** October 4–8
**Outcome:** the owner and 2–3 invited users prove the critical journey without technical help.

**Tasks**

- Owner pilot first; then invite 2–3 consented participants.
- Observe sign-in → Today → review → answer → progress → reconnect.
- Record privacy-safe feedback and severity; stop immediately for security or data-loss events.
- Fix only release blockers and rerun affected evidence.

**Exit gate**

- Every participant completes the critical journey or every blocking cause is fixed and retested.
- Zero security incident and zero learning-data loss/duplication.
- A documented go/no-go decision authorizes release-candidate finalization.

### S5 — Public Web/PWA v1.0

**Dates:** October 9–12
**Outcome:** a supported, phased public Web/PWA release.

**Tasks**

- Finalize release notes, version/tag, support ownership and rollback command.
- Obtain explicit owner approval for public activation.
- Deploy a phased cohort, run public-route smoke checks and watch alerts.
- Expand only while stop thresholds remain clear.

**Exit gate / definition of done**

- All seven v1.0 finish-line requirements are evidenced on the released commit.
- Required CI and security checks are green; no release blocker remains.
- Public HTTPS, account, catalog/media, review/sync, support and rollback are verified after activation.
- A signed tag and changelog entry identify the release.

## 4. Thirty-day operating rules

- One serial security/identity/data chain and at most two disjoint implementation lanes.
- Status updates belong in functional PRs; routine post-merge documentation PRs are prohibited.
- Target ≥85% functional PRs and ≤10% docs-only maintenance during the window.
- Daily status contains only: completed evidence, current critical path, blocker, owner action and deadline effect.
- After Oct 3, accept only security/legal blockers or severity-0/1 and release-blocking severity-2 fixes.
- Never bypass content review, credential, provider, migration, production or release gates to preserve the date.

## 5. Deadline assumptions and failure policy

The 2026-10-12 target assumes:

- storage/cost decision by Sep 14;
- separate upload/attachment approval by Sep 16 and completion by Sep 21;
- batched 35/35 human review by Sep 22;
- seed/controlled activation approval by Sep 26;
- owner pilot and invitations available Oct 4–8;
- public-release approval by Oct 11;
- no critical redesign or new v1 feature.

A missed owner/external gate moves the target one-for-one unless the owner explicitly cuts scope again. Engineering work is parallelized where safe, but external authorization latency is not hidden. The date is a controlled target, not permission to fabricate evidence or ship an unsafe release.

## 6. Scope-change rule

New ideas enter v1.1+. They enter v1.0 only if they fix a security/legal blocker or replace an existing requirement through an explicit decision record with an updated deadline. This rule prevents LearnBox from expanding indefinitely.
