# Learner OTP UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the learner sign-in UI to the tested OTP routes behind an exact, disabled-by-default public UI flag without enabling SMS.ir or closed-alpha invitations.

**Architecture:** Shared pure client helpers own normalization, challenge history and sequential verification. `AuthGate` keeps the existing explicit local prototype mode and adds a fail-closed server mode selected only by `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=true`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, existing same-origin OTP routes.

## Global Constraints

- Keep `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false` and `SMS_IR_ENABLED=false` by default.
- Never place phone numbers, OTP codes or challenge IDs in URLs, logs, localStorage or sessionStorage.
- Never fall back from server OTP mode to local prototype authentication after an error.
- Treat only HTTP `204` as verification success; only HTTP `400` may advance to another remembered challenge.
- Keep production activation, invitations and consent approval outside this plan.

---

### Task 1: Shared OTP Client Contract

**Files:**

- Create: `apps/website/lib/otp-client.ts`
- Modify: `apps/website/app/owner/otp-test/owner-otp-test.ts`
- Modify: `apps/website/app/owner/otp-test/OwnerOtpTest.tsx`
- Modify: `apps/website/test/owner-otp-test.test.ts`

**Interfaces:**

- Produces: `ChallengeResponse`, `normalizeOtpDigits`, `validateIranianMobile`, `readChallengeResponse`, `rememberOtpChallenge`, `verifyOtpChallenges`, `otpErrorMessage` from `apps/website/lib/otp-client.ts`.
- Preserves: `isOwnerOtpTestEnabled(environment)` in the owner-only module.

- [ ] Add a failing source-boundary test proving the owner UI imports its client contract from `lib/otp-client` and the owner-only module contains only the environment gate.
- [ ] Run `pnpm --filter @learnbox/website test -- owner-otp-test.test.ts` and confirm the new test fails before the move.
- [ ] Move the pure helpers and types without changing signatures or behavior; re-export only where compatibility requires it.
- [ ] Re-run the focused suite and `pnpm --filter @learnbox/website typecheck`.
- [ ] Commit with `refactor: share OTP client contract`.

### Task 2: Fail-Closed Learner OTP Mode

**Files:**

- Create: `apps/website/app/learner-auth-mode.ts`
- Modify: `apps/website/app/components/AuthGate.tsx`
- Modify: `apps/website/app/page.tsx`
- Create: `apps/website/test/learner-auth-gate.test.ts`
- Modify: `.env.example`
- Modify: `scripts/validate-otp-provider-boundary.mjs`

**Interfaces:**

- Produces: `resolveLearnerAuthMode(value?: string): 'local-prototype' | 'server-otp'`.
- Consumes: shared OTP helpers and existing `POST /api/auth/otp/request` / `POST /api/auth/otp/verify` contracts.
- `AuthGate` receives `mode` and calls `onAuthenticated` only after local prototype validation or exact server `204`.

- [ ] Add failing tests for exact flag selection, default false in `.env.example`, same-origin route use, no browser persistence/logging and no server-to-local fallback text or branch.
- [ ] Run `pnpm --filter @learnbox/website test -- learner-auth-gate.test.ts` and confirm the missing behavior fails.
- [ ] Implement the exact mode resolver and pass its result from the learner page.
- [ ] Implement pending/error/resend state, in-memory challenge history and sequential verification in `AuthGate` while retaining explicitly labelled local prototype behavior.
- [ ] Extend the provider-boundary validator to require the exact public default and reject unsafe fallback markers.
- [ ] Run focused tests, type checking and `pnpm verify:otp-provider-boundary`.
- [ ] Commit with `feat: connect learner OTP UI seam`.

### Task 3: Status, Verification and Review

**Files:**

- Modify: `BACKLOG.md`
- Modify: `docs/operations/OTP_PROVIDER_ACTIVATION.md`
- Modify: `docs/storyboard/STATUS.md`
- Modify: this plan checklist.

**Interfaces:**

- Produces: truthful disabled-by-default activation status and review evidence.

- [ ] Record that the owner delivery test passed and the learner UI seam is implemented but inactive.
- [ ] Run `pnpm check`, website build, migration validation and `pnpm audit --prod --audit-level=high`.
- [ ] Request independent security and regression review; address all important findings.
- [ ] Merge and push only after green verification; do not deploy or enable the feature.
