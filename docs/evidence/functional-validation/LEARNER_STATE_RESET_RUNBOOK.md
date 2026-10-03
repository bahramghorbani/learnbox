# Functional Validation — Learner-State Reset RUNBOOK (PREPARED, NOT EXECUTED)

**Status:** PREPARED FOR OWNER REVIEW. **Nothing in this document has been executed.**
No Production write, no role/grant change, no flag/config change, no reset has occurred.

Prepared against Production state verified read-only on 2026-10-03 (see §2 baseline).
Canonical main at preparation: `cfb894188c5ac75bf1183b7809fb51347a17e3da`.
Decision record: `docs/evidence/functional-validation/TEST_USER_LEARNING_STATE_RESET_DECISION.md`.

---

## 0. Owner decisions recorded

**FV-1 — Recovery mechanism.** The preferred pre-reset recovery point is an **owner-created Neon
snapshot/branch**, taken from the Neon administrative surface immediately before the reset. A
verified logical `COPY` export with md5 fingerprints **may additionally be retained as secondary
evidence**, but it **does not replace** the Neon recovery point. The reset must not proceed unless
the Neon recovery point exists and the owner has confirmed it.

**FV-2 — Execution identity.** The scoped reset is executed as **`neondb_owner` through the Neon
administrative surface**. Production privileges of `learnbox_app` and `learnbox_migrator` are
**not** broadened to perform this validation reset. The FV-2 blocker is therefore resolved by
execution identity, not by a grant change.

---

## FV-3 — OPEN DECISION, BLOCKS EXECUTION

The owner instruction for role assignment reads _"Mona as fresh-user test account A and Bahram as
**untouched**/isolation control B"_. The merged decision record states _"reset the learning state of
**both** existing test users"_. These differ on whether Bahram's history is deleted. This changes
the reset scope by 58 events / 16 schedules and must be settled before execution.

|                   | **Variant 1 — reset A only** (literal reading of the latest instruction) | **Variant 2 — reset both** (merged decision record) |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Mona `b4efb0a4`   | reset to zero                                                            | reset to zero                                       |
| Bahram `451b0433` | **untouched** — keeps 58 events, 16 schedules, 1 cursor                  | reset to zero                                       |
| Isolation proof   | B's non-trivial fingerprints must stay **byte-identical** after A's test | B must stay at **0** while A accumulates            |
| Deleted rows      | 40                                                                       | 97+                                                 |

Both are defensible. Variant 1 is the smaller, more reversible change and gives a stronger isolation
signal (any cross-user leak perturbs a non-trivial md5 rather than moving a count off zero).
Variant 2 matches the already-merged decision text and makes B available as a second fresh learner.

**Recommendation: Variant 1** — it is the literal latest instruction and deletes less. §4 is written
so the owner selects the variant by choosing which `user_id` list to apply; no other step changes.

---

## 1. The six learner-state tables

Enumerated from the live catalog by `user_id` column — not assumed.

| #   | Table                            | Category                           |
| --- | -------------------------------- | ---------------------------------- |
| 1   | `review_events`                  | review history/events              |
| 2   | `card_schedules`                 | card schedules + Box state         |
| 3   | `learner_daily_plans`            | daily plans/workload               |
| 4   | `learner_reconciliation_cursors` | derived learning/progress state    |
| 5   | `review_event_rejections`        | stale rejected/queued review state |
| 6   | `mobile_learner_sessions`        | derived client learning state      |

Facts that make the delete safe, verified from `pg_constraint` / `pg_trigger`:

- `review_events → users` is `ON DELETE NO ACTION`, as is `review_events → cards`. Deleting learner
  rows **cannot** cascade into an account or the catalog.
- Tables 2–6 are `ON DELETE CASCADE` **from `users`** — dormant here because no account is deleted;
  it confirms they are per-user derived state.
- **No FKs exist between the six tables** → no delete ordering constraint.
- **No non-internal triggers** on any of the six → deletes have no side effects.
- `review_events` has unique `(user_id, client_event_id)`; clearing it restores replay idempotency
  for the device test's new events.

---

## 2. Exact rows expected before deletion

Verified 2026-10-03, immediately before preparing this runbook.

| Table                            | Bahram `451b0433` | Mona `b4efb0a4` | Total  |
| -------------------------------- | ----------------- | --------------- | ------ |
| `review_events`                  | 58                | 39              | **97** |
| `card_schedules`                 | 16                | 15              | **31** |
| `learner_daily_plans`            | 0                 | 1               | **1**  |
| `learner_reconciliation_cursors` | 1                 | 1               | **2**  |
| `review_event_rejections`        | 0                 | 0               | **0**  |
| `mobile_learner_sessions`        | 0                 | 0               | **0**  |

