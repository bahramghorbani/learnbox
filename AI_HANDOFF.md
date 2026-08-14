# LearnBox AI Handoff

Use this document when pausing, transferring, reviewing or resuming meaningful work. It is
provider-neutral: a capable agent continues from repository evidence, not prior chat context.

## Handoff sender checklist

- State the branch, base branch, commit range and whether the work is ready for a pull request.
- Link the task's product decision, ADR, direct tests and operational runbook; do not duplicate
  canonical specifications in chat or a temporary note.
- Record commands actually run and their result. Separate local validation, CI status, deployment
  verification and manual user-flow verification.
- Update `CURRENT_WORK.md` while the work remains unmerged. Update `PROJECT_STATE.md` only after
  stable `main` contains the milestone.
- Explain remaining risk, rollback or feature-flag state, and any owner-only action. Never place
  credentials, API keys, private phone numbers or personal data here.
- Confirm Bobo status explicitly when visual assets or prompts were touched: canonical approved
  assets remain unchanged unless a recorded owner approval says otherwise.

## Handoff receiver checklist

1. Follow the complete bootstrap order in [`AI_BOOTSTRAP.md`](./AI_BOOTSTRAP.md).
2. Compare `CURRENT_WORK.md` with live Git status, branches, commits and pull requests; Git is
   authoritative if a handoff note is stale.
3. Read only direct specifications and tests required by the task. Preserve the learner app
   (`apps/website`) and marketing site (`apps/learnbox-website`) as separate responsibilities.
4. Re-run focused checks before changing a failing area, then the required feature-boundary gate
   before proposing merge.
5. Do not activate providers, release flags or production infrastructure merely because a branch
   contains a seam for them.

## Pull request and merge standard

A PR is ready to merge only when its scope is clear, relevant checks are green, documentation and
state are synchronized, the rollback or flag posture is recorded, and its change does not weaken
privacy, canonical Bobo governance, or the closed-alpha boundary. If CI is unavailable, leave the
PR unmerged and record the exact limitation in `CURRENT_WORK.md`.

## Current native-audio continuity gate

- The native offline-pronunciation attempt was rejected during physical Android QA: the candidate
  word media played English-like `house` and omitted the displayed German article. The candidate
  PR #58 was closed without merge and its branch/assets were removed.
- Continue only from GitHub issue #59. Produce or license the exact displayed German phrase
  (for example `das Haus`), require `de-DE` listening QA in addition to transcription, and record
  provenance, reviewer, version and checksum before any packaging PR.
- Documentation PR #60 records this gate and the accepted historical DeepSeek task. It remains a
  Draft only because GitHub Actions failed before runner allocation on three attempts; its local
  `pnpm check` and migration validation passed. Re-run CI and merge it only after every required
  check is green. Do not bypass the quality gate.

## Routine worker handoff

DeepSeek Flash and equivalent routine workers follow [`.ai/WORKER_PROTOCOL.md`](./.ai/WORKER_PROTOCOL.md),
take work only from [`.ai/WORK_QUEUE.md`](./.ai/WORK_QUEUE.md), leave the standard report under
`.ai/worker-reports/`, and stop at a Draft PR. They cannot approve or merge their own work. Codex
owns final review, unavailable mobile/toolchain checks, CI closure and integration.
