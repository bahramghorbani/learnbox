# LB-DS-007 handoff

- Branch: `worker/lb-ds-007-mobile-session-contract`
- Base commit: `97bf8af`
- Head commit: pending commit after required checks
- Draft PR: pending creation after commit/push
- Scope completed: NI-001 only: pure injected mobile session and identity contracts. No HTTP, DB adapter, migration, environment read, provider, network, flag, mobile composition, or NI-002 work.
- Files changed: `apps/api/src/auth/mobile-session.ts`; `apps/api/src/auth/mobile-identity.service.ts`; `apps/api/test/mobile-session.test.ts`; `apps/api/test/mobile-identity.service.test.ts`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-007.md`; `CURRENT_WORK.md`.
- Checks run: `pnpm install --frozen-lockfile`; focused API Vitest 2 files/5 tests; API typecheck/build; `pnpm build`; `node scripts/validate-migrations.mjs` validated 11; `git diff --check`. `pnpm check` must rerun after report-format correction.
- Checks unavailable: none. No simulator required.
- Remaining work: run final `pnpm check`; refresh commit/PR fields; commit, push, create Draft PR; stop for independent high-reasoning security review.
- Risks: NI-002 must supply database transaction semantics, session-family revocation, expiry windows and real store atomicity. NI-001 deliberately has no persistence or route.
- Secrets or production changes: none. No secret, environment read, provider, network, flag, release, Preview, or Production change.
- Bobo canonical status: untouched.

## Routing

Queue executor: `high-reasoning-worker`. Actual route: Hermes Agent, `aval-ai/gpt-5.6-terra`, custom provider; sole executor. Independent critical reviewer unavailable. Draft PR requests independent high-reasoning security review.

## TDD RED evidence

1. `pnpm --filter @learnbox/api exec vitest run test/mobile-session.test.ts` failed before implementation: `Cannot find module '../src/auth/mobile-session.js'`.
2. `pnpm --filter @learnbox/api exec vitest run test/mobile-identity.service.test.ts` failed before implementation: `Cannot find module '../src/auth/mobile-identity.service.js'`.
3. First session GREEN run caught test assertion inspecting signature segment rather than payload segment; corrected test only.

## GREEN contract

- `node:crypto` HMAC access tokens: version/audience header; deterministic injected clock/bytes/key; default 15 minutes; only `sub`, `sid`, `iat`, `exp`, `jti` payload claims.
- Constant-time signature/hash comparisons. Verification rejects signature/version/audience/expiry failure.
- Opaque 256-bit injected refresh values, keyed hashes, hash-only persistence boundary.
- Iranian normalized phone verification calls one atomic fake store once; input contains normalized phone, challenge, code, installation, phone hash, refresh hash, injected time. Learner/session come only from verified store output.
- Typed immutable generic verification/authentication failures. Rotation uses one atomic hash-only store call. Reuse remains generic store outcome.
