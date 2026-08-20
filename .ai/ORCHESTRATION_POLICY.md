# LearnBox AI orchestration policy

This policy defines how a top-level supervisor routes work while preserving the provider-neutral
continuity contract in [`../AI_BOOTSTRAP.md`](../AI_BOOTSTRAP.md) and ADR 0010. Repository rules,
live Git and pull-request state, specifications, tests, CI and owner gates remain authoritative;
models and provider memory are not project authority.

## Supervisor contract

The supervisor is the architect, risk classifier, task router, review coordinator and project-state
guardian. It must use the strongest configured reasoning tier for LearnBox supervision. Provider
failover may change the endpoint, but must not silently downgrade supervisor capability. If no
same-tier route is available, stop and report the blocker.

Before meaningful work, the supervisor must follow `AI_BOOTSTRAP.md`, fetch the current origin,
inspect open and Draft pull requests, `CURRENT_WORK.md` and `.ai/WORK_QUEUE.md`, then classify the
task. Existing branches and allowed paths must not be duplicated or overwritten.

## Capability routing

Choose the cheapest tier that can reliably satisfy the task:

| Capability                             | Use                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Routine worker                         | Bounded boilerplate, repetitive edits, straightforward tests and low-risk implementation                                      |
| Substantial worker                     | Significant implementation, debugging, refactoring and difficult coding                                                       |
| High-reasoning worker                  | Architecture, security-sensitive work, important product decisions, critical UI/UX, difficult escalation and high-risk review |
| Independent critical executor/reviewer | Preferred for critical execution or review when a separately verified route is available                                      |

Current installations may map these capabilities to machine-local worker profiles, but profile names,
providers, endpoints and credentials are implementation details and must not be committed. Record
the actual capability tier, model and provider used in task evidence. Never claim an independent
reviewer or execution lane that was unavailable.

## Escalation and review

Escalation is explicit: routine → substantial → high-reasoning. Escalate when scope or complexity
grows, checks repeatedly fail, output is uncertain, repository evidence conflicts with worker
claims, review finds a material defect, or sensitive boundaries enter scope. Start a new isolated
worker context; never silently change a worker tier or let a failed worker approve its own result.

Important routine-worker changes receive stronger independent review when warranted. High-risk
changes require high-reasoning or independently verified critical review plus every repository
check, CI gate and owner approval required by their scope. Model review supplements but never
replaces tests, CI, branch protection or owner gates.

## Worker boundaries

- Give every worker a complete scope, allowed paths, current base, required checks and handoff
  contract.
- Use dedicated non-`main` branches or isolated worktrees. Never edit or commit directly on `main`.
- Preserve unrelated dirty and untracked work; do not force-push, clean, hard-reset or rewrite
  shared history without explicit repository authority and any required owner approval.
- Do not let workers bypass privacy, security, identity, payment, provider, production, release,
  legal, Bobo or destructive-operation gates.
- Worker fallbacks must not silently cross capability tiers. Escalation is a supervisor decision.
- Verify actual commands, model route, diff, tests and PR state before accepting a handoff.

## Skills and continuity

Before a new category of work, inspect installed skills and use only those that materially improve
the task. A skill never overrides repository governance. Keep stable facts in `PROJECT_STATE.md`,
unmerged work in `CURRENT_WORK.md`, queued-worker state in `.ai/WORK_QUEUE.md`, and review evidence
in the applicable worker report or pull request. No secret, local API key or machine-local endpoint
belongs in the repository.
