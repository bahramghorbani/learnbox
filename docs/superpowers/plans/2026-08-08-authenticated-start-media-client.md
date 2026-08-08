# Authenticated Start Media Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach Start card images and audio to the existing authenticated same-origin private-media route without enabling learner OTP, SMS.ir, invitations or delivery flags.

**Architecture:** A pure `start-media` module resolves one of three client modes and builds relative media paths. The learner page supplies the exact public flag and auth mode; the card UI consumes resolved sources and fails back to the current placeholder without affecting the learning flow.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest/JSDOM, existing signed-session and private-media routes.

## Global Constraints

- Keep `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false`, `LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false`, `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false` and `SMS_IR_ENABLED=false` by default.
- Private media is selectable only with auth mode `server-otp` and the exact public value `true`.
- Never expose Blob URLs, tokens, phone numbers, OTP codes, challenge IDs or session values in source, URLs, logs or browser storage.
- Media failure must not block card grading, authenticate a learner or fall back to another external provider.
- Do not deploy, enable flags, send invitations or alter Start content/Bobo assets.

---

### Task 1: Pure Start Media Contract

**Files:**

- Create: `apps/website/app/start-media.ts`
- Modify: `apps/website/app/start-slice.ts`
- Create: `apps/website/test/start-media.test.ts`

**Interfaces:**

- Produces: `StartMediaMode = 'placeholder' | 'local-preview' | 'private-session'`.
- Produces: `resolveStartMediaMode({ privateMediaFlag, authMode, hostname }): StartMediaMode`.
- Produces: `buildStartMediaSources(contentId, mode): { image?: string; wordAudio?: string; sentenceAudio?: string }`.
- Consumes: `LearnerAuthMode` and validated Start IDs.

- [x] Add tests that expect exact `true` plus `server-otp` to select `private-session`, localhost to select `local-preview`, all other combinations to select `placeholder`, and private paths to remain relative `/api/private-media/...` URLs.
- [x] Run `pnpm --filter @learnbox/website test -- start-media.test.ts` and confirm failure because `start-media.ts` is missing.
- [x] Implement the resolver and source builder. Validate IDs with `/^[a-z0-9-]+$/`; invalid IDs return an empty source object.
- [x] Remove route construction from `start-slice.ts`; retain content identity and learning copy only.
- [x] Re-run the focused test and `pnpm --filter @learnbox/website typecheck`.
- [x] Commit with `feat: add authenticated Start media contract`.

### Task 2: Learner Card Attachment and Failure State

**Files:**

- Modify: `apps/website/app/page.tsx`
- Modify: `apps/website/app/components/PronunciationButton.tsx`
- Modify: `apps/website/app/globals.css`
- Modify: `apps/website/test/learner-auth-gate.test.ts`
- Create: `apps/website/test/start-media-card.test.tsx`

**Interfaces:**

- Consumes: `resolveStartMediaMode` and `buildStartMediaSources` from Task 1.
- Produces: a small `StartMediaVisual` component that swaps a failed image for the neutral placeholder and reports only generic availability copy.
- Preserves: browser speech fallback in `placeholder`; route audio in both media modes.

- [x] Add rendered tests proving that private relative sources appear only for exact public enablement with `server-otp`, localhost retains local preview, placeholder mode contains no media route, and an image error restores the neutral placeholder without changing card controls.
- [x] Run `pnpm --filter @learnbox/website test -- start-media-card.test.tsx` and confirm the private-session behavior is absent.
- [x] Resolve the media mode from `process.env.NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED`, the existing auth mode and browser hostname; pass resolved sources to the card.
- [x] Implement the failure-safe visual component and three truthful copy variants: pending, local QA, protected alpha media.
- [x] Keep `PronunciationButton` generic and ensure a failed route only changes its accessible status to unavailable.
- [x] Re-run the rendered suite, all website tests and website type checking.
- [x] Commit with `feat: attach authenticated Start media`.

### Task 3: Default Gates, Documentation and Final Verification

**Files:**

- Modify: `.env.example`
- Modify: `scripts/validate-private-media-delivery.mjs`
- Modify: `docs/architecture/PRIVATE_MEDIA_DELIVERY.md`
- Modify: `docs/storyboard/STATUS.md`
- Modify: `BACKLOG.md`
- Modify: this plan checklist.

**Interfaces:**

- Produces: an exact disabled public default and automated rejection of direct Blob URLs or unsafe mode combinations.
- Produces: truthful status stating the client seam is implemented but inactive.

- [x] Add failing validator assertions for `NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false`, same-origin route construction, no direct Blob URL in learner code and the server flag remaining independent.
- [x] Run `node scripts/validate-private-media-delivery.mjs` and confirm failure for the missing public default.
- [x] Add the exact false default and extend the validator without weakening existing server-session checks.
- [x] Update architecture, backlog and storyboard status; do not claim activation, deployment or a completed invitation journey.
- [x] Run `pnpm check`, `pnpm --filter @learnbox/website build`, `node scripts/validate-migrations.mjs` and `pnpm audit --prod --audit-level=high`.
- [ ] Request independent security/regression review and address all important findings.
- [ ] Merge and push only after green verification; do not deploy or enable any flag.
