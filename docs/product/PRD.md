# LearnBox product requirements

## Release hierarchy

- `docs/PRODUCT_STATUS.md` states current capability truth.
- `ROADMAP.md` defines release scope, seasons, exit gates and forecast.
- This PRD defines required outcomes; the long-horizon `MASTER_SPEC.md` cannot expand the current release without an explicit decision record.

## Public v1.0 outcome

Deliver a supported online-first German vocabulary product for Persian-speaking learners on Android/Cafe Bazaar and learner Web/PWA. Users receive 35 complete A1 words free, retain server-authoritative learning progress across temporary disconnects and can unlock one premium pack through one server-verified Cafe Bazaar purchase. Native iOS and direct Web payment follow after v1.0.

## Release 0: controlled Web closed alpha

### Required learner outcome

- Sign in through the approved Web flow.
- Reach Today and complete an active-recall session over the 35-item starter.
- Browse Words and see truthful Progress, Profile, Settings and sync states.
- Continue through a temporary disconnect and reconnect with no lost or duplicate review event.

### Required content and operations outcome

- All 35 starter items pass human linguistic, translation, provenance, visual, audio and app-flow review.
- Approved media is attached through the isolated private-storage boundary.
- Starter seed/release is idempotent and reversible.
- Admin can inspect the released version and its review evidence.
- Owner pilot and 2–3 invited users complete the critical journey under the closed-alpha checklist.

### Explicit exclusions

Payment, public invitation, native-store publication and autonomous AI publishing remain off.

## Public v1.0 requirements

### Learner

- Android and Web use the same canonical account, content and reconciled learning state.
- Today, review scheduling, Words, Progress, Profile and Settings expose truthful loading, empty, error, offline and sync behavior.
- Temporary offline review is bounded and lossless after reconnect.
- The free starter and one entitled premium pack have approved private media and versioned rollback.

### Admin/content

- Human reviewers can record all release checks, approve/return items and audit decisions.
- An operator can release, retire and roll back a pack version without direct database editing.
- Exactly one premium pack is prepared for v1.0; a general AI pack-generation UX is not required.
- AI output can never publish without human approval.

### Commerce

- Android shows one Cafe Bazaar offer for the v1.0 premium pack.
- Receipt verification is server-side and idempotent.
- Verified purchase maps to one shared backend entitlement consumable on Web and Android.
- Restore, refund/revoke and support reconciliation are exercised and auditable.
- Web direct bank payment and Apple StoreKit are post-v1.0.

### Account, privacy and operations

- Support, privacy notice, account-deletion request/fulfilment and purchase recovery are explicit flows.
- Observability, alerting, backup/restore, incident response and production rollback are exercised.
- Secrets remain server-side; auth, review and payment routes preserve authorization, CSRF/origin, rate-limit and no-store boundaries.
- Persian is RTL-first; German, phone numbers, identifiers and technical strings are isolated LTR.

## Public v1.0 release gate

Release requires:

1. one immutable candidate satisfying every current `ROADMAP.md` S5 exit criterion;
2. no unresolved severity-0/1 or release-blocking severity-2 defect;
3. current CI, security, migration, Web and Flutter evidence;
4. closed-alpha and closed-beta go decisions;
5. verified rollback, backup restore, support ownership and incident path;
6. explicit owner approval for production activation and Cafe Bazaar publication.

## Success signals

- Invited learners complete meaningful sessions repeatedly without operator assistance.
- Reconnect produces zero lost or duplicated review events in the release evidence.
- A content operator releases and rolls back the starter and one premium pack from Admin.
- A verified Cafe Bazaar purchase grants the correct entitlement exactly once; restore and revoke behave correctly.
- Support can explain account, sync, purchase and content states from audit evidence.

## Scope control

Native iOS, StoreKit, Web bank payment, subscriptions, notifications, social/gamification, personal-word server sync, broad catalog expansion and a general AI-generation UI are not v1.0 requirements. Adding any item requires a decision record, an explicit schedule impact and either an equal scope removal or a reforecast.
