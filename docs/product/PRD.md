# LearnBox product requirements

## Release hierarchy

- `docs/PRODUCT_STATUS.md` states current capability truth.
- `ROADMAP.md` defines the active 30-day scope, schedule, dependencies and exit gates.
- This PRD defines required behavior for Web/PWA v1.0.
- `docs/product/MASTER_SPEC.md` is long-horizon product context and cannot expand v1.0 without an explicit decision record.

## Web/PWA v1.0 outcome

By 2026-10-12, release a real online-first German vocabulary Web/PWA for Persian-speaking learners. It includes 35 complete A1 starter items, server-authoritative learning state, temporary-offline review tolerance and the minimum account/operations capabilities required for a supported public release.

This is an official Web/PWA release. It is not a prototype, private Preview, Android release or commercial payment release.

## Required learner journey

An approved user can:

1. create or enter an account through the approved Web flow;
2. reach Today from the launch experience;
3. study the human-approved 35-item A1 starter;
4. see an approved image and de-DE pronunciation for required cards;
5. complete active-recall reviews with Leitner scheduling;
6. see truthful Words, Progress, Profile, Settings and sync status;
7. continue briefly while disconnected and synchronize without losing or duplicating answers;
8. find privacy, support and account-data deletion-request paths.

## Required content/Admin journey

An authorized operator can:

- review all six required dimensions for every starter item;
- attach approved private media without exposing credentials or private locators;
- approve or return an item, with no AI auto-publication;
- seed/release exactly the approved 35-item version idempotently;
- inspect release readiness and roll back the released pack version.

General natural-language AI pack generation, premium-pack operations and broad factory UX are not v1.0 requirements.

## Required operations

- HTTPS public route and secure account/session boundaries.
- Monitoring and actionable alerts for the critical journey.
- Exercised backup/restore, incident response and application rollback.
- Privacy-safe diagnostics with no OTP, phone, token, credential or personal free text in release evidence.
- Supported-browser and mobile-Web checks, RTL/LTR isolation and baseline accessibility evidence.
- Closed-alpha evidence from the owner and 2–3 invited users before public activation.
- Explicit owner approval for phased public release.

## Non-functional requirements

- No secret or provider credential in a client or repository evidence.
- Review-event synchronization is learner-scoped, idempotent and lossless under retry.
- AI output remains publication-blocked until human approval.
- User-visible states cover loading, empty, error and temporary offline behavior.
- Persian is RTL-first; German, phone numbers, OTPs, URLs and identifiers use LTR isolation.
- Content seed/release and operational rollback are deterministic and auditable.
- Production activation and public release remain owner-gated.

## Explicit v1.0 exclusions

These move to v1.1 or later:

- native Android online release and Cafe Bazaar publication;
- all payments, premium packs and paid entitlements;
- direct Web bank payment;
- native iOS and StoreKit;
- subscriptions and notifications;
- general AI-generation UX and broader catalog;
- personal-vocabulary server sync and AI suggestions;
- leagues, social/gamification and non-critical visual expansion.

Existing Android, commerce and content-factory foundations may remain dormant but cannot block Web/PWA v1.0.

## Release gates

Public v1.0 requires all of the following on one immutable candidate:

- 35/35 items release-approved with required media attached;
- exactly 35 learner-visible catalog rows after idempotent seed/release;
- end-to-end authenticated Today/review/progress journey;
- zero lost or duplicate review events in disconnect/retry evidence;
- no open severity-0/1 or release-blocking severity-2 issue;
- exercised monitoring, backup/restore, incident response and rollback;
- closed-alpha go decision and explicit owner public-release approval;
- green CI/security checks, public smoke verification, tag and changelog entry.

## Success signals after release

- Learners complete the starter journey without technical help.
- Review answers survive disconnect and reconnect exactly once.
- Support can explain account, sync and content state from audit evidence.
- Rollback can be invoked without content or learning-state corruption.
- Android/payment work begins as v1.1 without reopening the Web v1.0 finish line.
