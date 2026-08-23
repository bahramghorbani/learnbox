# LB-DS-008 handoff

- Branch: `worker/lb-ds-008-mobile-identity-store`
- Base commit: `9eccc59`
- Head commit: `9f3c98e` (final handoff head; code commit `99c1409`)
- Draft PR: https://github.com/bahramghorbani/learnbox/pull/104.
- Scope completed: NI-002 only. Hash-only PostgreSQL mobile-session migration and atomic OTP/learner/session persistence. No HTTP route, environment read, provider, network, mobile code, flag, UI, Production activation, review schema, or NI-003+ work.
- Files changed: `database/migrations/0012_mobile_learner_sessions.sql`; `apps/api/src/auth/postgres-mobile-identity.store.ts`; `apps/api/test/mobile-session-migration.test.ts`; `apps/api/test/postgres-mobile-identity.store.test.ts`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-008.md`; `CURRENT_WORK.md`.
- Checks run: `pnpm install --frozen-lockfile`; focused API Vitest 2 files/3 tests; API typecheck/build; `pnpm check`; `pnpm build`; `node scripts/validate-migrations.mjs` validated 12; `git diff --check`. All passed.
- Checks unavailable: none. No simulator required.
- Remaining work: supervisor high-reasoning security review and Draft PR CI only; NI-003+ remain unauthorized.
- Risks: store is uncomposed by design. NI-003 must wire no route until separately authorized, default-disabled runtime controls exist, and review schema remains a separate NI-004 migration.
- Secrets or production changes: none. No secret, environment read, provider, network, flag, release, Preview, or Production change.
- Bobo canonical status: untouched.

## Routing

Queue executor: `high-reasoning-worker`. Actual route: Hermes Agent, `aval-ai/gpt-5.6-terra`, custom provider; sole executor. No delegation. Draft PR requires supervisor high-reasoning security review before merge.

## TDD RED evidence

`pnpm --filter @learnbox/api exec vitest run test/mobile-session-migration.test.ts test/postgres-mobile-identity.store.test.ts` failed before production code: migration file absent and `Cannot find module '../src/auth/postgres-mobile-identity.store.js'`.

## GREEN contract

- Locks `otp_challenges` row, constant-time checks normalized Iranian E.164 keyed phone hash, applies existing OTP transition, consumes verified challenge, upserts `users.phone_e164`, and creates hash-only session inside one transaction.
- Session rows retain installation ID, refresh hash, generation, created/last-used, 30-day absolute expiry, 7-day idle expiry, and family revocation metadata.
- Refresh locks row and rotates hash/generation atomically. Missing, revoked, expired, or old hash revokes live family and returns generic `reused` store result.
- Pure NI-001 layer remains sole owner of 15-minute access-token contract and public generic outcomes.
