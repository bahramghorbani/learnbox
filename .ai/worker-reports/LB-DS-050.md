# LB-DS-050 — Admin content-review staging preflight

- Branch: `ops/admin-content-review-staging-preflight`
- Base commit: `a3f472012d653dee26ad40c64258abd70065cef6` (`origin/main`; PR #254 merge commit)
- Head commit: resolve from `origin/ops/admin-content-review-staging-preflight` after the single authorized push; the Draft PR body binds the exact pushed SHA
- Draft PR: required; PR #255 opened after final local verification and remains Draft through review
- Scope completed: default-off Admin content-review Compose mapping; deployment-boundary coverage for the Admin mapping and learner-app migration-runner runtime resolution; staging activation/verification/rollback runbook; canonical review-request metadata
- Files changed: the six bounded implementation/runbook files plus `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-050.md`, `CURRENT_WORK.md`, and `docs/PRODUCT_STATUS.md`
- Checks run: on the final rebased tree, `pnpm check` passed; `pnpm build` passed; both focused deployment-boundary suites passed 5/5 combined; migration validation passed for 17 migrations including 0017 determinism/fail-closed guards; production audit found no known vulnerabilities; queue, documentation-governance, continuity, dashboard and security validators passed; `git diff --check` passed
- Checks unavailable: no required local or remote check is unavailable; the full check retained one pre-existing landing-test module-type warning and one opt-in browser-layout skip unrelated to this non-UI scope; no staging operation is authorized
- Remaining work: merge the preparation PR after its final metadata-only head is green; separately obtain explicit owner approval before any staging backup, migration, flag activation, deployment or authenticated human review
- Risks: staging and migration operational error, mitigated by default-off configuration, immutable-image checks, exact migration ledger/checksum gates, verified backup/restore stop conditions, fail-closed route probes and application-first rollback; no operation is performed by this PR
- Secrets or production changes: none. No secret, credential, database row, environment value, Vercel setting, deployment, migration execution, staging/Preview/Production activation or Production change is included
- Bobo canonical status: unchanged; no Bobo asset, prompt, generation or visual treatment is modified

## Scope boundaries

This branch only makes a later owner-approved staging operation reproducible. It does not execute
migration `0017`, enable `LEARNBOX_ADMIN_CONTENT_REVIEW_ENABLED`, deploy an image, attest review
checks, approve content, seed a catalog, publish content, expose learner delivery, or send invitations.
The new Compose value remains `false` unless explicitly supplied at runtime.

## TDD evidence

The prepared implementation commit added the deployment-boundary tests with the bounded production
changes before this continuation. No production code is authored during metadata reconciliation.
This continuation independently reruns both focused suites and every required final-tree check after
rebasing; it does not recreate or claim a new RED observation.

## Independent review evidence

The independently inspected PR head `8e04b7b0b3f9c69b9e9e5351bc18e454a9eec125` received a PASS for
infrastructure/migration safety with all seven GitHub/Vercel contexts green. The reviewer requested
that the PR body stop pre-declaring a reviewer outcome, that the static Dockerfile test name avoid
overclaiming runtime proof, and that the symlink fail closed if a future standalone layout already
contains `apps/api/node_modules`. This bounded follow-up implements those corrections. A real local
image build and non-root container smoke resolved `pg@8.22.0`, the compiled migration runner and
migration `0017`; the temporary image was removed. The independently reviewed hardening head
`1ba87ab39cd99ec38892bf3a508a3cd09e50d0c4` then completed all seven GitHub/Vercel contexts with
success. The remaining metadata-only delta reconciles this report; its exact-head checks remain
required before merge.