Integrity fingerprints at baseline:

- `review_events` md5 `224271dab95a5a8e8930a489fee1c343` (97 rows)
- `card_schedules` md5 `d463197fff9486c77719876188b7e296` (31 rows)

`card_schedules.state` distribution (enum `learning_state`): Bahram 15 `review` + 1 `relearning`;
Mona 12 `review` + 3 `relearning`. A fresh learner has **no** `card_schedules` rows — the server
bootstraps them on first use — so deletion is the correct fresh state and no synthetic history is
created.

**These counts must be re-verified at execution time**, since the owner may use the app between now
and then. The preconditions in §3 fail closed if they have drifted.

---

## 3. Preconditions (all must hold; abort if any fails)

1. Owner has given explicit approval to execute, **immediately before** the real-device test.
2. **FV-3 resolved** — owner has selected Variant 1 or Variant 2.
3. **Neon recovery point created by the owner and confirmed** (FV-1). Record its identifier here at
   execution time: `__________`.
4. Connected as **`neondb_owner`** via the Neon administrative surface (FV-2).
   Verify: `SELECT current_user;` → `neondb_owner`.
5. `users` contains **exactly 2 rows**, and both target UUIDs are present.
6. Pre-delete counts match §2, or any drift is explained and re-recorded by the owner.
7. No in-flight device test session is writing (the reset precedes the test).
8. `cards=35`, `card_versions=35`, `pack_cards=35` — catalog intact before starting.
9. Optional secondary evidence (FV-1): `COPY` export of the six tables + md5 captured.

---

## 4. The reset — transaction boundaries

**DO NOT RUN. This is the reviewed text for owner approval only.**

Single transaction, scoped by explicit UUID list, with in-transaction verification before `COMMIT`.
The `user_id` list is the only thing that changes between FV-3 variants:

- **Variant 1 (recommended):** `('b4efb0a4-d829-4f33-b686-0f498fbef62c')`
- **Variant 2:** `('b4efb0a4-d829-4f33-b686-0f498fbef62c','451b0433-7204-44e9-957f-250cac59e28e')`

```sql
-- NOT EXECUTED DURING PREPARATION. Run only after §3 preconditions pass.
BEGIN;

-- Fail closed if the target set is not exactly what was reviewed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users;
  IF n <> 2 THEN RAISE EXCEPTION 'ABORT: users=% (expected 2)', n; END IF;
  SELECT count(*) INTO n FROM users
   WHERE id = ANY (:'targets'::uuid[]);
  IF n <> array_length(:'targets'::uuid[], 1)
    THEN RAISE EXCEPTION 'ABORT: target uuid(s) not found'; END IF;
END $$;

-- No FKs between these tables, so order is irrelevant; listed as in §1.
DELETE FROM review_events                  WHERE user_id = ANY (:'targets'::uuid[]);
DELETE FROM card_schedules                 WHERE user_id = ANY (:'targets'::uuid[]);
DELETE FROM learner_daily_plans            WHERE user_id = ANY (:'targets'::uuid[]);
DELETE FROM learner_reconciliation_cursors WHERE user_id = ANY (:'targets'::uuid[]);
DELETE FROM review_event_rejections        WHERE user_id = ANY (:'targets'::uuid[]);
DELETE FROM mobile_learner_sessions        WHERE user_id = ANY (:'targets'::uuid[]);

-- In-transaction assertions: accounts, auth surface and catalog must be intact.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM users;
  IF n <> 2 THEN RAISE EXCEPTION 'ABORT: users=% after delete', n; END IF;
  SELECT count(*) INTO n FROM cards;
  IF n <> 35 THEN RAISE EXCEPTION 'ABORT: cards=% (expected 35)', n; END IF;
  SELECT count(*) INTO n FROM revoked_sessions;
  IF n <> 7 THEN RAISE EXCEPTION 'ABORT: revoked_sessions=% (expected 7)', n; END IF;
  SELECT count(*) INTO n FROM review_events WHERE user_id = ANY (:'targets'::uuid[]);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORT: residual review_events=%', n; END IF;
END $$;

-- Review the RAISE output and row counts, then finish with exactly one of:
COMMIT;
-- ROLLBACK;
```

Boundary rules: one transaction, no DDL, no `TRUNCATE` (bypasses per-user scoping), no
`DELETE … CASCADE`, no statement without an explicit `user_id` predicate. If any assertion raises,
the transaction aborts and **no rows are deleted**.

