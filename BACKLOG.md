# LearnBox release backlog

The active backlog contains only work required for Web/PWA v1.0 by 2026-10-12. Historical M0–M8 and 30-stage plans do not control delivery. Android, commerce and product expansion are v1.1+.

## 30-day critical path

| Order | Season | Outcome                                                     | Deadline | Current state | Blocking input                           | Completion evidence                                 |
| ----- | ------ | ----------------------------------------------------------- | -------- | ------------- | ---------------------------------------- | --------------------------------------------------- |
| 1     | S0     | Freeze Web-first v1.0 and 30-day controls                   | Sep 12   | in progress   | merge canonical update                   | reviewed canonical docs                             |
| 2     | S1     | Create/verify isolated private-media target                 | Sep 14   | blocked       | owner choice and cost acceptance         | non-secret target attestation                       |
| 3     | S1     | Guarded upload and attachment for all 35 items              | Sep 21   | blocked       | order 2 and separate owner authorization | receipts and 35-item attachment ledger              |
| 4     | S1     | Human release decision for all 35 items                     | Sep 22   | blocked       | order 3 and owner review                 | 35/35 release-approved or returned defects          |
| 5     | S2     | Seed/release starter and enable Web server truth in Preview | Sep 26   | blocked       | order 4 and owner activation gate        | exactly 35 rows; auth/read/sync evidence; rollback  |
| 6     | S3     | Complete release-critical account/privacy/support/ops       | Oct 3    | partial       | approved copy and safe environment       | exercised deletion/support/monitor/restore evidence |
| 7     | S4     | Owner pilot and 2–3-user closed alpha                       | Oct 8    | blocked       | orders 5–6 and invitations               | journey evidence; severity triage; go/no-go         |
| 8     | S5     | Fix blockers and phased public Web/PWA release              | Oct 12   | planned       | order 7 and owner release approval       | signed tag; public smoke; rollback verification     |

## Daily execution order

1. Resolve the current owner gate before starting lower-value work.
2. Run S1 content/media and S2 non-mutating Web preparation in parallel only on disjoint paths.
3. Keep seed and runtime activation downstream of 35/35 human approval.
4. Admit only severity-0/1 or release-blocking severity-2 fixes after October 3.
5. Publish only after alpha evidence and explicit owner approval.

## Delivery limits

- One serial security/identity/data chain; at most two disjoint implementation lanes.
- Status changes ship inside functional PRs; no routine post-merge reconciliation PR.
- Target ≥85% functional PRs and ≤10% docs-only maintenance during the 30-day window.
- No new feature enters v1.0 unless it replaces an item here or fixes a security/legal blocker.
- Cosmetic redesign, speculative refactoring and expanded platform support are rejected from this release.
- Owner-gate latency is visible. A missed gate moves the target one-for-one unless scope is explicitly reduced again.

## v1.1+ backlog

- native Android online release and Cafe Bazaar publication;
- Cafe Bazaar billing, premium packs and shared entitlements;
- direct Web bank payment;
- native iOS and StoreKit;
- subscriptions and notifications;
- general AI pack-generation UX and broader catalog;
- personal-vocabulary server sync and AI suggestions;
- leagues, social/gamification, Bobo expansion, seasonal themes and non-critical motion.
