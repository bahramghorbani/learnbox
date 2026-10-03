# FV — Mona-Only Learner-State Reset: Execution Evidence

**Status:** EXECUTED AND VERIFIED
**Date:** 2026-10-03T20:4x UTC
**Authorization:** Explicit owner approval (FV-3 Variant 1), granted after the FV Recovery Gate closed.
**Scope:** Production learner-state reset for Mona only. No deploy, no flag change, no schema change,
no grant change, no Scheduler V2 activation.

---

## 1. Recovery point (pre-existing, verified before execution)

| Field                 | Value                                                         |
| --------------------- | ------------------------------------------------------------- |
| Snapshot ID           | `snap-ancient-band-asqfztci`                                  |
| Snapshot name         | `fv-pre-reset-20261003T203146Z`                               |
| Source branch         | `br-long-frog-assrohg5` (Production root, default)            |
| Created               | `2026-10-03T20:31:47Z`                                        |
| Verification branch   | `fv-recovery-verify-20261003` / `br-purple-night-as1ji0k0`    |
| Verification endpoint | `ep-raspy-rice-as2xukx6` (isolated from Production)           |
| Verification method   | Restored **without `--finalize`**, then independently queried |

The recovery point was verified by querying the restored copy, not by trusting creation success.
Both the snapshot and the verification branch are **preserved** (not deleted) per owner instruction.

Secondary evidence retained, non-equivalent:
`/home/ubuntu/learnbox/evidence/fv-recovery-gate-20261003T201213Z/` (9 CSVs, manifest
`941110c8fa3af1cae706625703e72cab`).

## 2. Pre-BEGIN baseline re-check (29 values, zero drift)

Read live from Production as `neondb_owner` immediately before the transaction:

```
users=2  mona_account=1  bah_account=1
mona_ev=39  mona_sch=15  mona_plans=1  mona_cur=1  mona_rej=0  mona_mob=0
bah_ev=58   bah_sch=16   bah_cur=1
bah_combined=f6f477b2f42a957a15092871655eb277
bah_ev_xmin=b9b103fa7525cc76a332ceac1bc3ec25
bah_sch_xmin=a733156634d5c6c24fdefa05874d2e8d
cards=35    cards_md5=8cd0abc62c29f6d3c83574d8e7bd8e2d
revoked=7   revoked_md5=6c89b1a2ed6caab532d69030aab8a0be
schema_md5=0348784c84461e1bb7068411a8d33bcf
mig_head=0023_learning_persistence
total_ev=97  total_sch=31  total_plans=1
otp_ch=37    otp_req=37    invites=3
```

Every value identical to the approved baseline. No expected value was adapted.

## 3. Transaction executed

Single transaction, `neondb_owner`, Production endpoint `ep-jolly-hill-asbffbzx`. Structure:

1. `BEGIN`
2. `LOCK TABLE` the six learner-state tables `IN SHARE ROW EXCLUSIVE MODE`
3. **9 precondition assertion groups** — any mismatch raises and aborts with zero rows deleted
4. Six scoped `DELETE` statements, every one carrying
   `WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c'`
5. **10 post-assertion groups** evaluated _before_ `COMMIT`
6. `COMMIT`

Bahram's UUID appears in **zero** DELETE predicates (mechanically checked: 6 DELETEs, 6 containing
Mona's UUID, 0 containing Bahram's).

### Rows deleted — exactly as predicted

| Table                            | Deleted | Predicted |
| -------------------------------- | ------- | --------- |
| `review_events`                  | 39      | 39        |
| `card_schedules`                 | 15      | 15        |
| `learner_daily_plans`            | 1       | 1         |
| `learner_reconciliation_cursors` | 1       | 1         |
| `review_event_rejections`        | 0       | 0         |
| `mobile_learner_sessions`        | 0       | 0         |
| **Total**                        | **56**  | **56**    |

Both assertion blocks emitted their NOTICE; `COMMIT` returned cleanly; psql exit code 0.

## 4. Post-COMMIT verification (independent session, fresh connection)

### Mona fresh state — PASS

`mona_ev=0`, `mona_sch=0`, `mona_plans=0`, `mona_cur=0`, `mona_rej=0`, `mona_mob=0`.
Account retained: `mona_account_exists=1`, phone intact, `timezone=Asia/Tehran`.
No synthetic replacement rows were created — the application will bootstrap legitimate state on
first use during the device test.