---

## 5. Explicitly retained — must NOT be touched

| Retained                                 | Rows           | Why                                                                                                 |
| ---------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `users`                                  | 2              | accounts + identity (`id`, `phone_e164`, names, `date_of_birth`, `gender`, `avatar_id`, `timezone`) |
| `otp_challenges`                         | 37             | OTP login path                                                                                      |
| `otp_request_events`                     | 37             | OTP login path                                                                                      |
| `invite_codes`                           | 3              | access/eligibility                                                                                  |
| `invite_consents`                        | 1              | consent record                                                                                      |
| `revoked_sessions`                       | 7 (all Mona's) | auth-adjacent; clearing could resurrect a deliberately revoked session                              |
| `user_session_cutoffs`                   | 0              | auth-adjacent; empty, still out of scope                                                            |
| `cards` / `card_versions`                | 35 / 35        | content catalog                                                                                     |
| `packs` / `pack_cards`                   | 1 / 35         | content catalog                                                                                     |
| `content_review_checks` / `_decisions`   | 210 / 35       | content QA evidence                                                                                 |
| `user_packs`                             | 0              | entitlement, not learning history                                                                   |
| `account_deletion_events`                | 1              | audit record                                                                                        |
| admin / billing / splash / banner tables | —              | out of scope                                                                                        |

No `UPDATE` is performed on any retained table. The reset is delete-only, within the six tables.

---

## 6. Post-reset expected counts

**Variant 1 (reset Mona only):**

| Table                            | Bahram         | Mona  | Total |
| -------------------------------- | -------------- | ----- | ----- |
| `review_events`                  | 58 (unchanged) | **0** | 58    |
| `card_schedules`                 | 16 (unchanged) | **0** | 16    |
| `learner_daily_plans`            | 0              | **0** | 0     |
| `learner_reconciliation_cursors` | 1 (unchanged)  | **0** | 1     |
| `review_event_rejections`        | 0              | **0** | 0     |
| `mobile_learner_sessions`        | 0              | **0** | 0     |

**Variant 2 (reset both):** every cell above becomes **0**; all six totals are 0.

Unchanged in both variants: `users` 2, `cards` 35, `card_versions` 35, `pack_cards` 35,
`revoked_sessions` 7, `otp_challenges` 37, `invite_codes` 3.

---

## 7. Rollback / recovery

**Primary (FV-1) — Neon recovery point.** If the reset is wrong, incomplete, or the device test is
abandoned, restore from the owner-created Neon snapshot/branch via the Neon administrative surface.
That recovery point is authoritative; it captures the full database, not just the six tables.
Restoring is an owner action — record the restore identifier and re-verify §2 counts afterwards.

**Secondary (evidence only).** If a `COPY` export with md5 fingerprints was retained, it can
reconstruct the six tables' rows and independently prove what was deleted. It is **not** the
recovery mechanism: it omits sequence/visibility state and depends on write privileges the agent
roles do not have for two of the six tables.

**Recovery is unnecessary in the abort path.** Any failed assertion in §4 aborts the transaction
before `COMMIT`, leaving zero rows deleted.

---

## 8. Proof that Mona and Bahram remain usable

Database:

```sql
SELECT id, phone_e164, first_name, timezone, created_at FROM users ORDER BY created_at;
-- Expect exactly 2 rows, values identical to the §2 baseline (phone/identity unchanged).
SELECT count(*) FROM otp_challenges;   -- 37, unchanged
SELECT count(*) FROM invite_codes;     -- 3, unchanged
SELECT count(*) FROM revoked_sessions; -- 7, unchanged
```

Behavioural (required, DB counts alone are not proof of usability):

1. Both accounts complete a **real OTP login** on the device — proves the auth identity survived.
2. The learner read path returns a fresh-learner shape for A: no progress, no history-derived due
   reviews, figures derived from an empty history rather than fabricated rows.
3. No 5xx on the learner endpoints for either account.

---

## 9. Proof the 35-card catalog is untouched

```sql
SELECT 'cards='||(SELECT count(*) FROM cards)
    ||' card_versions='||(SELECT count(*) FROM card_versions)
    ||' packs='||(SELECT count(*) FROM packs)
    ||' pack_cards='||(SELECT count(*) FROM pack_cards)
    ||' content_review_checks='||(SELECT count(*) FROM content_review_checks)
    ||' content_review_decisions='||(SELECT count(*) FROM content_review_decisions);
-- Expect: cards=35 card_versions=35 packs=1 pack_cards=35
--         content_review_checks=210 content_review_decisions=35
```

Stronger check — capture this md5 **before** the reset and compare after; it must be identical:

```sql
SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM cards t;
```

---

## 10. Proof `revoked_sessions` is untouched

All 7 rows belong to Mona, so this is the one retained table the reset could plausibly disturb.
Capture before, compare after — count **and** fingerprint:

```sql
SELECT 'revoked_sessions='||count(*) FROM revoked_sessions;              -- expect 7
SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) FROM revoked_sessions t;
SELECT count(*) FROM revoked_sessions
 WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';                 -- expect 7
SELECT count(*) FROM user_session_cutoffs;                               -- expect 0
```

---

## 11. Queries proving no learner state exists after reset

Single query, returns one row per table; every `remaining` must be `0` for the reset targets:

```sql
WITH targets AS (SELECT unnest(:'targets'::uuid[]) AS id)
SELECT 'review_events' AS tbl, count(*) AS remaining
  FROM review_events WHERE user_id IN (SELECT id FROM targets)
UNION ALL SELECT 'card_schedules',
  (SELECT count(*) FROM card_schedules WHERE user_id IN (SELECT id FROM targets))
UNION ALL SELECT 'learner_daily_plans',
  (SELECT count(*) FROM learner_daily_plans WHERE user_id IN (SELECT id FROM targets))
UNION ALL SELECT 'learner_reconciliation_cursors',
  (SELECT count(*) FROM learner_reconciliation_cursors WHERE user_id IN (SELECT id FROM targets))
UNION ALL SELECT 'review_event_rejections',
  (SELECT count(*) FROM review_event_rejections WHERE user_id IN (SELECT id FROM targets))
UNION ALL SELECT 'mobile_learner_sessions',
  (SELECT count(*) FROM mobile_learner_sessions WHERE user_id IN (SELECT id FROM targets));
```

Also assert nothing leaked outside the target set — this catches an over-broad delete:

```sql
SELECT 'orphan_events='||count(*) FROM review_events
 WHERE user_id NOT IN (SELECT id FROM users);      -- expect 0
SELECT 'nontarget_events='||count(*) FROM review_events
 WHERE user_id <> ALL (:'targets'::uuid[]);        -- Variant 1: expect 58 (Bahram). Variant 2: 0
```

API-side confirmation (not DB-only): the learner state endpoint for account A must report a
fresh learner. Run it with a genuine authenticated session on the current deployment.

---

## 12. Assigning A and B

**Account A — fresh-user functional test:** Mona `b4efb0a4-d829-4f33-b686-0f498fbef62c`
(tz `Asia/Tehran`). Reset in both variants. Used for the complete fresh-user walkthrough:
first login → first session → reviews → Box/schedule progression → daily plan.

**Account B — isolation / cross-user control:** Bahram `451b0433-7204-44e9-957f-250cac59e28e`.

Assignment procedure (no schema or data change — the roles are a test convention, not a DB field):

1. Record both UUIDs and their post-reset counts in the acceptance-test log before the test starts.
2. Capture B's baseline fingerprints at that moment:
   `SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) FROM review_events t WHERE user_id='451b0433-…';`
   and the same for `card_schedules`.
3. Run the entire fresh-user test on **A only**. Do not log into B during A's test.
4. After A's test, re-capture B's fingerprints and counts:
   - **Variant 1:** must be **byte-identical** to step 2 (58 events, 16 schedules, 1 cursor).
   - **Variant 2:** must still be **0** across all six tables.
     Any change is a cross-user isolation defect and a blocking finding.
5. Then log into B and confirm it sees **only** its own state and none of A's new activity.
6. Do not create synthetic history in either account at any point.

---

## 13. Scope — what this runbook does not authorize

No Production deployment or image change; no Production flag/config change
(`LEARNBOX_BINARY_REVIEW_CREATION` stays absent, `LEARNBOX_SCHEDULER_V2` stays absent/OFF);
no role or grant change to `learnbox_app` / `learnbox_migrator`; no account or auth deletion;
no Native build, store submission, or Native UI enable; no schema migration or DDL.

Production at preparation time: digest `sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7`,
`APP_SOURCE_SHA=d4ea6558b708d055cda8c3aca5010064b1cec58c`, `LEARNBOX_BINARY_REVIEW=true`,
`LEARNBOX_BINARY_REVIEW_CREATION` absent, `LEARNBOX_SCHEDULER_V2` absent, restarts 0, health 200.

**Execution gate:** this runbook is prepared only. The reset runs after owner approval, with FV-3
resolved and the FV-1 Neon recovery point confirmed.
