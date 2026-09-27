# LearnBox AI Bootstrap

This repository is the authoritative source of truth for LearnBox. Chat history, provider
memory and local assumptions may clarify work, but they never override a committed repository
decision.

## Required start order

Before changing code, documentation, infrastructure or content, every capable coding agent must:

1. Read [`AGENTS.md`](./AGENTS.md).
2. Read this file.
3. Read [`PROJECT_STATE.md`](./PROJECT_STATE.md) for stable `main` state.
4. Read [`docs/storyboard/STATUS.md`](./docs/storyboard/STATUS.md); never reset or move it
   backwards.
5. If continuing an unmerged branch, read [`CURRENT_WORK.md`](./CURRENT_WORK.md) and that
   branch's directly linked plan or ADR.
6. Read [`.ai/manifest.yaml`](./.ai/manifest.yaml), then resolve the needed abstract
   capabilities through [`.ai/provider-mappings.yaml`](./.ai/provider-mappings.yaml).
   A supervising agent must also follow [`.ai/ORCHESTRATION_POLICY.md`](./.ai/ORCHESTRATION_POLICY.md)
   before classifying, delegating or reviewing work.
   An agent continuing a queued task must also read [`.ai/WORKER_PROTOCOL.md`](./.ai/WORKER_PROTOCOL.md),
   [`.ai/WORKSTREAMS.md`](./.ai/WORKSTREAMS.md) and its task record in [`.ai/WORK_QUEUE.md`](./.ai/WORK_QUEUE.md).
7. Inspect the live repository with `git status --short --branch`, `git diff --name-only` and
   `git log -1 --oneline`.
8. Run proportionate validation before implementation. At a feature boundary, run
   `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, and
   `node scripts/validate-migrations.mjs`; add relevant package and Flutter checks when their
   scope is changed.
9. Begin implementation on an appropriate non-`main` branch. Update `main` only through a merge
   after the required local and GitHub checks are green.

## Parallel-agent refresh

When more than one agent may be working, treat GitHub as the live coordination channel. Before
choosing work, fetch `origin/main`, inspect open pull requests and `.ai/WORK_QUEUE.md`, then choose
only a task whose allowed paths do not overlap an active branch. Record a newly opened or materially
redirected PR in `CURRENT_WORK.md`; update the task handoff report before requesting review. Before
merging any branch, refresh from the current `origin/main`, resolve only intentional conflicts and
rerun the relevant checks. A branch, local conversation or provider memory is never fresher than
the current repository state.

## Working rules

- Use the capabilities required by the task, not any particular provider's tool or skill name.
  If an equivalent is unavailable, use the closest safe manual method and record the limitation
  in the handoff or PR.
- Keep `main` buildable, tested, deployable and resumable. Meaningful work belongs on one of
  `feature/`, `fix/`, `refactor/`, `content/`, `docs/` or `chore/` branches and normally enters
  through a reviewed pull request with green CI.
- Preserve the approved canonical Bobo identity and its versioned assets. A provider change,
  generated asset, or convenience refactor is never approval to redesign Bobo.
- Treat secrets, credentials, personal data, payment, legal acceptance, destructive operations
  and production activation as owner-gated. Technical and reversible decisions may proceed
  autonomously.
- Update [`PROJECT_STATE.md`](./PROJECT_STATE.md) only for facts true on stable `main`. Update
  [`CURRENT_WORK.md`](./CURRENT_WORK.md) for active, unmerged work. Keep both secret-free.
- For product, feature, architecture, payment, content, admin, deployment or release changes,
  update the matching canonical status/roadmap document in the same PR as required by
  [`docs/DOCUMENTATION_GOVERNANCE.md`](./docs/DOCUMENTATION_GOVERNANCE.md).

## Finish condition

Before handoff or merge, run the relevant checks, update documentation and state where needed,
complete the PR template, and leave enough evidence for another capable agent to resume without
this conversation. See [`AI_HANDOFF.md`](./AI_HANDOFF.md).
