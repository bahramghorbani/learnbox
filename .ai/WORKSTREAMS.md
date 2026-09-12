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

## Release-season workstream map

The former M0–M8 map remains historical implementation provenance. Active delivery follows the bounded seasons in `ROADMAP.md`:

| Season                           | Primary roles        | Safe overlap                      | Must wait for                                                  |
| -------------------------------- | -------------------- | --------------------------------- | -------------------------------------------------------------- |
| S0 Web-first scope freeze        | supervisor + W1 + W8 | none needed                       | current repository audit                                       |
| S1 starter content/private media | W4 + W8 + owner      | non-mutating S2 preparation       | isolated media decision; 35/35 approval before seed/activation |
| S2 Web server truth and sync     | W2 + W6 + W8         | S1 until seed/activation boundary | 35/35 approved content for seed                                |
| S3 account/ops hardening         | W2 + W6 + W7 + W8    | disjoint S1/S2 paths              | stable Web/content contracts                                   |
| S4 Web closed alpha              | W7 + W8 + owner      | release-blocker fixes only        | integrated S1–S3 candidate                                     |
| S5 public Web/PWA release        | W7 + W8 + owner      | phased rollout only               | S4 go decision and release approval                            |

Android/Cafe Bazaar, every payment path, native iOS and general AI-generation UX are v1.1+ workstreams and must not consume Web v1.0 critical-path capacity.

## Flow limits

- Keep one active security-sensitive serial chain and at most two disjoint implementation workstreams.
- Put status changes in the feature PR; a separate post-merge docs PR is exceptional.
- Track delivery by season exit evidence, not merged-PR count.
- During the 30-day release window, target at least 85% functional PRs and no more than 10% docs-only maintenance PRs.

## Work item contract

Every active queue item includes: outcome, allowed paths, dependencies, acceptance criteria, worker role, risk, required tests, documentation updates, owner gates and handoff evidence. A work item should represent a coherent deliverable, not one trivial edit.
