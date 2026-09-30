# LB-B35 CP0 — learning-system characterization (evidence)

**Status:** CP0 complete. Behavior of `v1.2.1` / `main` is pinned by tests; **no product code, scheduler, schema or Production state was changed.** CP1 has not started and requires owner approval.

**Milestone:** LB-B35 Learning system unification (owner decision 2026-10-01: binary «بلد بودم» / «بلد نبودم»; Learned = Box 4+, Mastered = Box 5; remove the onboarding-goal step; scheduler policy undecided).

## How to reproduce

```
pnpm --filter @learnbox/learning-engine exec vitest run test/cp0-scheduler-characterization.test.ts
TEST_DATABASE_URL=postgres://…/empty_db pnpm --filter @learnbox/website exec vitest run test/cp0-*.test.ts test/cp0-*.test.tsx
```

DB-backed suites create and drop their own database, apply every migration in `database/migrations`, and drive the **real** review write path (`MobileReviewBatchService` + Postgres store) and the **real** route handlers. They skip without `TEST_DATABASE_URL` (CI provides it).

Convention: a test named `DEFECT` asserts the **current, defective** behavior and passes today. The checkpoint that fixes the defect must flip that assertion in the same change. A test named `FINDING` records a new fact.

## Files

| File                                                                   | Scope                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/learning-engine/test/cp0-scheduler-characterization.test.ts` | pure scheduler, Box display, session planner                                              |
| `apps/website/test/cp0-learning-db-characterization.test.ts`           | learned/mastered, accuracy, day/streak, queue, ingest, Admin reads (real DB)              |
| `apps/website/test/cp0-pending-review-safety.test.tsx`                 | real `LearnerHome`, server-otp mode, sign-out with unsynced answers                       |
| `apps/website/test/cp0-pending-review-durability.test.ts`              | offline→online, 401 expiry, refresh, corrupt queue, rejected event, partial ack           |
| `apps/website/test/cp0-session-resume.test.tsx`                        | resume by index                                                                           |
| `apps/website/test/cp0-onboarding-goal.test.tsx`                       | onboarding goal is device-local                                                           |
| `apps/website/test/support/review-events-fingerprint.ts`               | order-independent `review_events` fingerprint — the "history unchanged" proof for CP2–CP5 |

## Pinned behavior

**Scheduler.** `newStability = max(10 min, stability × {0.35, 0.8, 1.8, 3.0})`; the next due time is the client answer time plus stability. On-time "remembered" answers from a new card reach Box 2 at answer 6, Box 3 at 8, Box 4 at 9, Box 5 at 11. Always-forgot sits on the 10-minute floor. Always-mastered has no ceiling (8 answers ≈ 9 months). `forgot` moves a card down only one Box from Boxes 3–5 (5 d→2, 15 d→3, 40 d→4). One answer from Box 3: forgot→Box 2, hard→3, remembered→4, mastered→4.

**Defects reproduced**

1. **Difficulty and lapses are dead data.** They are stored and updated, but nothing reads them: two cards identical except difficulty 1/lapses 0 vs difficulty 10/lapses 9 get the same next interval for every grade.
2. **Lateness is ignored.** A review 30 days late earns the same interval as an on-time one.
3. **State `mastered` is unreachable without the "mastered" answer.** A card climbs to Box 5 on "remembered" alone and never becomes `mastered`. The binary model removes that answer entirely.
4. **Four definitions of "learned"** on the same learner: Words (Box ≥ 4), Progress ring (`state='mastered'`), pack progress (`review`+`mastered`), `/profile/stats` (`review` only). The Progress ring denominator is scheduled cards, not the pack.
5. **Accuracy** counts only `remembered` as correct; `mastered` and `hard` count as wrong (a mastered-only learner sees 0%).
6. **Day bucketing:** Today and the streak summary use the learner timezone; Progress uses `date_trunc('day', now())` with no timezone. The same events fall on different days. An unknown or oversized timezone silently degrades to UTC.
7. **No per-user-day new-card cap.** Every plan request with spare capacity grants up to 3 new cards again (8 new cards in one day across three sessions in the test).
8. **New-card selection is arbitrary.** Equal-importance candidates (importance is a constant `1`) are ordered by card UUID, from a pool that is the first 12 `start-a1-*` content ids; pack `sort_order` is never read.
9. **Two definitions of "new" / "due":** `/today` counts every published unscheduled card while the planner offers at most 3 from `start-a1-*`; `/today` `dueCount` includes suspended schedules the planner excludes. `suspended`/`archived` are never written by any production path.
10. **Out-of-order answers** are applied on top of the newest schedule, so `due_at` can move earlier.
11. **Resume by index:** the stored record is `{ "nextCardIndex": N }` only. The same index lands on a different card when the queue is rebuilt in another order, and an index beyond a shorter queue is discarded.
12. **Sign-out wipes unsynced answers.** Confirming sign-out removes every `learnbox:` device key, including the review queue; no flush is attempted and the confirmation shows no warning. The wipe also removes **other accounts'** queues on a shared device. (The wipe only runs after the server confirms the logout.)
13. **Durability gaps:** a single corrupt entry makes `loadSyncQueue` delete the whole queue (no quarantine); a server-rejected (`validation`) event is retried forever, never surfaced or resolved.

**Behaviors confirmed safe (must not regress):** an answer is written to the durable queue before any network call; offline→online drains only acknowledged events; a 401 keeps every answer and backs off; partial acknowledgement removes exactly the acknowledged events; the queue key is per account; `clientEventId` replay is idempotent and a conflicting grade is an idempotency conflict; ingest rejects answers older than 90 days or more than 5 minutes in the future; the API and the DB `CHECK` accept only the four legacy grades.

**Onboarding goal:** choosing life/career/travel writes only a device `localStorage` key; no request carries it and no migration defines a column for it. Nothing to migrate when the step is removed.

## Corrections to earlier analysis (recorded, not hidden)

- The "`0.85^lapses` compounding penalty" stated in earlier summaries **does not exist** in `scheduleReview`. The real defect is that lapses have **no** effect (defect 1). The "cap the lapse penalty" item is withdrawn.
- "Admin has no learning logic" was incomplete — see finding below.
- Earlier quoted "9 answers to Box 4 / 11 to Box 5" is confirmed for Box 4 = answer 9 and Box 5 = answer 11 (Box 2 = 6, Box 3 = 8).

## New finding — Admin user detail cannot work against the real schema

`apps/admin/app/api/users/[userId]/route.ts` selects `review_events.created_at` and `review_events.rating`; the table has `occurred_at` and `grade` and neither of those columns. Both queries fail against the real schema (proved by the `FINDING` test). The route is behind `legacyAdminRouteGate()` and Admin is contained, so there is no user impact today. The Admin user list queries only raw counts and `last_activity`. Admin source contains **no** learning rules (no engine import, no mastery/streak/box logic) — the LB-B34 boundary is currently absent, not duplicated — but it also has one query that is already wrong.

## Data-preservation harness

`reviewEventsFingerprint(pool, userId)` hashes every answer-defining column of a learner's `review_events`, order-independently. It is stable across reads of every learner route, and changes only when an event is appended. Later checkpoints that must not touch history (CP2–CP5) assert the fingerprint before and after.

## Verification

Lint, format, typecheck and `pnpm test` pass with the DB suites enabled and skipped. Numbers are in the PR. Production, the scheduler, schema and the learner UI are untouched.