### Bahram isolation — PASS

`bah_ev=58`, `bah_sch=16`, `bah_cur=1`, account present.

| Fingerprint    | Post-reset                         | Pre-reset | Match |
| -------------- | ---------------------------------- | --------- | ----- |
| `bah_ev_md5`   | `f50d09c9b0e5ac609adae8901197f1da` | same      | ✅    |
| `bah_sch_md5`  | `6c7fe96a66c9b8794efea569e66cc846` | same      | ✅    |
| `bah_cur_md5`  | `0912c7f1aa9d5d5425eb01004c802461` | same      | ✅    |
| `bah_combined` | `f6f477b2f42a957a15092871655eb277` | same      | ✅    |
| `bah_ev_xmin`  | `b9b103fa7525cc76a332ceac1bc3ec25` | same      | ✅    |
| `bah_sch_xmin` | `a733156634d5c6c24fdefa05874d2e8d` | same      | ✅    |

Unchanged `xmin` proves no Bahram row was updated, deleted, or re-inserted — stronger than a
count or content comparison, which a no-op rewrite could pass.

Caveat recorded for honesty: `bah_cur_xmin=1afb2c4a451903e95567f5030ffa18a6` is reported for the
first time here; no pre-reset baseline for the _cursor_ xmin was captured, so that single value is a
forward baseline, not a comparison. Cursor content md5 was compared and is unchanged.

### Global totals — PASS

`users=2`, `total_ev=58`, `total_sch=16`, `total_plans=0`, `total_cur=1`, `total_rej=0`,
`total_mob=0`. Over-broad-delete check: rows in `review_events` / `card_schedules` not belonging to
Bahram = **0**.

### Preserved data — PASS

`cards=35`, `card_versions=35`, `pack_cards=35`, `cards_md5=8cd0abc62c29f6d3c83574d8e7bd8e2d`.
`revoked_sessions=7`, `revoked_md5=6c89b1a2ed6caab532d69030aab8a0be` (unchanged — clearing these
would have resurrected revoked sessions). `otp_challenges=37`, `otp_request_events=37`,
`invite_codes=3`, `invite_consents=1`, `content_review_checks=210`,
`content_review_decisions=35`.

### Schema / migrations — PASS

`schema_md5=0348784c84461e1bb7068411a8d33bcf`, `mig_count=23`,
head `0023_learning_persistence`.

## 5. Production runtime — unchanged

| Field                             | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Image                             | `sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7` |
| `APP_SOURCE_SHA`                  | `d4ea6558b708d055cda8c3aca5010064b1cec58c`                                |
| Restarts / status                 | `0` / `running`, up 23h (healthy), started `2026-10-02T21:28:45Z`         |
| `LEARNBOX_BINARY_REVIEW`          | `true`                                                                    |
| `LEARNBOX_BINARY_REVIEW_CREATION` | `<ABSENT>`                                                                |
| `LEARNBOX_SCHEDULER_V2`           | `<ABSENT>` (Scheduler V2 remains OFF)                                     |
| Health                            | HTTP `200`, `{"status":"ok", database ok 7ms}`                            |
| Unauthenticated media probe       | `404` (never `200`)                                                       |

No deploy, no restart, no image change, no flag change, no env change.

## 6. Recovery procedure if needed

1. Restore to a side branch for inspection, non-destructive:
   `neon snapshots restore snap-ancient-band-asqfztci --project-id divine-silence-09471885 --name <insp> --profile learnbox`
2. Full Production rollback (**owner gate required**, destructive swap):
   `neon snapshots restore snap-ancient-band-asqfztci --target-branch br-long-frog-assrohg5 --finalize --profile learnbox`

Constraint: plan `free_v3` has a **6-hour** history window, so PITR cannot reach past it; the
snapshot is the durable recovery point. PITR is unsupported on branches created from a snapshot
restore, so rollback is snapshot-restore, not PITR-on-restore.

## 7. Confirmations

- Only Mona's learner rows were deleted; 56 rows total, matching prediction exactly.
- Bahram's learner state is byte-identical including transaction visibility (`xmin`).
- Mona's account, the 35-card catalog, revoked sessions, and the auth/OTP/invite surface are intact.
- Snapshot and recovery verification branch preserved.
- Device test **not started**. No deploy, no flag change, no Scheduler V2, no grant change.
