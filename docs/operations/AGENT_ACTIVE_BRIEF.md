# Active agent brief

Use this short brief before exploring the repository. It is an execution aid, not a replacement for
the authoritative product and security documents.

## Read order

1. [`AGENTS.md`](../../AGENTS.md).
2. [`AI_BOOTSTRAP.md`](../../AI_BOOTSTRAP.md), then [`PROJECT_STATE.md`](../../PROJECT_STATE.md).
3. [`docs/storyboard/STATUS.md`](../storyboard/STATUS.md) and, when resuming unmerged work,
   [`CURRENT_WORK.md`](../../CURRENT_WORK.md).
4. This file, then only the files named by the current task, their direct tests, and their direct architecture or
   operations references.

## Current working boundary

- Storyboard: **23 of 30 — Closed alpha**.
- Learner application: `apps/website`; marketing website: `apps/learnbox-website`. Do not rebuild
  or merge their responsibilities.
- The Start A1 private-media client seam is implemented, same-origin and failure-safe. It remains
  inactive by default.
- The admin passkey boundary is implemented (routes, store, UI gate, source validator) and remains
  disabled by default; enrollment and deployment are owner-approved steps only.
- The single-owner splash replacement boundary is implemented (migration `0011`, private Blob
  normalization, atomic pointer swap, protected preview/upload routes, UI and learner same-origin
  delivery with bundled fallback) and remains disabled by default behind two server flags. Do not
  add scheduling, a history gallery, delete-current or app-icon controls.
- The closed-alpha invite/consent boundary is implemented (allowlist invite gate, keyed-hash
  persistence, consent versioning) and remains disabled by default; real code issuance and
  activation are owner-approved steps only.
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
- For splash work, start with `apps/admin/test/admin-splash-routes.test.ts`,
  `apps/admin/test/splash-replacement-ui.test.tsx` and
  `apps/website/test/launch-splash.test.ts`, then `scripts/validate-owner-splash-boundary.mjs`.

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
