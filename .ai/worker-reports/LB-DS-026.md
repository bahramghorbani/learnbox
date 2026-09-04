# LB-DS-026 worker report

- Branch: docs/m1d-wire-contract-design
- Base commit: 4718f93 (origin/main, PR #204 merged)
- Head commit: `921bf2b` (stable design + queue registration; handoff metadata finalized locally; no push, no PR)
- Draft PR: none (not pushed, not opened — retry task stops after local commit)
- Scope completed: Decision-ready PROPOSED / NOT IMPLEMENTED sync wire contract for the M1-D
  pull-based reconciliation read, plus this handoff report and the LB-DS-026 queue/current-work
  registration. Design-only retry: no implementation, no code/test/migration/route/flag/auth/mobile/web
  changes. Contract (docs/architecture/M1D_SYNC_WIRE_CONTRACT.md) covers: scope and current
  facts; proposed `GET /api/reviews/mobile/reconciliation?after=<cursor>` pull-based read
  paired with the existing POST (explicitly stated as NOT existing today — no route is
  registered); exact request/response JSON examples with no secrets; per-item
  acknowledgement and cursor semantics per ADR 0014 (cursor alone never authorizes queue
  removal; removal only on exact acknowledged `clientEventId`); idempotency (learner-scoped
  `(user_id, client_event_id)` + payload equality, unchanged) and ordering (ascending
  applied position, `nextCursor`/`hasMore` paging); malformed/partial response and retry;
  offline/reconnect sequence (steps 4–5 new, 1–3 exist dormant); concurrent devices
  (per-learner cursor, cross-device POST race via idempotent replay); unknown/unpublished
  content (never applied → never listed; unresolved acknowledged-but-not-yet-applied
  filtering semantics left open); server identity boundary (Bearer `sub` only); no-data-loss
  invariants I1–I7; observability without PII (cursor/event values never logged); versioning
  (additive, single-key response shape, legacy NULL coalesce to `'0'`); rollout/rollback
  (dormant behind `MOBILE_REVIEW_SYNC_ENABLED`, no new migration under preferred per-event
  reading, security review required before enablement); alternatives with recommendation
  (pull GET over push / bulk-ask / state-snapshot reuse / full replay); open owner decisions
  O-1 (`idempotencyConflict` retry-vs-tombstone) and O-2 (server filtering semantics) left
  unresolved, not silently decided; future acceptance criteria 1–8 incl. migration numbering
  and security review. All sync flags remain false; implementation requires a separately
  authorized serial queue task.
- Files changed: docs/architecture/M1D_SYNC_WIRE_CONTRACT.md (new);
  .ai/worker-reports/LB-DS-026.md (new, this file)
- Checks run: `node_modules/.bin/prettier --check` on the two changed files (clean, exit 0);
  `git diff --check` (clean); `git status` clean before and after commit.
- Checks unavailable: no full pnpm checks, lint, typecheck, tests or migration validation —
  not run per narrow retry scope (design-only, two markdown files; no pnpm install, no broad
  scans).
- Remaining work: owner/supervisor review of this design; record owner decisions O-1/O-2;
  then a separately authorized serial M1-D queue task to implement the GET route + parser +
  tests behind the existing flag (dormant), plus the separate composition/enablement task.
  No PR opened.
- Risks: proposed endpoint does not exist and must not be assumed by any client until the
  serial implementation task lands it; cursor position boundary reading ((a) per-event
  `reconciliation_cursor` vs (b) learner cursor table) is narrowed to a preferred reading
  but the exact SQL is deferred to the implementation slice; O-1/O-2 deliberately open.
- Secrets or production changes: none. No secrets, credentials, real IDs, deployment,
  payment, OTP, Preview, flag enablement or production activation.
- Bobo canonical status: unchanged.
