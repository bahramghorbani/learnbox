# LB-B35 CP4 — additive persistence checkpoint (PLAN, not implemented)

Status: proposed 2026-10-01, awaiting owner review. No code or migration exists yet. Staging only; no
Production change is authorized. CP4 does not activate scheduler v2 and does not ship the binary UI.

## 1. Migration `0023_learning_persistence.sql` (forward-only, additive, nullable)

- `users.timezone TEXT NULL` + `CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64)`. The app,
  not the database, validates it as an IANA name (`normalizeTimeZone`); fixed offsets are rejected.
- `review_events.response TEXT NULL CHECK (response IN ('known','unknown'))`. The `grade` column and its
  four-value CHECK are untouched.
- `review_events.engine_version SMALLINT NULL`. NULL = legacy v1; so the activation point stays visible.
- `learner_daily_plans(user_id uuid FK, local_day date, time_zone text, card_ids uuid[], new_card_ids uuid[],
created_at timestamptz, PRIMARY KEY (user_id, local_day))`.
- `review_event_rejections(id, user_id, client_event_id, reason, received_at)`: observability for rejected
  events. No payload, no PII.
- Grants to `learnbox_app` (SELECT/INSERT/UPDATE on the new tables, no DELETE except account deletion's
  existing path). Admin is not touched. Not dropped, not renamed, not backfilled: existing rows stay as they are.

## 2. Timezone persistence (O2)

Resolution order: stored `users.timezone` → validated request `tz` → UTC. A NULL stored zone is filled once,
from the first valid `tz` seen on an authenticated request; after that only an explicit profile change
updates it. Existing users stay NULL until then, so behaviour is unchanged. Changing the zone changes only
the day projection. No `occurred_at` is ever written. One shared resolver is used by Today, Progress, Words,
Profile and later Admin.

## 3. Review-event compatibility

- Legacy clients keep posting the four grades; the server stores them exactly as today, with `response`
  NULL. The canonical response is `COALESCE(response, HISTORICAL_GRADE_PROJECTION[grade])`, with the SQL
  generated from `definitions.ts`.
- Binary posts (CP5, flag-gated) store `response` and a shadow `grade` (`known` → `remembered`,
  `unknown` → `forgot`), so v1.2.1 readers and Admin still work and a code rollback never sees an invalid value.
  The shadow grade is documented as a compatibility artefact, not a rating the learner chose.
- `review_events` stays append-only: no UPDATE/DELETE path is added.

## 4. Unsynced-review / logout safety

- **Today (verified in code):** sign-out calls `clearDeviceLearnerState`, which removes every `learnbox:*` key
  without flushing, so unsynced answers are lost silently.
- **Plan:** flush before sign-out. If events remain (offline, error), the learner is told how many answers
  are unsent and chooses to stay and retry, or to sign out and discard. Nothing is discarded silently.
  The queue is already scoped per user. A different user signing in on the device never submits it; the
  server's `x-learnbox-review-owner` check is kept as the second barrier.
- The same applies to refresh, tab close, crash, offline→online and session expiry: the queue lives in
  device storage until acknowledged, and after re-login as the same user it drains.

## 5. Corrupt / rejected pending events

- **Today (verified in code):** one malformed item makes `loadSyncQueue` discard the whole queue, valid
  events included, and `validation` / `idempotencyConflict` events retry forever.
- **Plan:** copy the raw string to `learnbox:review-quarantine:v1:<user>` before any reset and keep the
  valid items; parse per item. After N rejected attempts (proposed N=5) an event moves to quarantine with its
  reason, stops retrying, is counted in the UI attention indicator, and is never deleted without an explicit
  learner action. The server records the reason in `review_event_rejections`.

## 6. Server-side daily new-card cap and resume-by-card-ID

- `GET /api/learner/session/today` (flag-gated) creates the day's plan atomically with
  `INSERT … ON CONFLICT DO NOTHING`: 12 TOTAL (due + new), at most 3 new per day (constants in `definitions.ts`), recovery mode above 12
  overdue. The cap is enforced on the server by the frozen plan, not by the client. A second device or a
  refresh receives the same plan.
- Resume = the first card in the plan with no `review_events` row since the plan was created, so card IDs
  replace the device-local `nextCardIndex`. Reviews outside the plan are accepted, but they add no new cards.
- Plan is frozen for the day; cards that become due later appear in the next day's plan.

## 7. Legacy `state`, `difficulty`, `lapses`

CP4 keeps writing all three exactly as today, because the scheduler is unchanged. `state` is already unread by
every learner screen (CP3); it stays as legacy telemetry. D4 removes difficulty/lapses from scheduling at
activation (CP6), when `lapses` stays as history. The stop-writing decision for `state` is made in the CP5/CP6
compatibility step, not now. Nothing is dropped.

## 8. Rollback / flags

Flags, all default off: `LEARNBOX_TZ_PERSIST`, `LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_QUEUE_QUARANTINE`.
(`LEARNBOX_BINARY_REVIEW` arrives in CP5 and `LEARNBOX_SCHEDULER_V2` at CP6.) Every column is nullable and
every table is new, so v1.2.1 runs unchanged on the migrated database. Rollback is turning the flags off;
the schema stays, because migrations are forward-only. The rollback proof is running the v1.2.1 route and
review tests against the migrated schema.

## 9. History-integrity proof

On the restored real dataset: the `review_events` fingerprint (count + md5 over ordered
`id,user_id,card_id,grade,occurred_at,client_event_id`) before and after `0023`; per-table row counts for all
38 original tables unchanged; migration applied twice (idempotent); constraints all validated; the grade
CHECK still rejects `known`/`unknown` in the legacy column.

## 10. Tests and staging gates

Unit: resolver order and fallback, projection, plan freeze, quarantine. DB (Postgres 17): migration idempotence,
v1.2.1 compatibility, plan atomicity under concurrent requests, resume, cap, timezone change not touching
timestamps, grants. UI: logout with pending events, corrupt queue, reload mid-session, offline→online, expired
session. Gates: green CI; throwaway restore of a fresh dump with `0023` applied; evidence report; owner
review. Production application is a separate owner gate, preceded by a fresh pre-migration dump and a
restore check.

## Open for the owner

- Learner-facing wording: RESOLVED by the owner 2026-10-01: «بلد بودم» / «بلد نیستم» (internal values `known` / `unknown`).
- O1 stays an activation gate for scheduler v2 (CP6). The expected learner-visible progression under ENG-CLAMP
  is already characterized (`cp2-progression-invariant.test.ts`: 5 consecutive Known answers can leave a card
  in Box 1). It is reported again with stricter alternatives at the CP6 gate.

## Correction recorded during implementation (2026-10-01)

Earlier wording said "12 due + 3 new". Characterization (`apps/api/test/cp4-session-capacity-characterization.test.ts`)
shows the shipped behaviour is **12 cards in total**, with new cards filling only the spare room and capped at 3. CP4 keeps exactly that: `SESSION_CAPACITY_CARDS = 12` and `DAILY_NEW_CARD_ALLOWANCE = 3` are now canonical
constants in `definitions.ts`, and the session planner reads them instead of local literals. The session
capacity was NOT changed.
