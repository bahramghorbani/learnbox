# LB-DS-039 — Protected Preview OTP revalidation

- Status: review_requested
- Branch: `docs/otp-preview-revalidation`
- Base commit: `514ab09919307756dda576fa83c91e5ac0d7d9e5`
- Head commit: pending documentation commit
- Draft PR: no
- Scope completed: bounded owner-only SMS.ir request/verify revalidation in Vercel Preview, followed by immediate rollback
- Files changed: `docs/operations/OTP_PROVIDER_ACTIVATION.md`; `CURRENT_WORK.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-039.md`
- Checks run: live deployment Ready inspection; unauthenticated SSO redirect before and after; owner-reported generic request/verification success; post-rollback authenticated `404`; repository validators pending
- Checks unavailable: no sensitive provider payload, phone number, OTP, token, cookie or secret value was captured by design
- Remaining work: review this evidence PR; keep public learner auth, Web learner state, native auth and review sync separately gated
- Risks: the successful test proves only the existing protected owner route and SMS.ir request/verification/session path; it does not prove a learner-facing release or native-client operation
- Secrets or production changes: no secret values read or written; Preview-only booleans were temporarily enabled and returned to `false`; Production untouched
- Bobo canonical status: not applicable; no Bobo asset or canonical content change

## Evidence

- Environment class: Vercel Preview only, project `learnbox`.
- Enabled deployment: `dpl_DTX9gg1jyx3fzCRxnRthH1sa49qd`, Ready and protected by Vercel Authentication.
- Generic owner outcome: real SMS request succeeded and the received code verified successfully on the protected owner page.
- Rollback deployment: `dpl_wH4Y6bT3XKiUtegDPs5sW86anKad`, Ready.
- Rollback: `LEARNBOX_OTP_TEST_UI_ENABLED=false` and `SMS_IR_ENABLED=false`; authenticated `/owner/otp-test` returned `404`; unauthenticated access continued to redirect to Vercel SSO.
- Negative boundaries: `MOBILE_AUTH_ENABLED`, `MOBILE_REVIEW_SYNC_ENABLED` and `WEB_LEARNER_STATE_ENABLED` remained absent; no review upload, private media, analytics, content publication, public release or Production change occurred.
- Connected Android device was discovered but intentionally not used: native auth cannot be claimed from the browser-only owner route, and no mobile flag or build-time Preview origin was enabled.
