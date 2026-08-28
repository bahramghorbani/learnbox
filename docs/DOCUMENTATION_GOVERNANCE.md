# Documentation governance

## Canonical documents

- `docs/PRODUCT_STATUS.md` — current user-visible capability inventory and status.
- `PRODUCT.md` — product definition and boundaries.
- `docs/product/PRD.md` — release requirements.
- `ROADMAP.md` — milestones and exit criteria.
- `docs/architecture/SYSTEM_CONTEXT.md` — system boundaries.
- `.ai/WORK_QUEUE.md` — active milestone/workstream assignments.
- `CURRENT_WORK.md` — only unmerged work.
- `PROJECT_STATE.md` — facts true on stable `main`.

Historical design, evidence and closed-task documents remain valuable evidence but do not override the canonical documents. If an old document conflicts with a canonical document, mark it as historical or update it when its subject is still active.

## Required PR declaration

Every PR must state:

1. Product surface changed: landing, learner web, mobile, iOS, admin, API, content, commerce, infrastructure or release.
2. Milestone and workstream.
3. Capability inventory row changed.
4. Status change: implemented, verified, dormant, partial, blocked, planned or out of scope.
5. Documents updated, or an explicit reason no canonical update was needed.
6. Rollback/flag/provider/owner-approval impact.

## Mandatory update triggers

Update the relevant canonical documents in the same PR when changing:

- a user-visible feature or navigation;
- an API route, data contract, migration or sync behavior;
- a payment provider, price, product ID, entitlement or refund behavior;
- a feature flag, deployment boundary or environment;
- AI content generation, validation, media or release gates;
- an admin workflow or operational capability;
- a milestone, dependency, blocker or release criterion;
- a security, privacy, legal or store requirement.

## Status discipline

- Never call a component, prototype, test fixture or dormant flag a released feature.
- A feature is `verified` only with current executable tests or evidence.
- `main` facts belong in `PROJECT_STATE.md`; branch work belongs in `CURRENT_WORK.md`.
- Do not overwrite historical evidence to make a status look better.
- Do not record secrets, tokens, phone numbers, OTPs, receipts or personal data.

## Review cadence

At every merged milestone, the supervisor must:

1. reconcile `docs/PRODUCT_STATUS.md` with the merged code and tests;
2. update `ROADMAP.md` and the relevant milestone status;
3. close or redirect the queue record;
4. refresh `PROJECT_STATE.md` and `CURRENT_WORK.md`;
5. confirm no active record points to a merged/deleted branch.

## Validation

The documentation gate is currently review-enforced. A future CI validator may mechanically check required headings, active queue records and branch/PR references. Until then, the PR declaration and supervisor review are mandatory.
