# Restore gate reconciliation — 2026-10-01

Purpose: decide, from evidence rather than the calendar, whether the restore gate that blocks LB-B35 CP4
(first additive migration `0023`) is satisfied. Read-only against Production; every restore ran in a
disposable local container. Production was not touched, restored over, or interrupted.

## Acceptance criteria

Taken verbatim from `infrastructure/production/ops/learnbox-restore-drill.sh` (the scheduled drill) and the
owner's gate wording.

| #   | Criterion                                                                                     | Evidence                                                                                                                       | Result |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| R1  | A real restore executes (SQL loaded with `ON_ERROR_STOP`), not only a `gzip -t` validation    | P0 restore (2026-09-30 17:36Z) and the drill run below                                                                         | PASS   |
| R2  | Target is a disposable database; Production never a target                                    | Local throwaway containers, no published ports in the drill script; status `production_touched=no`                             | PASS   |
| R3  | Archive identity recorded                                                                     | P0: `prod-pre-p0.dump` sha256 `48b8fc05…19d779`, 479,591 bytes, re-verified today. Drill: see below                            | PASS   |
| R4  | ≥10 tables restored, `cards` and `schema_migrations` non-empty                                | 38 tables, 35 cards, 22 ledger rows                                                                                            | PASS   |
| R5  | Zero orphaned learner rows (`card_schedules` → `users`)                                       | 0 (also 0 for `review_events` → users/cards and `card_schedules` → cards)                                                      | PASS   |
| R6  | Restored database equals Production: tables, row counts, structure, FKs, indexes, ledger 0022 | P0: 38/38 tables, `row-counts-before` = `row-counts-restored` (sorted diff identical), `structure-prod` = `structure-restored` | PASS   |
| R7  | The newest nightly backup, not only a hand-made dump, is restorable                           | Drill script run against `learnbox-20261001T023451Z.sql.gz` (below)                                                            | PASS   |
| R8  | The systemd **timer** fires the drill on schedule                                             | `ExecMainStartTimestamp` of `learnbox-restore-drill.service` is empty; first fire `2026-10-05 03:36 UTC`                       | OPEN   |

## Drill run executed today (the missing portion: R7)

- Script: `learnbox-restore-drill.sh` from `main`, unmodified except `sha256sum` → `shasum -a 256`
  (macOS has no `sha256sum`); a one-line diff, nothing else.
- Archive: `learnbox-20261001T023451Z.sql.gz`, sha256
  `70285150ae6caebd362164d4404a6a8c0c5092c61320a56302de6090cdd33663`. The checksum was identical on the
  VPS and after copy. `gzip -t` ok; dump-complete marker present.
- Result: `status=ok`, 38 tables, users 2, cards 35, review_events 90, purchase_events 0,
  schema_migrations 22, `orphaned_rows=0`, `target=disposable-container-only`, scratch container removed.
- Independent re-restore into a second container with extra checks: restore exit 0 with an empty error
  stream; per-table row counts for all 38 tables equal the `COPY` row counts in the archive (631 rows, 0
  mismatches); 145 constraints, 0 not validated; 35 FKs; 84 indexes; every `review_events.grade` is one of
  the four historical grades; 35 published card versions.

## Conclusion

R1–R7 are proven by genuine restore executions with checksums and integrity comparisons. R8 is the only
open item. It tests that the **schedule fires**, not that a backup can be restored, so it cannot be
satisfied early and is not evidence about restorability.

**Decision recorded:** the restore gate for developing and staging CP4 is satisfied as of 2026-10-01. R8 stays
an open operations item, to be checked after 2026-10-05 03:36 UTC through `ExecMainStartTimestamp` (never
through `Result=success`). Nothing here claims recurring scheduled recovery is proven.

This does **not** authorize any Production migration. Before any future Production application of `0023`, a
fresh pre-migration dump must be taken and restore-verified immediately beforehand, as in the P0 cutover.
