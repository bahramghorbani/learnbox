# Functional Validation — Test-User Learning-State Reset (owner decision, 2026-10-03)

**Status:** DECISION RECORDED — **NOT EXECUTED**. No Production data has been modified.
**Scope:** does not expand the checkpoint. Objective remains: make the existing application work
correctly → prove it on the owner's real device → fix blocking defects → owner acceptance → STOP.

## 1. The decision

Before the owner's final real-device acceptance test, reset the learning state of both existing test
users so they behave like fresh learners.

- **Do NOT delete** the user accounts or their authentication identities.
- Reset only historical learner/application state that could affect a clean test.
- Execute the Production reset **only immediately before real-device acceptance testing**, and
  **only after explicit owner approval**.
- **Do not create synthetic historical learning data.** Fresh means absent, not fabricated.
- After reset, verify from the database **and** the API that both accounts hold zero historical
  learning state and behave as fresh learners.
- **Account A** runs the complete fresh-user functional test. **Account B** is retained for
  account-isolation / cross-user verification.

## 2. The two test users (inspected live, 2026-10-03)

`users` holds **exactly 2 rows**. No other user data exists, so no third party can be affected.

| Role                        | `users.id`                             | Created    | Identity                               | Learner state today                        |
| --------------------------- | -------------------------------------- | ---------- | -------------------------------------- | ------------------------------------------ |
| **B — control / isolation** | `451b0433-7204-44e9-957f-250cac59e28e` | 2026-09-07 | بهرام (`+98938***03`)                  | 58 events, 16 schedules, 0 plans, 1 cursor |
| **A — fresh-user test**     | `b4efb0a4-d829-4f33-b686-0f498fbef62c` | 2026-09-24 | Mona (`+98935***21`), tz `Asia/Tehran` | 39 events, 15 schedules, 1 plan, 1 cursor  |

Totals reconcile exactly: 58+39 = **97 `review_events`**, 16+15 = **31 `card_schedules`** — every
learner row in Production belongs to these two accounts.

Event history spans 2026-09-24 → 2026-10-02; the one daily plan is for local day 2026-10-03. This is
stale previous-test state, which is precisely what makes a clean test impossible without a reset.

## 3. Schema inspected — no table names assumed

Every table carrying a `user_id` column was enumerated from the live catalog. The learner-state
surface is 13 tables; only 6 hold learner history, and 4 of those are already empty.

**RESET (learner/application history):**

| Table                            | Rows | Reset action                          | Owner-stated category              |
| -------------------------------- | ---- | ------------------------------------- | ---------------------------------- |
| `review_events`                  | 97   | delete both users' rows               | review history/events              |
| `card_schedules`                 | 31   | delete both users' rows               | card schedules + Box state         |
| `learner_daily_plans`            | 1    | delete both users' rows               | daily plans/workload               |
| `learner_reconciliation_cursors` | 2    | delete both users' rows               | derived learning/progress state    |
| `review_event_rejections`        | 0    | delete if non-empty at execution time | stale rejected/queued review state |
| `mobile_learner_sessions`        | 0    | delete if non-empty at execution time | derived client learning state      |

`card_schedules.state` is enum `learning_state` (`new,learning,review,relearning,mastered,suspended,
archived`). Current distribution is **B**: 15 `review` + 1 `relearning`; **A**: 12 `review` +
3 `relearning`. A fresh learner has **no schedule rows at all** — the server bootstraps them on first
use, so deletion (not rewriting to `new`) is the correct fresh state and avoids fabricating history.

**RETAIN (accounts, auth, catalog):**

- `users` — both rows, untouched. Identity lives here: `id`, `phone_e164`, names, `date_of_birth`,
  `gender`, `avatar_id`, `timezone`.
- Login path: `otp_challenges` (37), `otp_request_events` (37), `invite_codes` (3),
  `invite_consents` (1). OTP login must keep working unchanged.
- `revoked_sessions` (7) — **retain**. Auth-adjacent, not learning state; clearing it could
  resurrect a deliberately revoked session. `user_session_cutoffs` is empty.
- Catalog/content: `cards` (35), `card_versions` (35), `packs` (1), `pack_cards` (35),
  `content_review_checks` (210), `content_review_decisions` (35). Not learner state.
- `account_deletion_events` (1) — audit record, retain.
- Admin/billing tables — out of scope and untouched.

**Dependency facts that constrain execution:**

- `review_events → users` is `ON DELETE **a**` (NO ACTION) and `review_events → cards` likewise:
  deleting learner rows can never cascade into an account or the catalog. Safe by construction.
- `card_schedules`, `learner_daily_plans`, `learner_reconciliation_cursors`,
  `mobile_learner_sessions`, `review_event_rejections` are all `ON DELETE **c**` (CASCADE) **from
  `users`** — i.e. they would vanish if an account were deleted. The account is NOT deleted, so this
  path stays dormant; it does confirm these tables are per-user derived state.
- **No FKs exist between the reset targets**, so no delete ordering is required.
- **No non-internal triggers** exist on any reset target: deletes have no side effects.
- `review_events` has unique `(user_id, client_event_id)`. Clearing it fully restores idempotency for
  replayed client events — relevant because the device test will submit new events.

