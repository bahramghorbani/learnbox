# LearnBox routine AI worker protocol

This protocol lets a lower-cost coding agent execute bounded routine tasks while the repository
remains the source of truth and Codex retains architecture, security review, mobile validation and
merge ownership.

## DeepSeek start command

When the owner says «پروژه را بخوان، به‌روز شو و وظایفت را انجام بده», DeepSeek must:

1. Follow `AGENTS.md` and the complete `AI_BOOTSTRAP.md` order.
2. Fetch and fast-forward from `origin/main`; inspect open PRs and `CURRENT_WORK.md`.
3. Read this protocol and `.ai/WORK_QUEUE.md`.
4. Select only the first task with `Status: ready` and `Executor: deepseek-flash`.
5. Confirm its base is current and no overlapping branch or PR exists.
6. Create the exact requested `worker/...` branch from the recorded base.
7. Change only `Allowed paths`, use test-first development and run every `Required checks` command.
8. Update the task to `review_requested`, write `.ai/worker-reports/<task-id>.md`, commit, push and
   open a **Draft PR**.
9. Stop. Do not mark the PR ready, merge it, start another task or modify `PROJECT_STATE.md`.

## Absolute boundaries

- Never work on `main`, force-push, merge, rebase shared work, delete a branch, deploy, enable a
  flag, call a paid provider or touch a secret.
- Never perform identity/session/OTP, cryptography, authorization, database migration, payment,
  production infrastructure, release-signing, public-release, legal, or Bobo visual decisions.
- Never claim Flutter, Android Studio, emulator, Xcode, APK installation or physical-device
  validation. DeepSeek does not have those capabilities in the owner's environment.
- Never broaden `Allowed paths`. If a necessary file is outside them, record the blocker and stop.
- A failing or unavailable required check is never rewritten as passing.

## Codex review contract

Codex checks Git and open Draft PRs before new work. For each `review_requested` task Codex verifies
scope, commits, tests, security boundaries and the worker report; runs missing Flutter/emulator/
physical-device checks where applicable; fixes or returns findings; and alone decides when a PR may
become ready and merge after required CI is green.

The task becomes `accepted` only after merge. Codex then updates stable documentation and clears or
archives the work item. A DeepSeek report is evidence for review, never proof of completion.
