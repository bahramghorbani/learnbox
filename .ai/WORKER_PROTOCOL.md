# LearnBox AI collaboration protocol

This protocol lets any capable coding agent work from the repository as the source of truth. It
does not reserve routine implementation, review or merge ownership for a named provider.

## Agent start command

When the owner says «پروژه را بخوان، به‌روز شو و وظایفت را انجام بده», the agent must:

1. Follow `AGENTS.md` and the complete `AI_BOOTSTRAP.md` order.
2. Fetch and fast-forward from `origin/main`; inspect open PRs and `CURRENT_WORK.md`.
3. Read this protocol and `.ai/WORK_QUEUE.md`.
4. Select a non-overlapping task or work item, confirm its base is current, and create a dedicated
   branch from the recorded base.
5. Keep the scope explicit, use test-first development where practical, and run every relevant
   documented check.
6. Update the task/report and canonical state documents accurately, commit, push and open a PR.
7. An agent may mark the PR ready and merge it into `main` only after all required local and GitHub
   checks are green, its base is current, no open review finding remains, and the merge preserves a
   buildable, tested, resumable `main`.

## Absolute boundaries

- Never force-push, destructively rewrite `main`, deploy, enable a flag, call a paid provider or
  touch a secret. Do not make direct unvalidated edits on `main`; use the green-check merge rule.
- Never perform identity/session/OTP, cryptography, authorization, database migration, payment,
  production infrastructure, release-signing, public-release, legal, or Bobo visual decisions.
- Never claim a check or device validation that was not actually run. Record unavailable tooling
  honestly and leave any required unavailable check as a merge blocker.
- Never broaden an explicitly approved scope without documenting the reason and running the
  corresponding checks.
- A failing or unavailable required check is never rewritten as passing.

## Review and merge contract

The reviewing agent verifies scope, commits, tests, security boundaries and the handoff report;
runs any missing Flutter, emulator or physical-device checks where applicable; and fixes or returns
findings before merge. A task becomes `accepted` only after a green-check merge. A report is
evidence for review, never proof of completion.
