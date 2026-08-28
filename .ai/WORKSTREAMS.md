# LearnBox milestone workstreams

This file defines the practical worker map. It replaces serial micro-tasking with grouped workstreams while preserving strict serial review for security, payments, migrations and releases.

## Supervisor

Owns product scope, architecture, dependency graph, worker selection, integration, independent verification and release decisions. The supervisor does not accept a worker's self-reported completion without inspecting diff, tests, CI and scope.

## Worker roles

### W1 Product/status auditor

Reads code, tests and docs; updates inventory/status only. No product code, secrets or deployment. Output: evidence-linked capability matrix and discrepancies.

### W2 Learner web worker

Owns learner Web routes/components/tests for an assigned milestone. Does not edit API contracts, mobile, Admin or payment adapters unless explicitly assigned.

### W3 Mobile worker

Owns Flutter learner flows and device checks. Native auth/payment changes require high-reasoning review. Does not claim physical-device or store evidence without running it.

### W4 Content factory worker

Owns content schemas, AI job orchestration, duplicate validation, media QA and review queue. AI output stays publication-blocked until human approval.

### W5 Admin/commerce worker

Owns Admin UI and provider-neutral catalog/offer/entitlement contracts when paths are disjoint. Payment provider activation and real transactions remain owner-gated and require security review.

### W6 Backend/sync worker

Owns API, persistence, migrations and idempotent sync. Database and auth changes are serial with high-reasoning review.

### W7 Infrastructure/release worker

Owns server, Caddy, deployment, observability and store/release checklists. No production, DNS mutation, secret entry or destructive action without explicit approval and verification.

### W8 QA/reviewer

Independently checks acceptance criteria, user journey, security boundaries, accessibility, tests, evidence, scope and documentation freshness. It must not approve its own implementation.

## Routing policy

- Routine documentation, UI and test work: cheapest reliable worker.
- Substantial cross-package work: stronger worker with explicit scope.
- Architecture, auth/session, payments, migrations, infrastructure, legal/store and final release verification: high-reasoning review.
- Keep worker fallbacks isolated; a cheap worker must not silently fall back to the supervisor tier.
- Parallel work is allowed only when worktrees and allowed paths are disjoint and no contract dependency is unresolved.

## Workstream map

| Workstream               | Primary role    | Can overlap                                     | Must wait for                          |
| ------------------------ | --------------- | ----------------------------------------------- | -------------------------------------- |
| M0 product truth         | W1 + supervisor | none initially                                  | owner scope decisions                  |
| M1 online learning core  | W2 + W6         | M2 content contracts, M3 UI if contracts stable | M0                                     |
| M2 content factory/admin | W4 + W5         | M1 only on stable contracts                     | M0, content schema decisions           |
| M3 profile/account       | W2 + W3         | M1/M2 on disjoint paths                         | account/status contracts               |
| M4 commerce              | W5 + W6         | limited                                         | pack/catalog and entitlement contracts |
| M5 native online         | W3 + W6 + W7    | none with payment activation                    | secure server gateway                  |
| M6 beta hardening        | W7 + W8         | content cadence                                 | M1–M5 release criteria                 |
| M7/M8 store release      | W3/W5/W7/W8     | platform-specific work may overlap              | beta evidence and owner approval       |

## Work item contract

Every active queue item includes: outcome, allowed paths, dependencies, acceptance criteria, worker role, risk, required tests, documentation updates, owner gates and handoff evidence. A work item should represent a coherent deliverable, not one trivial edit.
