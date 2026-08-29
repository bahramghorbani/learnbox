# M1-D Sync and Persistence — Implementation Slice 1

**Status:** Draft PR — first M1-D implementation slice.
**Basis:** `origin/main` at `8806543` (M1-A contract PR #151 merged).
**Scope authority:** `.ai/WORK_QUEUE.md` M1-D workstream (W6, serial for migrations/auth,
separate worktree). **No production, payment, OTP, Preview, background sync or server
deployment is enabled by this slice.**

## What this slice implements

Contract section 12.3 (server-authoritative learner state read) with the smallest coherent
production path that reuses only verified M1-A seams:

- `GET /api/learner/state` — server-authoritative schedule snapshot + due-card plan +
  server-held review-event count, for post-reconnect reconciliation.
- Learner identity derived only from the verified native access token (`sub`); never from a
  client-supplied user ID.
- Fail-closed runtime behind an explicit `LEARNER_STATE_ENABLED=true` flag plus complete
  `DATABASE_URL` / `LEARNBOX_MOBILE_SESSION_SECRET` config — exactly the
  `MOBILE_REVIEW_SYNC_ENABLED` pattern. Default environment: route returns 503
  `serverUnavailable`, no cookie, no-store.
- The due-card plan comes from the same `createDailySessionPlan` learning-engine seam the
  review write path uses, so the response matches what the server would schedule next.
- Read-only PostgreSQL adapter: `card_schedules ⋈ cards` (via canonical `content_id`) and a
  `COUNT(*)` over `review_events`. No new schema, no migration (M1-D 12.5 requires migration
  coverage; this slice deliberately ships zero migrations so nothing new needs coverage).
- Same trust boundary as the review route: Bearer token only, HTTPS outside bounded loopback,
  strict JSON, typed errors from §9 taxonomy, `cache-control: no-store`.

## Why no migration in this slice

- `card_schedules` already carries `state/stability_days/difficulty/lapses/due_at` and the
  user-scoped due index; `review_events` already has the learner-scoped idempotency key. The
  read needs no new columns.
- The contract's only unresolved persistence questions are for a **push** reconciliation
  direction (server-persisted `acknowledgement` watermark / client-cursor), which the M1-A
  contract explicitly leaves open ("Proposed (M1-D): policy ... not specified today"). Adding
  a table for an unspecified push contract would be speculative schema.
- Future push-reconciliation slice must be serial, additive and covered by a migration test
  (M1-D 12.5); it will also need an explicit decision on what the server should do with events
  acknowledged-but-not-yet-applied vs applied.

## Wire contract (documented, matches implementation)

`GET /api/learner/state` with `Authorization: Bearer <access-token>`.

- `200`:
  ```json
  {
    "schedules": [
      {
        "cardId": "uuid",
        "contentId": "canonical content id",
        "state": "review",
        "stabilityDays": 2,
        "difficulty": 4.9,
        "lapses": 0,
        "dueAt": "2026-07-25T12:00:00.000Z"
      }
    ],
    "plan": {
      "mode": "normal",
      "reviewCardIds": ["uuid"],
      "newCardIds": [],
      "message": "امروز یک قدم کوچک و پیوسته کافی است."
    },
    "reviewEventsCount": 3
  }
  ```
- `400 validation` (non-GET, insecure transport); `401 invalidToken` (missing/malformed/invalid
  Bearer); `503 serverUnavailable` (runtime disabled/incomplete, DB fault) — all with
  `cache-control: no-store`, no cookies.

## Implementation notes and deliberate limits

- `newCards` is always `[]` and `suggestedNewCards` is `0`: new-card intake needs the catalog
  (content factory + pack membership) contract, which is a separate M1-B decision. The plan
  seam is already wired so adding it later is a service-level change only.
- `importance` is fixed to `1` per schedule row (`ponytail` comment in the service): the
  recovery risk score uses it, but `card_schedules` has no importance column and M1-A does not
  define one. Recovery-mode risk ordering is therefore flat until M1-B defines catalog
  importance.
- `reviewEventsCount` is an exact server count, not a pending/acknowledged delta; the client
  reconciles its local pending queue against it.
- No endpoint was invented beyond the documented snapshot; no route, flag, provider, migration,
  mobile/web surface or queue file was changed.

## Tests (TDD: failing first, then implementation)

- `packages/learning-engine/test/exact-acknowledgement.test.ts` — exact-match acknowledgement
  semantics (no loss of unacknowledged events; duplicates/unknown ids acknowledged → nothing
  removed) on the shared seam used by the sync contract (M1-D 12.4).
- `packages/learning-engine/test/reconnect-plan.test.ts` — server plan excludes acknowledged
  events and suspended/archived cards (M1-D 12.3 plan property).
- `apps/api/test/learner-state.service.test.ts` — plan composition from the server schedule
  projection, fixed clock injection, empty-learner fail-closed.
- `apps/api/test/learner-state-http.test.ts` — token/HTTPS/method boundary, exact response
  shape with no-store, typed `serverUnavailable` propagation.
- `apps/website/test/mobile-review-route.test.ts` — added fail-closed runtime assertions for
  `LEARNER_STATE_ENABLED` (mirrors the existing review-route fail-closed contract, M1-D 12.6).

## Check evidence

- `pnpm --filter @learnbox/learning-engine test` — 13 files / 36 tests passed.
- `pnpm --filter @learnbox/api test` — 23 files / 101 tests passed (includes both new suites).
- `pnpm --filter @learnbox/website test` — 24 files / 143 tests passed (after
  `pnpm --filter @learnbox/billing-core build`, a pre-existing workspace dist prerequisite).
- `pnpm --filter @learnbox/api typecheck`, `pnpm --filter @learnbox/learning-engine typecheck`
  — clean.
- `node scripts/validate-migrations.mjs` — 13 migrations validated (contiguous).
- `git diff --check` — clean.

## Next steps (not in this slice)

1. Push-reconciliation contract decision (server ack watermark / client cursor) with migration
   test coverage (M1-D 12.5) — serial, owner-reviewed.
2. M1-B web client moves from `learnbox:review-sync:v1:local-prototype` to this authenticated
   read + the existing review-write protocol; versioned storage keys.
3. New-card catalog candidates for `createDailySessionPlan` once pack membership is defined.
4. Observability names for sync outcomes per `docs/architecture/OBSERVABILITY.md` intent.
