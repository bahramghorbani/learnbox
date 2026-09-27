# PDR-008 — Admin persistence for Start Pack review candidates

- **Status:** approved
- **Date:** 2026-09-09
- **Implementation:** LB-DS-049 merged in PR #252 at `a2a75e9789ebffffffe50e80067ccd0d23c5926a` — migration `0017` plus the default-off Admin queue/check/decision runtime and server-truthful workspace are implemented and independently reviewed; migration execution and runtime activation remain separate gates.

## Context

The closed-alpha critical path is blocked by the Start Pack review boundary. The repository contains exactly 35 structured Start Pack drafts and records product-owner approval of the German-linguistic and Persian-translation dimensions for all 35. Provenance, visual, audio and app-flow review remain open; zero items are release-approved.

Admin Passkey authentication, canonical `users.id` binding and a `super_admin` assignment are verified on isolated staging. The Admin workspace still reads committed fixtures and its review actions are local-only. The database already models immutable `card_versions`, six `content_review_checks`, idempotent review decisions and audit logs, but those records cannot be used because no Start Pack review-candidate rows exist.

ADR 0016 originally prohibited creating any `cards` or `card_versions` row before release approval. That creates a circular dependency: server review requires a `card_versions.id`, while release approval cannot be reached without persisted review. A separate candidate model would duplicate the existing review domain and create a second identity transition.

## Decision

Authorize one serial, default-off M2 slice that uses the existing content-review model:

1. Ingest all 35 committed Start Pack drafts as canonical `cards` rows and immutable version-1 `card_versions` rows with status `needs_review`.
2. Create all six required `content_review_checks` for every candidate. Repository evidence does not become a database actor assertion automatically: imported checks start `pending`. An authenticated authorized reviewer may re-attest the already documented linguistic and translation dimensions through the server workflow.
3. Use the canonical draft `id` unchanged as `cards.content_id`; use deterministic row identities and idempotent inserts so every environment converges on the same candidate set without duplicate versions.
4. Add authenticated Admin reads and mutations for queue state, per-dimension outcomes, and final approve/return decisions. Identity comes only from the validated Admin session; roles come only from `admin_role_assignments`; mutations require same-origin/CSRF validation, recent authentication and idempotency.
5. Keep approval distinct from publication. Passing all six checks may permit the existing review decision to move a version from `needs_review` to `approved`; it must never set `published`, create pack membership, expose a learner catalog, or bootstrap learner schedules.
6. Put every new Admin review route and client composition behind a dedicated default-off runtime gate. Merging code or data migration does not authorize Preview, staging, or Production enablement or migration execution.

## Required behavior

- Queue reads are `no-store`, role-authorized, strictly parsed, and expose only review data needed by Admin.
- Missing/unmapped/expired sessions fail before review data is read. Unauthorized roles cannot infer candidate existence.
- Check writes lock the target version, accept only the six known dimensions and `passed`/`failed`, attribute the current canonical actor, and write an audit event atomically.
- Final approval remains blocked while any check is not `passed`; return/reject remains audited and cannot publish.
- Imported candidate content is validated against the committed 35-draft source and its integrity anchors. Drift, duplicates, wrong counts or non-`needs_review` status fail tests.
- Existing learner reads and review-event writes continue resolving only `approved`/`published` versions. `needs_review` candidates are invisible to learner surfaces.
- The UI must distinguish loading, unauthorized, disabled, empty, error, retry, persisted success and idempotent replay. It must not retain the existing local-only success illusion when server persistence is enabled.

## Explicit exclusions

- publication, pack membership, pricing, entitlements or learner schedule bootstrap
- learner Web/mobile route activation, review-sync activation or native authentication
- automatic import of repository approvals as if performed by a database user
- provider/media generation, fabricated QA evidence or release approval
- staging/Preview/Production flag changes, deployment, secrets or credential operations
- bulk approval that bypasses per-dimension audit records

## Acceptance consequences

After the implementation merges, the repository will contain a dormant, reviewable path capable of persisting the 35 Start Pack candidates and Admin review state. The Start Pack remains unavailable to learners until human review completes, versions are approved, a separately authorized catalog/pack seed is implemented, and rollout gates pass.

## Reversibility

Keep the runtime gate false to disable all routes and client composition. Candidate rows remain non-learner-visible while `needs_review`. A rollback may remove route composition without deleting review evidence. Deleting candidate, decision, check or audit records is destructive and requires a separately approved migration and evidence-preservation plan.
