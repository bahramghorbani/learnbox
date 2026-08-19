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

- Storyboard: **24 of 30 — Beta and load testing**. The owner-controlled Stage 23 Preview journey
  passed on 2026-08-12; no real beta cohort or production activation is authorized.
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
  persistence, consent versioning). Its approved Preview journey passed and all temporary flags are
  disabled again; any future real invitation remains owner-approved.
- Learner OTP, SMS.ir delivery and both private-media release flags remain disabled by default.
- Stage 24 has a local-only synthetic load foundation. Use `pnpm test:load`, then serve the built
  learner app on `127.0.0.1:3010` and run `pnpm load:local:smoke` or
  `pnpm load:local:baseline`; the runner rejects Preview, Production and non-loopback targets.
  See `docs/operations/STAGE_24_LOAD_TESTING.md`. Low-end Android and real-environment capacity
  baselines remain separate work. Do not generate load against Production.
- Use `pnpm test:engine-load` for the separate CPU-only learning-engine guardrail; it has no network
  target and is not a substitute for Android, Preview or Production measurement.
- Native hosts live in `apps/mobile`. Run `flutter analyze`, `flutter test` and `flutter build apk
--debug` for mobile changes. A local Android emulator smoke is complete, but never treat it as
  the representative physical-device baseline required by Stage 24.
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

- Supervising agents follow [`.ai/ORCHESTRATION_POLICY.md`](../../.ai/ORCHESTRATION_POLICY.md): use
  the strongest configured reasoning tier for supervision, then route implementation to the
  cheapest reliable routine, substantial or high-reasoning worker. Provider failover must not
  silently downgrade supervisor capability; worker escalation is explicit.
- Architecture, authentication/session changes, security boundaries, database migrations,
  payment/provider activation, important product or UI decisions, difficult regressions,
  cross-application refactors and final high-risk verification require high-reasoning review.
- Do not create a subagent or load a Skill by default. Use either only when the task is truly
  independent, a review materially reduces risk, or the selected Skill is directly relevant or
  mandatory.
- Before starting new implementation, inspect `.ai/WORK_QUEUE.md` and open Draft PRs. Review any
  `review_requested` routine-worker task before creating overlapping work. Any agent must record
  unavailable Flutter, Android Studio, emulator, Xcode, APK-install or physical-device evidence
  honestly; a required unavailable check blocks merge.
- Keep owner updates to blockers, decisions that need approval, and completed milestones. Do not
  repeat routine technical reports.

## Keep this brief current

Update it after a merged milestone only when the active stage, entry points, release gates, test
commands, or owner boundary materially change. Keep it short and secret-free.
