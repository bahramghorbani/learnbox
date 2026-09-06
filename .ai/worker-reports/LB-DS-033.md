# LB-DS-033 — M1-D reconciliation GET security review and hardening

- Status: accepted
- Base: `fd81158be2bc79746115b836a2e7d674a47d9c11`
- Branch: `review/m1d-reconciliation-read-security`
- Head commit: `b719235c5277f4d502eea68f69acc7eb59667e50`
- Merge commit: `82afe3b0149fc93d28a769ffb5d7f560b18daa41` (PR #219)
- Risk: security-sensitive sync read

## Findings

1. **Activation blocker — cursor/event snapshot race.** `readReconciliation` reads event rows and
   then the current learner cursor in a separate statement. A concurrent POST can commit between
   those reads, causing `nextCursor` to cover an event absent from `events[]`; persisting that cursor
   would skip the event on the next page.
2. **Contract blocker — unbounded cursor input.** The HTTP boundary accepts any digit-only string,
   including values above PostgreSQL BIGINT. The database cast then fails and surfaces as generic
   503, contradicting the contract's 400 validation requirement and spending a DB query on invalid
   input.

## Intended correction

- Derive `nextCursor` only from the last event actually included in the page, or echo `after` when
  no event is included. Never advance past response evidence.
- Validate `after` as a non-negative decimal string within signed PostgreSQL BIGINT before auth-
  scoped storage access.
- Preserve the dormant flag, Bearer subject identity, parameterized SQL, HTTPS boundary, no-store
  responses and generic fault handling.

## TDD evidence

1. BIGINT boundary:
   - RED: `after=9223372036854775808` reached the storage dependency and returned 200 in the focused
     harness instead of 400.
   - GREEN: digit-only cursors are normalized for comparison and rejected above
     `9223372036854775807` before `readReconciliation` is called; Website HTTP file passes 10/10.
2. Pagination race:
   - RED: a page ending at event cursor 42 followed by a simulated concurrent learner-cursor
     advance returned `nextCursor: 43`.
   - GREEN: the read performs one event-page query and returns `nextCursor: 42`, the last emitted
     event checkpoint; an empty page echoes `after`.

## Verification

- Focused API store file: 13/13 passed.
- Focused Website HTTP + route files: 14/14 passed.
- Full API: 133/133 passed across 29 files.
- Full Website: 225/225 passed across 35 files. The untouched LaunchScreen test continues to emit
  its existing Next Image layout warning; no source for that warning is in this diff.
- API build, Website typecheck and Website production build: passed.
- Migration validator: 16 migrations validated.
- Prettier, queue/documentation/continuity/dashboard validators and `git diff --check`: passed.
- Secret-pattern scan: zero private-key, AWS-key or credential-assignment findings.
- GPT-5.6 Sol security/contract review: both activation blockers corrected; no remaining blocker in
  the dormant server read itself.
- GitHub CI: 7/7 passed; PR was clean/mergeable before merge.

## Unchanged gates

`MOBILE_REVIEW_SYNC_ENABLED` and all auth/sync flags remain false/unset by default. No client GET
transport or composition was added. No migration, database data, seed, payment, deployment,
publication or Production state changed. Activation remains a separate consequential decision.

## Merge

Merged to `main` through PR #219 at `82afe3b0149fc93d28a769ffb5d7f560b18daa41`.

## Rollback

Revert the scoped hardening/documentation PR. No schema, migration, activation or deployment is
involved.
