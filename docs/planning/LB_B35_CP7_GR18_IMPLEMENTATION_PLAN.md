# LB-B35 CP7 — GR-1.8 scheduler implementation: checkpoint plan (NOT implemented)

Status: **plan only.** Nothing in this document has been built. Owner decisions are in `LB_B35_CP6_PROGRESSION_DECISION_REPORT.md` §8. The simulator
(`tools/learning-sim`) is decision support only: GR-1.8's simulated day-365 knowledge (0.242) is lower than ENG-DROP's (0.308) and no real
learner-retention dataset shows pedagogical superiority. Scheduler v1 stays the default.

## 1. Scope and non-goals

In: a new pure scheduler `scheduleBinaryReview` (GR-1.8 + ENG-DROP) in `packages/learning-engine`, behind a default-OFF server flag `LEARNBOX_SCHEDULER_V2`;
explicit Box-transition invariants; stamping `review_events.engine_version`; telemetry-only recall probe design (§8).
Out: Production migration, Production flags, Admin, Store, mobile client changes, history rewrite, `state` column retirement, any automatic policy tuning.

## 2. Current code facts this plan rests on (verified in the repo)

- `scheduleReview(schedule, grade, now)` in `packages/learning-engine/src/index.ts`: factors forgot 0.35 / hard 0.8 / remembered 1.8 / mastered 3; floor 10 min; no cap; writes `state`, `difficulty` (±), `lapses`. It is the only scheduler. It is called from `apps/api/src/reviews/mobile-review-batch.service.ts` and, through the same store, from the web review route.
- The store (`postgres-review-event.store.ts#writeAtomically`) writes `review_events` then updates `card_schedules` in one transaction. Only the insert names `response` when a binary answer is present (flag `LEARNBOX_BINARY_REVIEW`), so flag-off SQL equals v1.2.1.
- `card_schedules.stability_days` is `DOUBLE PRECISION`; Box is derived with edges 1 / 3 / 7 / 21 days (`definitions.ts`, `boxOf`).
- `review_events.engine_version` (smallint, NULL = legacy v1, CHECK 1..100) exists only after migration 0023. **The scheduler flag therefore needs 0023 applied** (see §9 gate).

## 3. Design

### 3.1 Explicit Box-transition rules (the invariant)

`scheduleBinaryReview(schedule, response, now)` works in Box space first. Let `b = boxOf(stabilityDays)`.

- **Known:** candidate = `stab × 1.8` (Box 5: `stab × 3`); if `b = 1` candidate = `max(candidate, 1 d)`. Target Box `t = min(boxOf(candidate), b + 1)`. Never `t < b`. Final stability = candidate clamped into Box `t` (`< upperEdge(t)` by a fixed margin; `≤ 180 d` for Box 5).
- **Unknown:** `b = 1` → stays Box 1 (stability `max(stab × 0.35, floor)`, clamped below 1 d). `b ≥ 2` → target Box `b − 1`, stability = `min(stab × 0.35, upperEdge(b − 1) − margin)` (lands inside Box `b − 1`, never outside it).
- **Cap:** Known from Box 5 gives `min(stab × 3, 180)`; there is no other upper bound.
- **Non-inputs:** `difficulty`, `lapses`, lateness are not read. `difficulty` and `lapses` columns are still written exactly as v1 writes them (compatibility).
- **After computing**, a runtime assertion `assertBoxTransition(b, response, boxOf(next))` throws if the rule is violated; the store treats a throw as "do not write", so a bug cannot corrupt a schedule. The margin is a named constant (1e-9 d), proven to survive a Postgres `double precision` round trip in a DB test.

### 3.2 Legacy four-grade input (mobile, and web with binary UI off)

Open point to confirm in the checkpoint (recommended default): with the flag ON, legacy `grade` events with no `response` are mapped by the existing `HISTORICAL_GRADE_PROJECTION` (`forgot → unknown`; `hard / remembered / mastered → known`) and scheduled by the same function, so a mobile client sees GR-1.8 behavior with no API change. Consequence to be documented: `hard` (×0.8 in v1) and `mastered` (×3 in v1) both become a plain Known (×1.8). With the flag OFF, every grade goes through v1 unchanged.

