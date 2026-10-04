# Functional Validation — Final Closure

**Date:** 2026-10-04
**Status:** **COMPLETE AND RELEASED**
**Scope of this document:** the final post-FV verification gate. Verification only — zero
Production data was modified (all SQL ran inside `BEGIN TRANSACTION READ ONLY; … ROLLBACK`).

---

## 1. Bahram control account — byte-identical to the pinned pre-FV baseline

Bahram is the untouched control account. The pinned baseline comes from
`mona-reset-run/01-precheck.txt` and `03-postverify.txt`. Every fingerprint expression was
copied **verbatim** from `mona-reset-run/04-transaction.sql`, so the md5 values are directly
comparable rather than recomputed with a differently-shaped query.

| Fingerprint                               | Baseline                               | Current  | Result   |
| ----------------------------------------- | -------------------------------------- | -------- | -------- |
| `review_events` count                     | 58                                     | 58       | PASS     |
| `card_schedules` count                    | 16                                     | 16       | PASS     |
| `learner_reconciliation_cursors` count    | 1                                      | 1        | PASS     |
| `review_events` md5                       | `f50d09c9b0e5ac609adae8901197f1da`     | same     | PASS     |
| `card_schedules` md5                      | `6c7fe96a66c9b8794efea569e66cc846`     | same     | PASS     |
| `learner_reconciliation_cursors` md5      | `0912c7f1aa9d5d5425eb01004c802461`     | same     | PASS     |
| **combined control digest**               | **`f6f477b2f42a957a15092871655eb277`** | **same** | **PASS** |
| `review_events` **xmin**                  | `b9b103fa7525cc76a332ceac1bc3ec25`     | same     | PASS     |
| `card_schedules` **xmin**                 | `a733156634d5c6c24fdefa05874d2e8d`     | same     | PASS     |
| `learner_reconciliation_cursors` **xmin** | `1afb2c4a451903e95567f5030ffa18a6`     | same     | PASS     |

All **10** pinned fingerprints match, including all three `xmin` digests. The `xmin` match is
the strong claim: it proves no row was updated, deleted or re-inserted at any point — a value
fingerprint alone could in principle be reproduced by a rewrite, an `xmin` fingerprint cannot.

## 2. Mona — expected final FV state

| Metric                    | Expected | Current | Result |
| ------------------------- | -------- | ------- | ------ |
| `review_events`           | 3        | 3       | PASS   |
| `card_schedules`          | 3        | 3       | PASS   |
| `learner_daily_plans`     | 1        | 1       | PASS   |
| `review_event_rejections` | 0        | 0       | PASS   |

Matches the FV device test: 3 cards answered (including the offline card), 1 plan, no rejections.

## 3. No unexpected learner-data mutation from the Production deployment

Fingerprint taken **before** the cutover and again **after** all post-deploy verification:

|                             | Pre-deploy                         | Post-deploy + post-verification |
| --------------------------- | ---------------------------------- | ------------------------------- |
| counts (`ev/sch/plans/rej`) | `61/19/1/0`                        | `61/19/1/0`                     |
| `ev_ids_md5`                | `7949c518f5e74c239edebca03e1d4d03` | identical                       |
| `sch_md5`                   | `445d269fbf90d50ab95414e991e8abe3` | identical                       |

Cross-checks:

- **Totals reconcile exactly** to the two known accounts: Bahram 58 + Mona 3 = 61 events;
  16 + 3 = 19 schedules. No third source of learner rows.
- **Over-broad-write guard:** rows belonging to neither account = **0** events, **0** schedules.
- **Catalog/auth unchanged:** `cards=35`, `cards_md5=8cd0abc62c29f6d3c83574d8e7bd8e2d`,
  `revoked_md5=6c89b1a2ed6caab532d69030aab8a0be`.
- **Schema/migrations unchanged:** head `0023_learning_persistence`, count `23` — no migration
  ran during the deployment (read with the migrator role, which alone can read
  `schema_migrations`).

## 4. Production state

| Check                        | Result                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| Artifact                     | `sha256:953b7b6240c266ec22d1ed6bc4dad5998ae679cd907276d39c232676f7709d24` |
| `APP_SOURCE_SHA`             | `6d6aa72489dd895299f8a1f4bedb2c205e32e31b`                                |
| Health                       | container `healthy`, `RestartCount=0`, edge `/api/health` 200             |
| Services                     | app / admin / landing / caddy all up and healthy                          |
| Service Worker               | `v10` at the public edge (D-FV-1 fix live)                                |
| `LEARNBOX_SCHEDULER_V2`      | **ABSENT** (count 0)                                                      |
| `LEARNBOX_BINARY_REVIEW`     | `true` — unchanged                                                        |
| Rollback artifact            | `sha256:cb3090da…` **PRESENT** on host + `compose.yaml.pre-dfv1`          |
| `snap-ancient-band-asqfztci` | preserved                                                                 |
| `br-purple-night-as1ji0k0`   | preserved                                                                 |

---

## 5. Verdict

Functional Validation is **COMPLETE AND RELEASED**:

- Mona's fresh-learner journey passed on a real device on Production web.
- D-FV-1 found, fixed, reviewed, merged and **deployed**; the offline path is proven against the
  deployed artifact with the origin killed.
- D-FV-2 assessed and closed as accepted minor UX debt (value and label both correct).
- Bahram's control account is **byte-identical**, xmin included — the isolation guarantee held
  across the reset, the device test and the Production deployment.

### Residual, carried forward (neither blocks release)

- **F-1:** `welcome` / `encourage` / `focus` Bobo expressions remain unprecached (~1.5 MB). They
  now degrade to the decorative placeholder instead of a broken icon.
- **D-FV-2:** «دقت» quick-stat readability — revisit only on real learner evidence or at the next
  Today-screen rework.

### Not authorized by this closure

Native release or activation, Binary UI rollout beyond the current Production state,
Scheduler V2 activation, any feature-flag change, public launch activation.