## 4. Pre-execution requirements (all mandatory, none yet performed)

1. **Verified recoverable backup.** See blocker **FV-1** — the method must be a verified logical
   export, not `pg_dump`.
2. **Exact user identification** — done, §2, by live query rather than assumption.
3. **No other users affected** — proven: `users` has exactly 2 rows and all 97/31 learner rows map to
   them. The reset predicate stays explicitly scoped to these two UUIDs regardless.
4. **Record what is reset vs retained** — this document, §3.
5. **Owner approval, immediately before the device test.**

## 5. Blockers found during inspection (must be resolved before execution)

**FV-1 — `pg_dump` is impossible with available credentials.** Production is **Neon managed**; all 40
tables are owned by `neondb_owner`, and the only superuser is Neon's `cloud_admin`. Neither
`learnbox_app` nor `learnbox_migrator` can `LOCK TABLE` every table, so `pg_dump` fails
(`permission denied for table schema_migrations` as app; `learner_daily_plans` as migrator).

_Resolution:_ back up with a **verified per-table logical export** (`COPY … TO STDOUT WITH CSV
HEADER`), which is proven working for the reset scope, plus a per-table `md5` fingerprint so the
backup is verifiable rather than merely present. Baseline fingerprints captured at inspection time:

- `review_events` md5 `224271dab95a5a8e8930a489fee1c343` (97 rows)
- `card_schedules` md5 `d463197fff9486c77719876188b7e296` (31 rows)

Re-capture immediately before the reset (the device test may add rows), verify the export
round-trips, and keep it until the owner accepts. A Neon branch/PITR snapshot taken from the Neon
console by the owner is the stronger option and is preferred if available.

**FV-2 — the application role cannot complete the reset.** `learnbox_app` has **no DELETE** on
`learner_daily_plans`, `review_event_rejections` or `user_session_cutoffs`. `learnbox_migrator` has
DELETE on `review_events`, `card_schedules`, `learner_reconciliation_cursors`,
`mobile_learner_sessions` and `users`, but **no grants at all** on `learner_daily_plans` or
`review_event_rejections`.

_Consequence:_ with today's credentials the plan row for account A **cannot be deleted**, so account
A would not be a true fresh learner. Resolve before execution by either (a) the owner running the
reset as `neondb_owner` from the Neon console, or (b) granting DELETE on those two tables to
`learnbox_migrator` as an explicit, recorded, owner-approved privilege change. Option (a) is
preferred: it needs no privilege change to a production role.

This mirrors the already-recorded CP9 deferral **P1** (migrator lacks `ALTER`) — the role split is
intentionally narrow, and reset is simply not a capability it was granted.

### Owner resolutions (recorded 2026-10-03, after the decision was merged)

**FV-1 resolved — recovery mechanism.** The preferred pre-reset recovery point is an
**owner-created Neon snapshot/branch**. A verified logical `COPY` export with md5 fingerprints may
**additionally** be retained as secondary evidence, but it **does not replace** the Neon recovery
point. The reset must not proceed unless the Neon recovery point exists and the owner confirms it.

**FV-2 resolved — execution identity.** The eventual scoped reset is executed as **`neondb_owner`
through the Neon administrative surface**, rather than broadening `learnbox_app` or
`learnbox_migrator` Production privileges merely to perform the validation reset. No Production
role or grant change is authorized.

**FV-3 opened — role assignment ambiguity, blocks execution.** The owner's role assignment names
Bahram as the _untouched_/isolation control, while §1 above states both users are reset. This
changes the delete scope by 58 events / 16 schedules. Resolved at the runbook review gate; see
`LEARNER_STATE_RESET_RUNBOOK.md` §FV-3.

Execution steps are prepared in `LEARNER_STATE_RESET_RUNBOOK.md` (prepared, **not executed**).

## 6. Post-reset verification (required before the device test begins)

Database, for **both** accounts:

- `review_events`, `card_schedules`, `learner_daily_plans`, `learner_reconciliation_cursors`,
  `review_event_rejections`, `mobile_learner_sessions` → **0 rows** for both UUIDs.
- `users` → still exactly 2 rows, `phone_e164`/identity unchanged (compare against §2).
- Catalog counts unchanged: `cards` 35, `card_versions` 35, `pack_cards` 35.

API/behaviour:

- Both accounts complete a real OTP login — proves auth identity survived.
- The learner-state read returns a fresh-learner shape (no progress, no due reviews from history),
  with figures derived from an empty history rather than from fabricated rows.
- Account B is then used to prove **account isolation**: work performed on A must not appear on B.

## 7. What this decision does not authorize

No Production deployment, no image or artifact change, no Production configuration or feature-flag
change, no `LEARNBOX_BINARY_REVIEW_CREATION` change, no Scheduler V2 activation, no Native build
distribution, no account or auth deletion. Production remains on digest `sha256:cb3090da…`,
`APP_SOURCE_SHA=d4ea6558…`, `LEARNBOX_BINARY_REVIEW=true`,
`LEARNBOX_BINARY_REVIEW_CREATION` absent, Scheduler V2 absent.

Inspection for this record was **read-only**: catalog queries, counts and fingerprints only. The
probe scripts performed no `INSERT`, `UPDATE`, `DELETE` or DDL.
