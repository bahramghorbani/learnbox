# LB-DS-040 — Learner-facing OTP Preview revalidation

- Status: review_requested
- Branch: `docs/learner-auth-preview-revalidation`
- Base commit: `a8354a58ebeb5eac3a3a6c2364dbcb3d81f70c6c`
- Head commit: pending
- Draft PR: no
- Scope completed: yes
- Files changed: `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-040.md`, `CURRENT_WORK.md`, `docs/operations/OTP_PROVIDER_ACTIVATION.md`
- Checks run: Prettier, queue validator, documentation governance, AI continuity, dashboard tests, and `git diff --check`
- Checks unavailable: none
- Remaining work: independent review, PR checks, merge, and post-merge reconciliation
- Risks: evidence precision and accidental disclosure of owner authentication data; mitigated by generic-only reporting and bounded Preview rollback
- Secrets or production changes: none
- Bobo canonical status: unchanged
- Environment: Vercel `learnbox` Preview only; Vercel Authentication remained enabled.

## Scope

- Revalidated the learner-facing OTP gate with the owner's real SMS verification.
- Recorded only generic outcomes and deployment identifiers.
- Did not record a phone number, OTP, session token, credential, or secret value.
- Did not change Production, `WEB_LEARNER_STATE_ENABLED`, mobile auth, review sync, code, migrations, or seed data.

## Evidence

- Temporarily set only `NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=true` and `SMS_IR_ENABLED=true` in Preview.
- Redeployed the current post-merge Preview source and verified the enabled deployment remained behind Vercel Authentication (`302` to Vercel SSO for an unauthenticated request).
- The learner-facing sign-in screen appeared with «شمارهٔ موبایل» and «ارسال کد ورود» controls.
- Owner-operated request and verification succeeded without disclosing the phone number or OTP in evidence.
- An authenticated browser capture verified that the login advanced to the post-auth onboarding question «برای چه چیزی آلمانی می‌خوانی؟».
- Restored both temporary flags to `false`.
- Rollback deployment `dpl_AiN2QMmaXpawvtmzKL8MaomDaBmY` (`learnbox-8epkjojmm-learn-box.vercel.app`) was `Ready` and returned `302` to Vercel SSO for an unauthenticated request.
- Removed enabled deployment `learnbox-d01ut5a92-learn-box.vercel.app`; a read-back inspection failed because the deployment was absent.

## Residual boundaries

- The authenticated learner shell is verified only in a protected Preview.
- Persistent server-backed learner state remains disabled because `WEB_LEARNER_STATE_ENABLED` was not changed.
- The current learner path still cannot be called production-ready until the canonical starter catalog and guarded server-state activation are approved and verified.

## Verification

- `pnpm exec prettier --check .ai/WORK_QUEUE.md .ai/worker-reports/LB-DS-040.md CURRENT_WORK.md docs/operations/OTP_PROVIDER_ACTIVATION.md`
- `pnpm verify:ai-worker-queue`
- `pnpm verify:documentation-governance`
- `pnpm verify:ai-continuity`
- `pnpm test:dashboard`
- `git diff --check`

## Review

- Independent security/governance review pending.
