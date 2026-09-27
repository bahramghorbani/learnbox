# Owner OTP Preview Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a hidden, protected Persian two-step UI for one controlled SMS.ir OTP test.

**Architecture:** A server-rendered page enforces a Preview-only environment flag and delegates interaction to a small client component. Pure helper functions own normalization, validation, response parsing, and Persian error mapping so behavior can be tested without a browser DOM library. Existing OTP API routes remain the only delivery and verification boundary.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, CSS, Vercel Preview.

## Global Constraints

- Never log, persist, or place raw phone numbers, OTP codes, challenge IDs, or secrets in URLs.
- Keep `SMS_IR_ENABLED=false` and `LEARNBOX_OTP_TEST_UI_ENABLED=false` outside the protected Preview test.
- Preserve the existing API security and rate-limit policy.
- Use IRANSansX Regular 400 and Bold 700, Persian RTL, and mobile input text of at least 16px.
- Do not change the learner-facing prototype authentication flow in this task.

---

### Task 1: Testable OTP UI Contract

**Files:**

- Create: `apps/website/test/owner-otp-test.test.ts`
- Create: `apps/website/app/owner/otp-test/owner-otp-test.ts`

**Interfaces:**

- Produces: `normalizeOtpDigits(value: string): string`, `validateIranianMobile(value: string): boolean`, `otpErrorMessage(status: number, code?: string): string`, and `readChallengeResponse(value: unknown): ChallengeResponse | null`.

- [x] Write tests covering Persian digit normalization, valid/invalid Iranian mobiles, safe challenge parsing, and generic Persian messages for invalid, rate-limited, and unavailable responses.
- [x] Run `pnpm --filter @learnbox/website test -- owner-otp-test.test.ts` and verify failure because the module is missing.
- [x] Implement the minimal pure helpers.
- [x] Re-run the focused test and verify it passes.

### Task 2: Flagged Two-Step Page

**Files:**

- Create: `apps/website/app/owner/otp-test/page.tsx`
- Create: `apps/website/app/owner/otp-test/OwnerOtpTest.tsx`
- Modify: `apps/website/app/globals.css`
- Modify: `.env.example`

**Interfaces:**

- Consumes: existing `POST /api/auth/otp/request` and `POST /api/auth/otp/verify` contracts.
- Produces: hidden `/owner/otp-test` page guarded by `LEARNBOX_OTP_TEST_UI_ENABLED`.

- [x] Add a failing source-contract test proving the route checks the exact flag and the client posts only to the two same-origin API paths.
- [x] Run the focused test and verify the new assertions fail.
- [x] Add the server page with `notFound()` when the flag is not exactly `true`.
- [x] Add the client form with phone, code, waiting, resend cooldown, generic errors, and success states.
- [x] Add isolated RTL mobile styles using the existing IRANSansX font variables and accessible focus/status treatment.
- [x] Add `LEARNBOX_OTP_TEST_UI_ENABLED=false` to `.env.example`.
- [x] Re-run the focused test and website tests.

### Task 3: Verification and Protected Preview

**Files:**

- Modify: `docs/operations/OTP_SMS_IR_ACTIVATION.md`
- Modify: `docs/storyboard/STATUS.md`

**Interfaces:**

- Produces: documented test route and rollback instructions.

- [x] Document Preview-only activation and immediate rollback flags.
- [x] Run `pnpm check`, `pnpm --filter @learnbox/website build`, migration validation, and production audit.
- [x] Render-test locally with the UI flag true and SMS delivery false; verify phone validation and the safe unavailable state in a mobile viewport.
- [ ] Commit and publish the reviewed change without altering the landing site subtree.
- [ ] Set `LEARNBOX_OTP_TEST_UI_ENABLED=true` and `SMS_IR_ENABLED=true` in Vercel Preview only, redeploy, and confirm authentication still protects the URL.
- [ ] Open the protected route so the owner can enter their number and trigger exactly one controlled SMS.
