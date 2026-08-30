# LB-DS-022 handoff

- Branch: `worker/m1b-web-learner-state-read`
- Base commit: `5616d0d` (PR #162 merged; Web OTP cookie subject = canonical `users.id`)
- Head commit: pending review (Draft PR)
- Draft PR: pending
- Scope completed: ADR 0012 Web learner-state read route plus truthful Today fetch integration. Added `GET /api/learner/state` Next.js route (cookie-only identity, subject = canonical `users.id`), fail-closed `WEB_LEARNER_STATE_ENABLED` runtime reusing the existing API `LearnerStateService`/`PostgresLearnerStateRepository` via the `api/dist` mount pattern and verified-TLS pool, and a Today client fetch that treats the snapshot as server-backed only after a successful fetch/parse while preserving the local pending-sync chip and loading/error/offline truth labels. No sync acknowledgement is ever claimed; Start Pack ↔ canonical `contentId` join is not invented (server `contentId` authoritative, local review path unchanged).
- Files changed: `apps/website/app/api/learner/state/route.ts`; `apps/website/lib/learner-state-web-http.ts`; `apps/website/lib/learner-state-web-runtime.ts`; `apps/website/lib/learner-state-web-client.ts`; `apps/website/app/components/TodayScreen.tsx`; `apps/website/app/LearnerHome.tsx`; `apps/website/app/learner-sync-state.ts`; `apps/website/test/learner-state-web-route.test.ts`; `apps/website/test/learner-state-web-http.test.ts`; `apps/website/test/learner-state-web-client.test.ts`; `apps/website/test/learner-today-server-states.test.tsx`; `apps/website/README-M1B-WEB-SLICE1.md`; `.env.example`; `docs/architecture/ADR/0012-web-learner-state-server-wiring.md`; `docs/PRODUCT_STATUS.md`; `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-022.md`; `CURRENT_WORK.md`
- Checks run: focused website learner-state tests (4 files, 15 tests) and existing Today/learner flows (28 tests total) green; full website tests; website typecheck; website build; `pnpm verify:security`; `pnpm check`; `pnpm build`; `node scripts/validate-migrations.mjs`; `git diff --check`. All passed.
- Checks unavailable: no simulator/device checks required for this website-only slice.
- Remaining work: none for LB-DS-022. Start Pack seed/release and push-reconciliation watermark remain separate owner-reviewed decisions; server-backed figures require the route enabled with `WEB_LEARNER_STATE_ENABLED=true` and complete verified config.
- Risks: identity boundary is the security seam — cookie subject maps directly to `users.id` and must never accept client-supplied identifiers; enabling the flag requires a verified TLS `DATABASE_URL`; Start-pack content join still unsolved.
- Review status: review_requested; stop at Draft PR for independent high-reasoning review.
- Secrets or production changes: none. No credentials, real personal data, provider activation, production flag enablement or network activation was added; `WEB_LEARNER_STATE_ENABLED` defaults false.
- Bobo canonical status: untouched.