### 3.3 `state` column

Still written. Proposed mapping (same alphabet v1 writes): Unknown → `relearning`; first answer from `new` → `learning`; Known landing in Box 5 → `mastered`; otherwise `review`. This is a proposal to confirm; the web UI and rollback both read `state`.

### 3.4 Wiring

One selector `selectScheduler(env)` is read once per request in the API review service and the web review path. Flag OFF returns the v1 function; no new SQL, no `engine_version` column in the statement. Flag ON adds `engine_version = 2` to the `review_events` insert (same conditional-column pattern as `response`).

## 4. Proof obligations and the tests that discharge them

All new tests are deterministic; none depend on wall-clock time or randomness except where a fixed seed is stated.

1. **Explicit Box invariants — exhaustive state-space sweep.** Stability grid of at least 4,000 log-spaced points from 10 minutes to 400 days plus every Box edge at ±1e-3, ±1e-9, ±1e-12, 0. For each point and each response assert: Known never lowers a Box; Known raises at most one; Known from Box 5 never exceeds 180 d; Unknown lowers exactly one Box for `b ≥ 2` and keeps Box 1; next stability > 0 and due date after `now`. The CP6 sweep (`tools/learning-sim/cp6-invariants.mjs`) is the starting point and becomes a permanent test on the real function, not the simulator.
2. **GR-1.8 Known progression.** Known × 14 from the fresh card equals the pinned CP6 trace (Box 2 at answer 1 with ≥ 1 d, Box 5 at answer 7, 180 d cap thereafter). Property: over the whole grid, no two consecutive Known answers stay in the same Box below Box 5 (max stall 1).
3. **Exact one-Box Unknown drops across the full range, including the cap.** Each Box edge, each interior point, and the 180-day state, each asserted to land in Box `b − 1` (Box 1 stays). Includes the CP6 finding that plain ENG-CLAMP fails at 742 of 4,036 points: the test fails on a deliberately re-introduced clamp-only variant (mutation check).
4. **Repeated Unknown.** From every Box, 12 consecutive Unknown answers: Box sequence is non-increasing, reaches Box 1 in `b − 1` steps and stays; intervals never below the 10-minute floor; no overflow or NaN.
5. **Mixed sequences.** Fixed catalog (KUKU…, K×6 U K×6, U from each Box then K) pinned to exact Box and interval, plus 1,000 seeded random sequences (seed recorded) checked against the invariants and against an independent reference implementation written as a lookup table (not the same formula).
6. **Box boundaries and the cap.** Edge-case unit tests at 0.999.. / 1 / 2.999.. / 3 / 6.999.. / 7 / 20.999.. / 21 / 180 / 400 d.
7. **No history rewrite.** DB test (real Postgres): `review_events` rows are byte-identical (sha256 over all columns) before and after scheduler-v2 writes except for newly appended rows; update/delete of events still rejected by the existing append-only guard.
8. **Activation behavior for existing schedules.** DB test with real-shaped rows (the 31 CP1 rows as fixture shapes, all Box 1): flag flip rewrites no `card_schedules` row; Box histogram is identical immediately after activation; each row moves to Box 2 only on its next Known and keeps its `due_at` until then. A card due in the past is not re-timed.
9. **Legacy / mobile compatibility.** Mobile batch endpoint contract tests unchanged and green with the flag on and off: four-grade input accepted, response shape identical, `reconciliationCursor`/idempotency semantics unchanged. Flag ON with legacy grades follows §3.2.
10. **Flag-off identical to v1.** (a) Differential test: for ≥ 10,000 `(schedule, grade, now)` triples the selector with the flag OFF returns bit-identical output to the current `scheduleReview` (the CP0 characterization tests stay unmodified and green). (b) SQL statement text for flag OFF is byte-identical to today's (snapshot). (c) Flag OFF works on a database without migration 0023.
11. **Rollback consequences, tested and documented.** DB test: write N answers under v2, turn the flag OFF, continue under v1: every row still satisfies `stability_days > 0` and `due_at` valid; Box never decreases at the switch; the next v1 interval equals `v1(stability stored by v2)`. Documented consequence (§7): cards keep the larger v2 stability; cards promoted by the Box-1 → Box-2 rule remain in Box 2 after rollback; no automatic demotion.
12. **State-space breadth meta-test.** A coverage assertion that the grid contains at least one point in each Box, each edge neighborhood, and the cap, so the sweep cannot silently shrink.
13. **Full suites.** `pnpm check` equivalent: prettier, eslint, tsc, full website and API suites against real Postgres, plus the existing CP0–CP5 tests unmodified.

