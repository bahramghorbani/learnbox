# LB-DS-078 — targeted approved schedule creation

## Scope

Correct the review write path before exposing server-side new-card intake. The previous batch-level bootstrap created `card_schedules` for every approved/published card when one review batch arrived. Since new schedules are immediately due, the first submission could turn the whole approved catalog into a recovery backlog.

## Implementation

- Removed the batch-wide `bootstrap_approved_card_schedules(user_id)` call from `MobileReviewBatchService`.
- Added `PostgresReviewEventStore.ensureApprovedSchedule(userId, contentId)`.
- The insert is parameterized, learner-scoped, idempotent on `(user_id, card_id)`, and derives the card only through a current `approved`/`published` `card_versions` row.
- The existing-schedule fallback repeats the approval predicate and learner-scoped join.
- Stale and future-skewed submissions are rejected before any schedule write.
- Unknown/draft/rejected content keeps `validation` precedence over device-clock errors.
- Existing learner-scoped events are checked before schedule creation: exact replay returns its
  original cursor, while payload conflict creates no schedule and performs no write.
- No migration, flag, environment, deployment, provider, publication or Production change is included.

## Verification

- RED: focused tests failed because `ensureApprovedSchedule` did not exist and the service still called the all-catalog bootstrap.
- GREEN: focused review store/service tests pass (28/28).
- API typecheck passes.
- API test suite and full workspace checks are recorded from the final tree in the PR checks.
- Independent design review confirmed the all-catalog bootstrap bug and recommended landing this write-path correction before read-side new-card intake.

## Accepted boundary

Schedule selection and event application remain two store calls. A server fault after targeted
schedule creation can leave that one approved learner/card row in `new`; this is bounded to the
explicitly submitted content and is safe to retry. Moving selection plus FSRS calculation into a
single transaction is a separate concurrency-hardening change, not a reason to retain the unsafe
all-catalog bootstrap.

## Deliberate follow-up

Read-side new-card candidates remain a separate S2 item. It must expose both canonical `contentId` and DB `cardId`, use an explicit bounded Start-35 membership contract, and avoid cross-learner anti-join errors. Existing database migration files are not rewritten.
