# LB-DS-071 — Web offline and failure-recovery accessibility

- Branch: `fix/web-offline-error-recovery-a11y`
- Base commit: `b49f325c0fa328a90b7e1da0f53e0e509d69cc5a` (`origin/main`, PR #281 merge)
- Head commit: pending local TDD implementation
- Draft PR: not opened
- Scope completed: task authorized from a read-only exact-baseline gap audit; implementation has not started.
- Files changed: `.ai/WORK_QUEUE.md`; `.ai/worker-reports/LB-DS-071.md` for authorization only.
- Checks run: pending after implementation; authorization commit must first pass queue/continuity/format checks.
- Checks unavailable: focused RED/GREEN, website test/typecheck/build, security, full check, independent exact-head review and seven GitHub/Vercel contexts remain pending.
- Remaining work: implement only the three offline/error surfaces and their tests, preserve the existing security markers, increment only the service-worker cache version, then run all required checks and independent review.
- Risks: reconnect copy must not claim server sync or recovered learning events; service-worker fallback changes can remain stale without a cache version bump; assistive-technology announcements must not duplicate decorative content.
- Secrets or production changes: prohibited and none performed; no provider, credential, flag, deployment, Preview, Production, auth/session, API, database, media or release state is in scope.
- Bobo canonical status: existing recovery asset remains unchanged.