## 5. Evidence required at the implementation checkpoint

Red-first for each new test; mutation checks (remove each clamp / assertion → at least one failure); exact-head CI (four required checks); the sweep and differential results as committed evidence; a staging browser pass on web with the flag ON and OFF (Known × several: Box 2 at the first Known, no two consecutive same-Box Knowns below Box 5; Unknown drops one Box); no Production change.

## 6. Activation plan (after the implementation PR is merged; each step needs owner approval)

1. **Staging only first:** restore a fresh Production-shaped dump on isolated staging; apply 0023 there; deploy the exact merged commit with `LEARNBOX_SCHEDULER_V2=false`; confirm identical behavior to v1 (differential + browser).
2. Turn `LEARNBOX_SCHEDULER_V2=true` on staging only; run the §4 DB suite against that database; browser pass; rollback rehearsal (§7).
3. **Production (separate gate, after the policy is settled):** fresh backup + restore verification; migration 0023; exact artifact provenance (image SHA = source SHA); enable flags incrementally, in order: `LEARNBOX_BINARY_REVIEW`, then the CP5 UI flags, then `LEARNBOX_SCHEDULER_V2` last and alone; after each flag, integrity checks (history fingerprint unchanged, `state` still written, `engine_version` stamps appear only after the flag).
4. Post-rollout: monitor Box-transition assertion failures (must be 0), review error rate, Box histogram drift, and the telemetry-only recall probe (§8).

## 7. Rollback plan

- **Flag off** (`LEARNBOX_SCHEDULER_V2=false`, restart): scheduling returns to v1 immediately. No migration revert, no data change, no history change.
- **What stays after rollback (documented, tested §4.11):** `engine_version = 2` stamps remain on events written while on (history is append-only); cards keep their stored stability, so some are in a higher Box and are reviewed later than v1 would have scheduled them (larger stability × v1 factors, no cap); no automatic demotion or recompute.
- **If a card must be returned to its v1 trajectory** (not planned): requires a separate owner-approved forward-only data fix, not part of the rollback.
- **Rollback trigger conditions:** any assertion failure in Box transitions, any increase in review write errors, an unexplained Box-histogram shift, or an owner decision.
- Existing assets stay untouched: `app/.env.bak-pre-p0-dsn`, image `rollback-pre-p0-dsn-5370578d187c`, the pre-v1.2.1 backup.

## 8. Recall probe — telemetry only

Optional, sampled (default off, separate flag), records `(user, card, box, due-lateness bucket, probe outcome)` into its own append-only table or event stream. It never writes `card_schedules`, never feeds the scheduler, never selects a policy. The scheduler code has no import path to the probe data (enforced by a dependency test). A future scheduler change needs a separate evidence checkpoint and an owner decision. The probe's table would need its own migration (not 0023) and its own gate; it is not part of CP7 implementation unless you approve it separately.

## 9. Open points for owner confirmation before CP7 starts

1. Legacy four-grade mapping with the flag on (§3.2): recommended default = historical projection.
2. `state` mapping (§3.3).
3. Whether the recall probe is built in CP7 or later (§8).
4. `LEARNBOX_SCHEDULER_V2` requires migration 0023 (for `engine_version`); confirm that the flag must fail closed (refuse to enable) when the column is absent.
