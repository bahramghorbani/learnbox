# LB-B35 CP4 — learning persistence: evidence

Status: implemented on branch `feat/lb-b35-cp4-additive-persistence`, **staging/review gate**. Nothing here
is applied to Production. Every behavioural change is behind a flag that is **off by default**.
Scheduler v2 is not activated and ENG-CLAMP / progression behaviour is unchanged (O1 stays open).

## 1. Checkpoints

| CP  | Change                                                                                                         | Flag                                                               |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 4.0 | Session capacity characterized and frozen in tests before any table logic; final binary wording recorded       | —                                                                  |
| 4.1 | Migration `0023_learning_persistence.sql` (additive, nullable, idempotent)                                     | —                                                                  |
| 4.2 | Persisted learner IANA timezone: stored → device → UTC, written once, never over a stored value                | `LEARNBOX_TZ_PERSIST`                                              |
| 4.3 | Server-owned daily new-card allowance (`learner_daily_plans`)                                                  | `LEARNBOX_SERVER_SESSION_PLAN`                                     |
| 4.4 | Per-item pending-event parsing, bounded rejection quarantine, flush-before-logout choice, server rejection log | `LEARNBOX_QUEUE_QUARANTINE` (+ `NEXT_PUBLIC_` twin for the client) |
| 4.5 | Resume a review session by card identity                                                                       | `NEXT_PUBLIC_LEARNBOX_SERVER_SESSION_PLAN`                         |
| 4.6 | Binary-response compatibility (`known`/`unknown` stored with a shadow grade)                                   | `LEARNBOX_BINARY_REVIEW` (UI arrives in CP5)                       |

## 2. Session capacity (owner clarification)

Characterized before implementing the table. v1.2.1 behaviour, now pinned by tests:

- A session holds **12 cards in total** (due + new). It is **not** "12 due + 3 new". New cards fill only the
  spare room and are at most 3. More than 12 due is recovery mode: 12 reviews, no new cards.
- **Defect found:** the 3-new limit applied _per plan read_. Answering a new card and re-reading granted 3
  more, without bound, so repeated sessions kept introducing new cards.
- **New invariant (flag on):** the server freezes one allowance per learner-local day with
  `INSERT … ON CONFLICT DO NOTHING`; refreshes and other devices receive the same cards; answered new cards are
  not replaced the same day; the next learner-local day grants a fresh 3; recovery mode spends no allowance; the
  day boundary is the learner's (Tehran midnight = 20:30Z).
- **The 12-card capacity was not changed**, so no product decision was needed. Earlier plan text that said
  "12 due + 3 new" was wrong and is corrected in the plan. `SESSION_CAPACITY_CARDS` and
  `DAILY_NEW_CARD_ALLOWANCE` are canonical constants in `definitions.ts`; the planner reads them.

## 3. Migration `0023` and history integrity (restored real dataset)

Real Production dump restored into a throwaway Postgres 17 container; `0023` applied to a copy
(`lbreal_mig`), once by hand and once through the repository's own migration runner (`lbreal_run`).

| Check                                                                                                      | Result                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `review_events` fingerprint (count + md5 over ordered id, user, card, grade, occurred_at, client_event_id) | `76 / a21c019f…` before = after                                                                              |
| `card_schedules` fingerprint                                                                               | `31 / 8783067c…` before = after                                                                              |
| `users` fingerprint (id, name, avatar)                                                                     | `2 / cd33c448…` before = after                                                                               |
| Row counts of the 38 original tables                                                                       | all identical                                                                                                |
| Table count                                                                                                | 38 → 40 (`learner_daily_plans`, `review_event_rejections`), nothing else                                     |
| Second application                                                                                         | no-op (NOTICE "already exists, skipping"); runner `applied: 1` then `applied: 0`                             |
| Manual apply vs runner                                                                                     | identical snapshot, apart from the ledger row                                                                |
| Constraints                                                                                                | 155 / 155 validated                                                                                          |
| New columns on existing rows                                                                               | `response`, `engine_version`, `users.timezone` all NULL; no backfill                                         |
| Legacy grade CHECK                                                                                         | still rejects `known` (`review_events_grade_check`)                                                          |
| New CHECKs                                                                                                 | `response` rejects junk; timezone limited to 1–64 chars (shape only; IANA validity is the application's job) |
| Real history, projected to the binary response                                                             | known = 57, unknown = 19 (legacy grades: forgot 19, hard 6, remembered 25, mastered 26)                      |
| Ledger                                                                                                     | `0022` → `0023_learning_persistence`, 23 rows                                                                |

`occurred_at` is never written by any CP4 path, and `review_events` gained no UPDATE/DELETE path.

## 4. Rollback guarantee

With every flag off the write path is the v1.2.1 SQL statement (the `response` column is named only for a
binary answer), proven by a test that runs it on a database **without** `0023`. Legacy four-grade requests
keep the exact v1.2.1 wire format: `response` is rejected unless the binary flag is on. Rollback is turning
flags off; the schema stays. The migration is forward-only and nothing is dropped.

## 5. Pending-event safety

- **Logout (flag on):** flush first; if answers remain unsent the session is **not** ended and the learner
  chooses to retry, stay, or sign out and discard. A flush that throws is treated as unsent, never as zero.
  Revocation failure after a clean flush still keeps the learner signed in.
- **Corrupt queue:** parsed per item; valid events are kept; the raw bad item or whole raw string is copied to
  `learnbox:review-quarantine:v1:…` _before_ any reset. If the quarantine write fails the original is untouched.
- **Rejected events:** `validation` / `idempotencyConflict` retry up to 5 times, then move to quarantine with
  the payload intact; `clockSkew`, offline and 401 are never quarantined. Quarantine leaves the device only
  through an explicit discard. The server records a bounded reason code (no payload) in
  `review_event_rejections`, best-effort so it can never fail a review request.
- **Flag off** keeps the CP0 pins: whole-queue reset and unbounded retry (defects retained deliberately).

## 6. Compatibility of legacy columns

`state`, `difficulty` and `lapses` are still written exactly as today because the scheduler is unchanged.
`state` is read by no learner screen. Nothing is dropped. Stop-writing `state` is deferred to the CP5/CP6
compatibility step.

## 7. Canonical-domain consistency

New constants and functions live in `packages/learning-engine/src/definitions.ts` and are imported by the API,
the website and the tests: `SESSION_CAPACITY_CARDS`, `DAILY_NEW_CARD_ALLOWANCE`, `resolveLearnerTimeZone`,
`BINARY_SHADOW_GRADE` / `shadowGradeFor`, and `resolveResumeIndex`. The CP2 no-redefinition guard still has a
zero allowlist.

## 8. Not done / still open

- **CP5 items are not started:** binary review buttons, onboarding-goal removal, session-expiry UI.
- **R8** (systemd timer fires) is still open; check `ExecMainStartTimestamp` after 2026-10-05 03:36 UTC.
- **Production `0023`** requires a fresh pre-migration dump and a restore check taken just before it.
- **O1** (visible progression under ENG-CLAMP) stays an activation gate for scheduler v2.
- Neither flag set nor `0023` has been exercised on staging yet; that is the next gate.
