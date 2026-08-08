# OTP Delayed Message Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a still-valid OTP from any of the three challenges created in the current protected owner-test tab, so delayed SMS delivery order cannot cause a false rejection.

**Architecture:** Pure helpers maintain a newest-first, three-item in-memory challenge list and classify verification responses. The client component sequentially checks only `400` rejections against the remaining local challenge IDs; exact `204` succeeds and every non-`400` error stops immediately.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Vercel Preview.

## Global Constraints

- Keep phone, code and challenge IDs out of URLs, logs and browser persistence.
- Keep existing OTP API routes, PostgreSQL schema, rate limits and HttpOnly session contract unchanged.
- Retain at most three challenges in component memory and clear them on phone change or success.
- Let the server decide expiry; never reject a challenge from the browser's untrusted clock.
- Treat only HTTP `204` as verification success.

---

### Task 1: Challenge History Contract and Client Flow

**Files:**

- Modify: `apps/website/app/owner/otp-test/owner-otp-test.ts`
- Modify: `apps/website/app/owner/otp-test/OwnerOtpTest.tsx`
- Modify: `apps/website/test/owner-otp-test.test.ts`

**Interfaces:**

- Produces: `rememberOtpChallenge(history, challenge): ChallengeResponse[]`, newest first and capped at three.
- Consumes: existing `POST /api/auth/otp/verify` response contract (`204`, `400`, or terminal error).

- [x] Add failing tests proving newest-first deduplication, three-item cap and source use of sequential challenge verification.
- [x] Run `pnpm --filter @learnbox/website test -- owner-otp-test.test.ts` and confirm the new tests fail for missing behavior.
- [x] Implement `rememberOtpChallenge` and replace the singular challenge state with an in-memory history.
- [x] Verify each challenge sequentially only after a `400`; stop on `204` or terminal errors.
- [x] Update the Persian guidance for delayed/out-of-order messages.
- [x] Re-run focused tests and type checking.

### Task 2: Verification and Preview Deployment

**Files:**

- Modify: `docs/operations/OTP_PROVIDER_ACTIVATION.md`
- Modify: `docs/storyboard/STATUS.md`

**Interfaces:**

- Produces: documented delivery-order safeguard and a new protected Preview deployment.

- [x] Document the observed failure mode and in-memory safeguard.
- [x] Run `pnpm check`, website build, migration validation and production dependency audit.
- [x] Request independent review of privacy, attempt semantics and error handling.
- [ ] Merge and push only after green verification.
- [ ] Redeploy protected Preview with the existing Preview-only flags.
- [ ] Have the owner request one fresh code and verify it without resending unless delivery does not arrive.
