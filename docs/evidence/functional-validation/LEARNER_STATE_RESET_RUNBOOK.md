# Functional Validation — Learner-State Reset RUNBOOK (PREPARED, NOT EXECUTED)

**Status:** PREPARED FOR OWNER REVIEW. **Nothing in this document has been executed.**
No Production write, no role/grant change, no flag/config change, no `DELETE` has occurred.

**Authorized procedure: FV-3 Variant 1 — reset Mona only.** This is the single execution path in
this runbook. Variant 2 (reset both users) is **REJECTED** and retained only as historical context
in §14.

Prepared against Production state verified read-only on 2026-10-03 (§2, §3, §4 baselines).
Canonical main at preparation: `cfb894188c5ac75bf1183b7809fb51347a17e3da`.
Decision record: `TEST_USER_LEARNING_STATE_RESET_DECISION.md`.

---

## 0. Owner decisions recorded

**FV-1 — Recovery mechanism.** The primary pre-reset recovery point is an **owner-created Neon
snapshot/branch**, taken from the Neon administrative surface immediately before the reset. A
verified logical `COPY` export with md5 fingerprints **may additionally** be retained as secondary
evidence, but it **does not replace** the Neon recovery point. The reset must not proceed unless the
Neon recovery point exists and the owner has verified it.

**FV-2 — Execution identity.** The reset executes as **`neondb_owner` through the Neon
administrative surface**. Production privileges of `learnbox_app` and `learnbox_migrator` are
**not** broadened for this validation reset.

**FV-3 — Reset scope (owner decision, 2026-10-03). Variant 1 APPROVED.**

- **Account A / fresh-user: Mona `b4efb0a4-d829-4f33-b686-0f498fbef62c` → learner state IS reset.**
- **Account B / isolation control: Bahram `451b0433-7204-44e9-957f-250cac59e28e` → MUST remain
  COMPLETELY UNTOUCHED.**

This is the **later owner decision and it narrows the execution scope**. It supersedes the broader
wording in the previously merged decision document which said both existing test users would be
reset. That historical wording is **not to be reinterpreted or applied**; Variant 1 governs
execution.

Bahram's current non-zero state is **intentional and valuable isolation evidence** (58 review
events, 16 card schedules, 1 reconciliation cursor, plus the fingerprints in §3). It must remain
**byte-identical** through Mona's reset and the subsequent Functional Validation, unless the owner
separately authorizes activity on Bahram.

---

## 1. The six learner-state tables (reset scope — Mona's rows only)

Enumerated from the live catalog by `user_id` column — not assumed.

| #   | Table                            | Category                           | Mona rows to delete |
| --- | -------------------------------- | ---------------------------------- | ------------------- |
| 1   | `review_events`                  | review history/events              | 39                  |
| 2   | `card_schedules`                 | card schedules + Box state         | 15                  |
| 3   | `learner_daily_plans`            | daily plans/workload               | 1                   |
| 4   | `learner_reconciliation_cursors` | derived learning/progress state    | 1                   |
| 5   | `review_event_rejections`        | stale rejected/queued review state | 0 (none exist)      |
| 6   | `mobile_learner_sessions`        | derived client learning state      | 0 (none exist)      |

**Total: 56 rows, all belonging to Mona.** Tables 5 and 6 are in scope but currently empty — their
statements remain for completeness ("as applicable") and are no-ops if still empty at execution.

Facts that make the delete safe, verified from `pg_constraint` / `pg_trigger`:

- `review_events → users` is `ON DELETE NO ACTION`, as is `review_events → cards`. Deleting learner
  rows **cannot** cascade into an account or the catalog.
- Tables 2–6 are `ON DELETE CASCADE` **from `users`** — dormant here because no account is deleted;
  it confirms they are per-user derived state.
- **No FKs exist between the six tables** → no delete ordering constraint.
- **No non-internal triggers** on any of the six → deletes have no side effects.
- `review_events` has unique `(user_id, client_event_id)`; clearing Mona's rows restores replay
  idempotency for the device test's new events.

---

## 2. Mona — final pre-reset expected state

