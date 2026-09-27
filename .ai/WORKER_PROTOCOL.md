# LearnBox AI collaboration protocol

This protocol lets any capable coding agent work from the repository as the source of truth. It
does not reserve routine implementation, review or merge ownership for a named provider.

## Agent start command

When the owner says «پروژه را بخوان، به‌روز شو و وظایفت را انجام بده», the agent must:

1. Follow `AGENTS.md` and the complete `AI_BOOTSTRAP.md` order.
2. Fetch and fast-forward from `origin/main`; inspect open PRs and `CURRENT_WORK.md`.
3. Read this protocol, `docs/DOCUMENTATION_GOVERNANCE.md`, `.ai/WORKSTREAMS.md` and `.ai/WORK_QUEUE.md`.
4. Select a non-overlapping milestone workstream or work item, confirm its base is current, and create a dedicated
   branch from the recorded base.
5. Keep the scope explicit, use test-first development where practical, and run every relevant documented check.
6. Update the task/report and canonical state documents accurately, commit, push and open a PR.
7. An agent may mark the PR ready and merge it into `main` only after all required local and GitHub
   checks are green, its base is current, no open review finding remains, and the merge preserves a
   buildable, tested, resumable `main`.

## Absolute boundaries

- Never edit or commit directly on `main`, regardless of validation; update it only by merging a
  current PR after the green-check rule. Never force-push or destructively rewrite `main`, deploy,
  enable a flag, call a paid provider or touch a secret.
- Never perform identity/session/OTP, cryptography, authorization, database migration, payment,
  production infrastructure, release-signing, public-release, legal, or Bobo visual decisions.
- Never claim a check or device validation that was not actually run. Record unavailable tooling
  honestly and leave any required unavailable check as a merge blocker.
- Never broaden an explicitly approved scope without documenting the reason and running the
  corresponding checks.
- A failing or unavailable required check is never rewritten as passing.

## Parallel coordination

- Multiple capable agents may work at the same time, including routine workers and reviewers. Each
  agent must fetch `origin/main`, inspect live pull requests and `.ai/WORK_QUEUE.md` before
  selecting a task; choose only a documented scope with no overlap in allowed paths with active
  work.
- On starting a branch, opening a Draft PR, changing scope, rebasing, requesting review or merging,
  update the matching task/report and `CURRENT_WORK.md` when it records genuinely unmerged work.
  These updates are part of the work, not optional commentary.
- If another agent merges while work is in progress, merge or rebase the latest `origin/main` into
  the branch without force-pushing, resolve only intentional conflicts, rerun every relevant check
  and refresh the handoff report before the branch may merge.
- Do not duplicate an open task, edit another agent's branch, assume an unpushed local change
  exists remotely, or treat a Draft PR as accepted. When scope overlaps or ownership is unclear,
  stop that item and select a non-overlapping task instead.

## Review and merge contract

The reviewing agent verifies scope, commits, tests, security boundaries and the handoff report;
runs any missing Flutter, emulator or physical-device checks where applicable; and fixes or returns
findings before merge. A task becomes `accepted` only after a green-check merge. A report is
evidence for review, never proof of completion.
