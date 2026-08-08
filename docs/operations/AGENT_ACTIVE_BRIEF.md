# Active agent brief

Use this short brief before exploring the repository. It is an execution aid, not a replacement for
the authoritative product and security documents.

## Read order

1. This file.
2. [`AGENTS.md`](../../AGENTS.md).
3. [`docs/storyboard/STATUS.md`](../storyboard/STATUS.md).
4. Only the files named by the current task, their direct tests, and their direct architecture or
   operations references.

## Current working boundary

- Storyboard: **23 of 30 — Closed alpha**.
- Learner application: `apps/website`; marketing website: `apps/learnbox-website`. Do not rebuild
  or merge their responsibilities.
- The Start A1 private-media client seam is implemented, same-origin and failure-safe. It remains
  inactive by default.
- Learner OTP, SMS.ir delivery and both private-media release flags remain disabled by default.
- Do not deploy, enable a flag, send invitations, publish content, or use a provider credential
  without the owner's explicit approval.
- Bobo canonical assets stay unchanged until a replacement is explicitly approved.

## Fast local navigation

- Begin with `git status --short --branch` and `git diff --name-only`.
- Use `rg` to locate symbols and `sed -n` for only the needed ranges. Do not read whole directories
  or broad documents unless the task requires them.
- Start from direct tests. For the learner media boundary, use
  `apps/website/test/start-media-card.test.tsx` and `apps/website/test/start-media.test.ts`.
- Use focused tests while changing code. Run `pnpm check`, the relevant production build and
  migration validation only at a feature boundary, before integration, or after a sensitive change.

## Quality and model routing

- Default operating mode: **GPT-5.6 Terra** with medium reasoning for ordinary implementation,
  targeted tests, documentation and routine refactors.
- Ask the owner to switch temporarily to **GPT-5.6 Sol** before authentication or session changes,
  security boundaries, database migrations, payment/provider activation, difficult regressions,
  cross-application refactors, or final release verification. Tell the owner when it is safe to
  return to Terra.
- Do not create a subagent or load a Skill by default. Use either only when the task is truly
  independent, a review materially reduces risk, or the selected Skill is directly relevant or
  mandatory.
- Keep owner updates to blockers, decisions that need approval, and completed milestones. Do not
  repeat routine technical reports.

## Keep this brief current

Update it after a merged milestone only when the active stage, entry points, release gates, test
commands, or owner boundary materially change. Keep it short and secret-free.