| Table                            | Expected rows |
| -------------------------------- | ------------- |
| `review_events`                  | **39**        |
| `card_schedules`                 | **15**        |
| `learner_daily_plans`            | **1**         |
| `learner_reconciliation_cursors` | **1**         |
| `review_event_rejections`        | **0**         |
| `mobile_learner_sessions`        | **0**         |

Mona's `card_schedules.state` distribution at baseline: 12 `review`, 3 `relearning`.
Mona also owns all 7 `revoked_sessions` rows — **retained, not touched** (§5, §10).

A fresh learner has **no** `card_schedules` rows; the application bootstraps them on first use.
Deletion is therefore the correct fresh state and **no synthetic history is created**.

---

## 3. Bahram — final control baseline (must stay byte-identical)

Captured read-only 2026-10-03, immediately before preparing this runbook.

| Metric                                 | Value                                  |
| -------------------------------------- | -------------------------------------- |
| `review_events` count                  | **58**                                 |
| `review_events` md5                    | `f50d09c9b0e5ac609adae8901197f1da`     |
| `card_schedules` count                 | **16**                                 |
| `card_schedules` md5                   | `6c7fe96a66c9b8794efea569e66cc846`     |
| `learner_reconciliation_cursors` count | **1**                                  |
| `learner_reconciliation_cursors` md5   | `0912c7f1aa9d5d5425eb01004c802461`     |
| `learner_daily_plans`                  | 0                                      |
| `review_event_rejections`              | 0                                      |
| `mobile_learner_sessions`              | 0                                      |
| **combined control digest**            | **`f6f477b2f42a957a15092871655eb277`** |

Fingerprint definitions (ordering matters — reuse exactly):

```sql
-- Bahram control fingerprints. Read-only.
\set B '451b0433-7204-44e9-957f-250cac59e28e'
SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id = :'B';
SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id = :'B';
SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id = :'B';

-- single combined digest (the one value to compare before/after)
SELECT md5(
       coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id = :'B'),'-')
||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id = :'B'),'-')
||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id = :'B'),'-')
);
```

**These fingerprints must be re-captured immediately before the eventual transaction** (§12 step 2)
and compared after (§8). The values above are the approved baseline; drift before execution is a
STOP condition (§7).

---

## 4. Supporting approved baseline (fail-closed reference)

| Item                                     | Approved value                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `users` rows                             | 2                                                                         |
| Target A uuid (Mona)                     | `b4efb0a4-d829-4f33-b686-0f498fbef62c`                                    |
| Control B uuid (Bahram)                  | `451b0433-7204-44e9-957f-250cac59e28e`                                    |
| `cards` / `card_versions` / `pack_cards` | 35 / 35 / 35                                                              |
| `cards` md5                              | `8cd0abc62c29f6d3c83574d8e7bd8e2d`                                        |
| `revoked_sessions` count / md5           | 7 / `6c89b1a2ed6caab532d69030aab8a0be` (ordered by `session_id`)          |
| `user_session_cutoffs`                   | 0                                                                         |
| schema md5 (7 relevant tables)           | `0348784c84461e1bb7068411a8d33bcf`                                        |
| migrations                               | 23 applied, head `0023_learning_persistence`                              |
| Production image digest                  | `sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7` |
| `APP_SOURCE_SHA`                         | `d4ea6558b708d055cda8c3aca5010064b1cec58c`                                |

Schema md5 definition (read-only):

```sql
SELECT md5(string_agg(c.relname||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod),'|'
             ORDER BY c.relname,a.attnum))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid
 WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
   AND c.relname IN ('review_events','card_schedules','learner_daily_plans',
        'learner_reconciliation_cursors','review_event_rejections',
        'mobile_learner_sessions','users');
```

---

## 5. Explicitly retained — must NOT be touched

