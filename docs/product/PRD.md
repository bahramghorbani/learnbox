# LearnBox product requirements

## Outcome

Deliver a real online-first German vocabulary learning product, not a prototype. Users receive 35 complete A1 words for free, can learn daily, retain progress across connectivity changes, and purchase additional premium vocabulary packs through the payment method appropriate to their platform.

## Release 1: controlled closed alpha

### Learner

- Create/sign into an account through the approved Web flow.
- See the launch splash and reach Today.
- Study the free A1 starter collection.
- Complete active-recall reviews with Leitner scheduling.
- See Words, Progress, Profile and Settings.
- Add personal vocabulary and receive duplicate warnings.
- Continue a short session during temporary offline periods.
- See truthful sync status and pending work.

### Admin

- Review approved content.
- Request an AI-generated draft pack from a natural-language or structured request.
- Inspect generation status and validation findings.
- Correct, reject or regenerate cards.
- Review images and pronunciation.
- Approve, release, retire or roll back a pack.
- Configure pack catalog and platform-specific offers.
- Inspect purchase and entitlement status with audit history.

### Commerce

- Display the free A1 pack and approved premium packs.
- Show platform-appropriate price and purchase action.
- Verify Web, Cafe Bazaar and Apple purchases on the server.
- Grant shared entitlements only after verification.
- Support restore, refund/revoke and reconciliation.

## Non-functional requirements

- No secret or provider credential in a client.
- Review event sync is idempotent and learner-scoped.
- AI output is publication-blocked until human review.
- All user-visible states have loading, empty, error and offline behavior.
- Persian is RTL-first; German, phone numbers, OTP, URLs and identifiers use LTR isolation.
- Account deletion, privacy, support and purchase recovery are explicit product flows.
- Production and store activation require an owner-approved release gate.

## Success signals

- Learners complete meaningful sessions repeatedly.
- Review events are not lost or duplicated during reconnect.
- A content operator can produce a reviewed pack without engineering intervention.
- A verified purchase produces the correct entitlement across supported surfaces.
- Support can explain account, sync, purchase and content states from audit evidence.