| Retained                                          | Rows                   | Why                                                                                     |
| ------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Mona's `users` account                            | 1                      | account + auth identity preserved                                                       |
| **Bahram's account AND ALL Bahram learner state** | 58 ev / 16 sch / 1 cur | isolation control evidence (§3)                                                         |
| `users` (both rows)                               | 2                      | identity: `id`, `phone_e164`, names, `date_of_birth`, `gender`, `avatar_id`, `timezone` |
| `otp_challenges`                                  | 37                     | OTP login path                                                                          |
| `otp_request_events`                              | 37                     | OTP login path                                                                          |
| `invite_codes`                                    | 3                      | access/eligibility                                                                      |
| `invite_consents`                                 | 1                      | consent record                                                                          |
| `revoked_sessions`                                | 7 (all Mona's)         | auth-adjacent; clearing could resurrect a deliberately revoked session                  |
| `user_session_cutoffs`                            | 0                      | auth-adjacent; empty, still out of scope                                                |
| `cards` / `card_versions`                         | 35 / 35                | content catalog                                                                         |
| `packs` / `pack_cards`                            | 1 / 35                 | content catalog                                                                         |
| `content_review_checks` / `_decisions`            | 210 / 35               | content QA evidence                                                                     |
| `user_packs`                                      | 0                      | entitlement, not learning history                                                       |
| `account_deletion_events`                         | 1                      | audit record                                                                            |
| admin / billing / splash / banner / payment       | —                      | unrelated system + configuration data                                                   |

No `UPDATE` is performed anywhere. The reset is **delete-only**, scoped to Mona's rows in the six
tables of §1.

---

## 6. The reset — transaction boundaries

**DO NOT RUN. This is the reviewed text for owner approval only.**

Single transaction, single hard-coded target UUID (Mona), with in-transaction assertions that abort
before `COMMIT` on any deviation. There is **no variant selection** — Variant 1 is the only path.

```sql
-- NOT EXECUTED DURING PREPARATION. Run only after §7 preconditions ALL pass.
-- Connected as neondb_owner via the Neon administrative surface (FV-2).
-- Mona   (reset target) = b4efb0a4-d829-4f33-b686-0f498fbef62c
-- Bahram (control)      = 451b0433-7204-44e9-957f-250cac59e28e  -- appears in NO delete

BEGIN;

-- STEP 1 — fail closed unless the observed baseline matches the APPROVED baseline exactly.
DO $$
DECLARE n int; s text;
BEGIN
  SELECT count(*) INTO n FROM users;
  IF n <> 2 THEN RAISE EXCEPTION 'ABORT: users=% (approved 2)', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id='b4efb0a4-d829-4f33-b686-0f498fbef62c')
    THEN RAISE EXCEPTION 'ABORT: Mona uuid absent'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id='451b0433-7204-44e9-957f-250cac59e28e')
    THEN RAISE EXCEPTION 'ABORT: Bahram uuid absent'; END IF;

  -- Mona's approved pre-reset counts
  SELECT count(*) INTO n FROM review_events WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 39 THEN RAISE EXCEPTION 'ABORT: Mona review_events=% (approved 39) - STOP, do not adapt', n; END IF;
  SELECT count(*) INTO n FROM card_schedules WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 15 THEN RAISE EXCEPTION 'ABORT: Mona card_schedules=% (approved 15) - STOP', n; END IF;
  SELECT count(*) INTO n FROM learner_daily_plans WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 1  THEN RAISE EXCEPTION 'ABORT: Mona learner_daily_plans=% (approved 1) - STOP', n; END IF;
  SELECT count(*) INTO n FROM learner_reconciliation_cursors WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 1  THEN RAISE EXCEPTION 'ABORT: Mona cursors=% (approved 1) - STOP', n; END IF;

  -- Bahram control baseline: counts AND fingerprints must match §3 exactly.
  SELECT count(*) INTO n FROM review_events WHERE user_id='451b0433-7204-44e9-957f-250cac59e28e';
  IF n <> 58 THEN RAISE EXCEPTION 'ABORT: Bahram review_events=% (approved 58) - STOP', n; END IF;
  SELECT count(*) INTO n FROM card_schedules WHERE user_id='451b0433-7204-44e9-957f-250cac59e28e';
  IF n <> 16 THEN RAISE EXCEPTION 'ABORT: Bahram card_schedules=% (approved 16) - STOP', n; END IF;
  SELECT count(*) INTO n FROM learner_reconciliation_cursors WHERE user_id='451b0433-7204-44e9-957f-250cac59e28e';
  IF n <> 1  THEN RAISE EXCEPTION 'ABORT: Bahram cursors=% (approved 1) - STOP', n; END IF;

  SELECT md5(
         coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ) INTO s;
  IF s <> 'f6f477b2f42a957a15092871655eb277'
    THEN RAISE EXCEPTION 'ABORT: Bahram control digest drifted (%) - STOP', s; END IF;

  -- catalog + schema must match the approved baseline
  SELECT count(*) INTO n FROM cards;
  IF n <> 35 THEN RAISE EXCEPTION 'ABORT: cards=% (approved 35)', n; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) INTO s FROM cards t;
  IF s <> '8cd0abc62c29f6d3c83574d8e7bd8e2d'
    THEN RAISE EXCEPTION 'ABORT: catalog fingerprint drifted - STOP'; END IF;
  SELECT count(*) INTO n FROM revoked_sessions;
  IF n <> 7 THEN RAISE EXCEPTION 'ABORT: revoked_sessions=% (approved 7)', n; END IF;

  SELECT md5(string_agg(c.relname||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod),'|'
               ORDER BY c.relname,a.attnum)) INTO s
    FROM pg_class c JOIN pg_namespace nn ON nn.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE nn.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
     AND c.relname IN ('review_events','card_schedules','learner_daily_plans',
          'learner_reconciliation_cursors','review_event_rejections',
          'mobile_learner_sessions','users');
  IF s <> '0348784c84461e1bb7068411a8d33bcf'
    THEN RAISE EXCEPTION 'ABORT: schema drifted (%) - STOP, re-approve baseline', s; END IF;
END $$;

-- STEP 2 — delete Mona's learner state ONLY. Bahram's uuid appears in no DELETE.
-- No FKs between these tables, so order is irrelevant; listed as in §1.
DELETE FROM review_events                  WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM card_schedules                 WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM learner_daily_plans            WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM learner_reconciliation_cursors WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM review_event_rejections        WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM mobile_learner_sessions        WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';

-- STEP 3 — post-delete assertions, still inside the transaction.
DO $$
DECLARE n int; s text;
BEGIN
  -- Mona has zero learner state
  SELECT count(*) INTO n FROM review_events WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 0 THEN RAISE EXCEPTION 'ABORT: residual Mona review_events=%', n; END IF;
  SELECT count(*) INTO n FROM card_schedules WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 0 THEN RAISE EXCEPTION 'ABORT: residual Mona card_schedules=%', n; END IF;
  SELECT count(*) INTO n FROM learner_daily_plans WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 0 THEN RAISE EXCEPTION 'ABORT: residual Mona plans=%', n; END IF;
  SELECT count(*) INTO n FROM learner_reconciliation_cursors WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
  IF n <> 0 THEN RAISE EXCEPTION 'ABORT: residual Mona cursors=%', n; END IF;

  -- both accounts still exist
  SELECT count(*) INTO n FROM users;
  IF n <> 2 THEN RAISE EXCEPTION 'ABORT: users=% after delete', n; END IF;

  -- ISOLATION INVARIANT: Bahram byte-identical
  SELECT md5(
         coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id='451b0433-7204-44e9-957f-250cac59e28e'),'-')
  ) INTO s;
  IF s <> 'f6f477b2f42a957a15092871655eb277'
    THEN RAISE EXCEPTION 'ABORT: Bahram control MUTATED by the reset (%) - ROLLBACK', s; END IF;

  -- retained surfaces intact
  SELECT count(*) INTO n FROM cards;
  IF n <> 35 THEN RAISE EXCEPTION 'ABORT: cards=% after delete', n; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.session_id)) INTO s FROM revoked_sessions t;
  IF s <> '6c89b1a2ed6caab532d69030aab8a0be'
    THEN RAISE EXCEPTION 'ABORT: revoked_sessions mutated - ROLLBACK'; END IF;
END $$;

-- Review the reported row counts and assertion output, then finish with exactly one of:
COMMIT;
-- ROLLBACK;
```

**Boundary rules.** One transaction. No DDL. No `TRUNCATE` (bypasses per-user scoping). No
`CASCADE`. No statement without an explicit `user_id = <Mona>` predicate. Bahram's uuid must never
appear in a `DELETE`. If any assertion raises, the transaction aborts and **zero rows are deleted**.

---

## 7. Fail-closed preconditions (all must hold; STOP if any fails)

The reset **must not adapt** to drift. If the observed Production baseline differs from the approved
baseline in any respect — learner counts, target user IDs, catalog state, schema, or relevant
fingerprints — **STOP** and return to the owner for re-approval. Do not rewrite the `DELETE`.

1. Explicit owner approval to execute, **immediately before** the real-device test.
2. **FV-1 Neon recovery point created by the owner AND verified to exist.** Record its identifier at
   execution time: `__________`. No `DELETE` is permitted before this is confirmed.
3. Connected as **`neondb_owner`** via the Neon administrative surface (`SELECT current_user;`).
4. `users` = exactly 2 rows; both approved UUIDs present (§4).
5. Mona's counts match §2 **exactly** (39 / 15 / 1 / 1 / 0 / 0).
6. Bahram's counts **and** combined control digest match §3 **exactly**
   (`f6f477b2f42a957a15092871655eb277`).
7. Catalog matches §4: `cards`=35, `card_versions`=35, `pack_cards`=35, `cards` md5
   `8cd0abc62c29f6d3c83574d8e7bd8e2d`.
8. `revoked_sessions` = 7 with md5 `6c89b1a2ed6caab532d69030aab8a0be`.
9. Schema md5 = `0348784c84461e1bb7068411a8d33bcf`; migrations head `0023_learning_persistence`.
10. No in-flight device-test session is writing (the reset precedes the test).
11. Optional secondary evidence (FV-1): `COPY` export of Mona's rows in the six tables + md5.

Steps 4–9 are additionally enforced **inside** the transaction (§6 STEP 1), so a precondition missed
by the operator still aborts rather than deleting.

---

## 8. Isolation invariant — proving Bahram was untouched

Capture §3 fingerprints immediately before the transaction, then after `COMMIT` prove **all** of:

```sql
\set B '451b0433-7204-44e9-957f-250cac59e28e'
SELECT 'ev_count'  AS k, count(*)::text AS v FROM review_events                  WHERE user_id = :'B'  -- 58
UNION ALL SELECT 'sch_count', count(*)::text FROM card_schedules                 WHERE user_id = :'B'  -- 16
UNION ALL SELECT 'cur_count', count(*)::text FROM learner_reconciliation_cursors WHERE user_id = :'B'  -- 1
UNION ALL SELECT 'ev_md5',  coalesce(md5(string_agg(t::text,'|' ORDER BY t.id)),'-')      FROM review_events t                  WHERE t.user_id = :'B'
UNION ALL SELECT 'sch_md5', coalesce(md5(string_agg(t::text,'|' ORDER BY t.card_id)),'-') FROM card_schedules t                 WHERE t.user_id = :'B'
UNION ALL SELECT 'cur_md5', coalesce(md5(string_agg(t::text,'|' ORDER BY t.user_id)),'-') FROM learner_reconciliation_cursors t WHERE t.user_id = :'B';
```

Required results — **byte-identical** to §3:

| Check                                        | Required                           |
| -------------------------------------------- | ---------------------------------- |
| Bahram review-event count unchanged          | 58                                 |
| Bahram schedule count unchanged              | 16                                 |
| Bahram reconciliation cursor unchanged       | 1                                  |
| `review_events` fingerprint                  | `f50d09c9b0e5ac609adae8901197f1da` |
| `card_schedules` fingerprint                 | `6c7fe96a66c9b8794efea569e66cc846` |
| `learner_reconciliation_cursors` fingerprint | `0912c7f1aa9d5d5425eb01004c802461` |
| combined control digest                      | `f6f477b2f42a957a15092871655eb277` |

**No Bahram row updated, deleted, or inserted.** The fingerprints hash every column of every row,
so an `UPDATE` that preserves the count still changes the digest — a count-only comparison is
explicitly insufficient and is not accepted as proof here. Independent corroboration that no write
touched Bahram's rows:

```sql
-- xmin is the inserting/updating transaction id; unchanged xmin => the row was not rewritten.
SELECT md5(string_agg(xmin::text,'|' ORDER BY id))      FROM review_events  WHERE user_id = :'B';
SELECT md5(string_agg(xmin::text,'|' ORDER BY card_id)) FROM card_schedules WHERE user_id = :'B';
-- Capture both before the transaction; they must be identical afterwards.
```

Any deviation is a **blocking cross-user isolation defect**: stop the Functional Validation, do not
proceed to the device test, and restore from the Neon recovery point (§11).

---

## 9. Mona fresh-state invariant

After the reset, prove Mona has zero learner state in all six tables while her account still exists:

```sql
\set A 'b4efb0a4-d829-4f33-b686-0f498fbef62c'
SELECT 'review_events'                  AS tbl, count(*) AS remaining FROM review_events                  WHERE user_id = :'A'
UNION ALL SELECT 'card_schedules',                 count(*) FROM card_schedules                 WHERE user_id = :'A'
UNION ALL SELECT 'learner_daily_plans',            count(*) FROM learner_daily_plans            WHERE user_id = :'A'
UNION ALL SELECT 'learner_reconciliation_cursors', count(*) FROM learner_reconciliation_cursors WHERE user_id = :'A'
UNION ALL SELECT 'review_event_rejections',        count(*) FROM review_event_rejections        WHERE user_id = :'A'
UNION ALL SELECT 'mobile_learner_sessions',        count(*) FROM mobile_learner_sessions        WHERE user_id = :'A';
-- every `remaining` must be 0

SELECT count(*) FROM users WHERE id = :'A';   -- must be 1: account still exists
```

Scope-containment checks (catch an over-broad delete):

```sql
SELECT 'orphan_events='||count(*) FROM review_events WHERE user_id NOT IN (SELECT id FROM users);  -- 0
SELECT 'bahram_events='||count(*) FROM review_events
  WHERE user_id = '451b0433-7204-44e9-957f-250cac59e28e';                                          -- 58
SELECT 'total_events='||count(*)    FROM review_events;                                            -- 58
SELECT 'total_schedules='||count(*) FROM card_schedules;                                           -- 16
```

**Do not synthesize replacement schedules or history.** Fresh state means deleted learner history,
with the application bootstrapping legitimate state naturally during the subsequent device test.

API-side confirmation (not DB-only): the learner state endpoint for account A must report a fresh
learner. Run it with a genuine authenticated session on the current deployment.

---

## 10. Retained-data proofs

**Accounts usable.** Database:

```sql
SELECT id, phone_e164, first_name, timezone, created_at FROM users ORDER BY created_at;
-- exactly 2 rows, identity values identical to baseline
SELECT count(*) FROM otp_challenges;     -- 37
SELECT count(*) FROM otp_request_events; -- 37
SELECT count(*) FROM invite_codes;       -- 3
SELECT count(*) FROM invite_consents;    -- 1
```

Behavioural (required — DB counts alone do not prove login works):

1. Mona completes a **real OTP login** on the device → auth identity survived the reset.
2. Mona's learner read path returns a **fresh-learner** shape: no progress, no history-derived due
   reviews, figures derived from an empty history rather than fabricated rows.
3. Bahram completes a real OTP login and sees **only** his own unchanged state.
4. No 5xx on learner endpoints for either account.

**35-card catalog untouched:**

```sql
SELECT 'cards='||(SELECT count(*) FROM cards)
    ||' card_versions='||(SELECT count(*) FROM card_versions)
    ||' packs='||(SELECT count(*) FROM packs)
    ||' pack_cards='||(SELECT count(*) FROM pack_cards)
    ||' content_review_checks='||(SELECT count(*) FROM content_review_checks)
    ||' content_review_decisions='||(SELECT count(*) FROM content_review_decisions);
-- expect: cards=35 card_versions=35 packs=1 pack_cards=35
--         content_review_checks=210 content_review_decisions=35
SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) FROM cards t;
-- must equal 8cd0abc62c29f6d3c83574d8e7bd8e2d
```

**`revoked_sessions` untouched** — all 7 rows are Mona's, so this is the one retained table the
reset could plausibly disturb:

```sql
SELECT 'revoked_sessions='||count(*) FROM revoked_sessions;                       -- 7
SELECT md5(string_agg(t::text,'|' ORDER BY t.session_id)) FROM revoked_sessions t;
-- must equal 6c89b1a2ed6caab532d69030aab8a0be
SELECT count(*) FROM revoked_sessions WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c'; -- 7
SELECT count(*) FROM user_session_cutoffs;                                        -- 0
```

---

## 11. Recovery

**Primary (FV-1) — Neon recovery point.** The owner-created Neon snapshot/branch is authoritative:
it captures the full database, not just the six tables. **It must exist and be verified before any
`DELETE` is allowed** (§7.2). If the reset is wrong, incomplete, or the isolation invariant fails,
restore from it via the Neon administrative surface; restoring is an owner action. Record the
restore identifier and re-verify §2/§3/§4 afterwards.

**Secondary (evidence only).** A retained `COPY` export of Mona's rows with md5 fingerprints can
reconstruct what was deleted and prove the scope. It is **not** the recovery mechanism: it omits
sequence/visibility state and depends on write privileges the application roles do not hold for two
of the six tables.

**Recovery unnecessary in the abort path.** Any failed assertion in §6 aborts the transaction before
`COMMIT`, leaving zero rows deleted.

---

## 12. Assigning A and B

**Account A — fresh-user functional test:** Mona `b4efb0a4-d829-4f33-b686-0f498fbef62c`
(tz `Asia/Tehran`). Reset per §6. Used for the complete fresh-user walkthrough: first login → first
session → reviews → Box/schedule progression → daily plan.

**Account B — isolation / cross-user control:** Bahram `451b0433-7204-44e9-957f-250cac59e28e`.
**Untouched.** Retains 58 events / 16 schedules / 1 cursor as isolation evidence.

Procedure (a test convention — no schema or data change):

1. Record both UUIDs, Mona's §2 counts and Bahram's §3 fingerprints in the acceptance-test log
   before the test starts.
2. Re-capture Bahram's §3 fingerprints **and** `xmin` digests (§8) immediately before the
   transaction.
3. Run the entire fresh-user test on **A only**. **Do not log into B during A's test** unless the
   owner separately authorizes activity on Bahram.
4. After A's test, re-capture B's counts, fingerprints and `xmin` digests: all must be
   **byte-identical** to step 2 (58 / 16 / 1, digest `f6f477b2f42a957a15092871655eb277`). Any change
   is a blocking cross-user isolation defect.
5. Then log into B and confirm it sees only its own state and none of A's new activity.
6. Do not create synthetic history in either account at any point.

---

## 13. Scope — what this runbook does not authorize

No Production deployment or image change; no Production flag/config change
(`LEARNBOX_BINARY_REVIEW_CREATION` stays absent, `LEARNBOX_SCHEDULER_V2` stays absent/OFF); no role
or grant change to `learnbox_app` / `learnbox_migrator`; no account or auth deletion; no Native
build, store submission, or Native UI enable; no schema migration or DDL; no automatic start of
Functional Validation.

Production at preparation: digest
`sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7`,
`APP_SOURCE_SHA=d4ea6558b708d055cda8c3aca5010064b1cec58c`, `LEARNBOX_BINARY_REVIEW=true`,
`LEARNBOX_BINARY_REVIEW_CREATION` absent, `LEARNBOX_SCHEDULER_V2` absent, restarts 0, health 200.

**Execution gate:** prepared only. The reset runs after explicit owner approval, with the FV-1 Neon
recovery point verified.

---

## 14. Historical context — Variant 2 (REJECTED)

Recorded for traceability only. **Not authorized. Do not execute.**

Variant 2 would have reset **both** users, zeroing all six tables (97 events, 31 schedules, 1 plan,
2 cursors) and making Bahram a second fresh learner. It reflected the original wording of the merged
decision document.

**Rejected by owner decision FV-3 (2026-10-03)** in favour of Variant 1: Bahram's non-zero state is
intentional isolation evidence, and preserving a non-trivial fingerprint is a stronger leak detector
than asserting a count remains zero. Variant 1 also deletes 56 rows instead of 97+, making it the
smaller and more reversible change.
