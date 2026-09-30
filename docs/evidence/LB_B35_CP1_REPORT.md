# LB-B35 CP1 — scheduler simulation, replay and policy evidence

**Status:** CP1 complete, for owner review. **Nothing here changes Production, schema, API, learner UI, Admin
or Store, and no scheduler is implemented.** All tooling is scratch code under `tools/learning-sim/`;
the only input from Production is a read-only copy of backup rows (no identifiers in committed output).

Read order: this file (conclusions) → `LB_B35_CP1_PREREGISTRATION.md` (criteria, candidates, amendments
A1–A17, frozen before results) → `cp1/` (raw outputs and hashes).

## 1. What was pre-registered, and what happened to it

Criteria, candidates, learner models and the decision procedure were committed (`90fc42a`) before any
simulator existed. Four things happened afterwards, all disclosed as amendments in the pre-registration:

- **A13** — replay fidelity (G5): V1 reproduces 22 of 31 stored schedules exactly; the 9 misses are all
  owner cards first answered in the first ~2.3 h of the window and come out exactly 10/9 higher in
  storage, which points to an earlier engine build that cannot be proven from the repository. G5 was
  re-scoped to "all later histories" (22 of 22 pass). **Unresolved data-provenance finding.**
- **A15** — the pre-registered learner model has an absorbing state (half-life halves after each Unknown
  with no floor, so a card can become unlearnable: knowledge 0.000 in one model). That is a flaw in the
  _simulated learner_, not in any scheduler. I added a floor (a card is never less learnable than on first
  exposure) and **report both variants**. I had already seen the `orig` ranking when I made this change,
  so the correction could be biased; both results are shown so you can check.
- **A16** — review load was nearly identical everywhere in `orig` because the planner's 12-card cap
  saturates. A report-only grid with the cap removed tests whether conclusions depend on the planner.
- **A17** — one post-hoc candidate variant (`ENG-DROP`) after seeing a behavior in `ENG-CLAMP`; see §5.

## 2. Candidates (definitions in the pre-registration §3)

- **V1** — the shipped engine with Known→`remembered`, Unknown→`forgot`. Baseline. Real `scheduleReview`
  from the built package, not a re-implementation.
- **LAD-R** — explicit ladder, Box interval 10 min / 1 / 3 / 7 / 21 days; Known = +1 Box; Unknown = Box 1.
- **LAD-B** — same ladder; Unknown = −1 Box.
- **ENG-CLAMP** — engine factors (×1.8 Known, ×0.35 Unknown) clamped so one answer moves at most one Box.
- **ENG-LATE / ENG-LAPSE** — ENG-CLAMP plus lateness, or plus a lapse penalty, to test those components.
- **Box-5 axis** (applies to every candidate except V1): **F21** = 21 days forever; **G3-C** = ×3 growth
  capped at C days (C = 365 or 180).

## 3. Method in one paragraph

Deterministic simulator (seeded, paired across candidates, bit-identical on re-run: grid sha256 in
`cp1/grid-sha256.txt`), real `createDailySessionPlan` planner (12 due + 3 new, recovery mode). 100 seeds ×
(12 decay learner models + 5 constant-recall levels) × 3 attendance patterns (A1 daily, A2 ~5 days/week,
A3 bursty with gaps) × two curricula (35 and 300 cards). Knowledge K = fraction of the curriculum the
simulated learner would recall today. A difference under 1 pp of K or 5 % of review load is a tie. No
weights, no scalar score.

## 4. Results

### 4.1 Gates (mechanical, `cp1/analysis-floor.json`)

- **V1 fails G1** (bounded interval). By definition unbounded; observed **281 days** in simulation and
  growing ×1.8 per Known. It is the only candidate that fails any gate.
- Every other candidate passes: a Known never lowers a Box or skips one, an Unknown never raises one (0
  violations over the constant-recall transition matrices), all-Known reaches Box 5 by day 90 (ladder day
  11, ENG-LATE day 30, engine day 39), all fields read exist in `card_schedules`.

### 4.2 Headline numbers (floor variant, 35 cards, daily attendance, mean of 12 learner models)

| candidate        | K30  | K90  | K180 | K365 | reviews d365 | recovery-mode share | Box 4+ | Box 5 |
| ---------------- | ---- | ---- | ---- | ---- | ------------ | ------------------- | ------ | ----- |
| V1 (baseline)    | .670 | .857 | .895 | .916 | 1550         | 13.3 %              | 93.0 % | 92.3% |
| LAD-R / G3-365   | .660 | .716 | .767 | .792 | 1677         | 18.9 %              | 82.0 % | 80.9% |
| LAD-B / G3-365   | .640 | .658 | .694 | .712 | 1934         | 20.7 %              | 75.9 % | 71.1% |
| ENG-CLAMP/G3-365 | .670 | .857 | .889 | .894 | 1515         | 13.1 %              | 93.0 % | 92.3% |
| ENG-CLAMP/G3-180 | .670 | .857 | .889 | .906 | 1533         | 13.1 %              | 93.0 % | 92.3% |
| ENG-CLAMP/F21    | .670 | .859 | .902 | .933 | 1863         | 14.2 %              | 92.9 % | 92.2% |
| ENG-LATE/G3-365  | .631 | .691 | .705 | .702 | 2137         | 24.6 %              | 71.2 % | 66.6% |

Attendance A2 and A3, the 300-card curriculum, the `orig` model and the uncapped grid are in
`cp1/results-tables.md`. **The ordering is the same in all of them**: ENG-CLAMP ≈ V1 > LAD-R > LAD-B >
ENG-LATE. Absolute levels move a lot with the learner model (K365 from 0.23 to 0.97), so treat them as
relative, never as predictions.

### 4.3 Decision procedure (pre-registered)

After ablation (§4.5) the pool is {LAD-R, LAD-B, ENG-CLAMP} × Box-5 axes. Share of the 72 learner-model ×
attendance × curriculum cells where a candidate is **not Pareto-dominated** on knowledge vs load:

| variant                          | ENG-CLAMP | LAD-R | LAD-B |
| -------------------------------- | --------- | ----- | ----- |
| floor (A15)                      | **0.569** | 0.444 | 0.417 |
| orig (pre-registered model)      | **0.903** | 0.292 | 0.264 |
| floor, planner cap removed (A16) | **0.583** | 0.500 | 0.417 |

The ENG-CLAMP lead exceeds the 5-point "simpler wins" margin in every variant, so the tie-break does not
apply. **The lead is narrow in the two defensible variants (12 and 8 points), and ENG-CLAMP is _not_
dominant: see the constant-recall result in §4.4.**

### 4.4 Behavior at different recall levels (constant recall, report-only, `cp1/results-tables.md`)

Constant recall means practice does not strengthen memory, which is unrealistic, but it exposes how each
scheduler behaves for a learner who simply remembers less:

- At recall 0.85 or higher all candidates are fine (recovery share 0–5 %).
- At **0.65**: V1/ENG-CLAMP spend **40–41 %** of days in recovery mode; the ladder **2 %**.
- At **0.50**: V1/ENG-CLAMP **80 %** (4,347 reviews/year, i.e. the planner cap every day); LAD-R 17 %.
- Reason: Unknown multiplies stability by 0.35, so alternating histories stay in Box 1 with 10–100 minute
  intervals (`cp1/traces.txt`: `KU×12` never leaves Box 1 under the engine; under the ladder every Known
  reaches Box 2).
- Among the 15 constant-recall cells LAD-B is the only non-dominated family. This is the clearest failure
  mode of the engine family, and it is invisible in the decay-model ranking.

### 4.5 Do difficulty, lapses and lateness belong in the scheduling contract?

- **`difficulty`: remove.** Exhaustive check over 8,388,607 answer sequences: `difficulty = 5 + 0.5·lapses
− 0.1·successes` exactly, apart from the clamp at 10 that needs 11 or more lapses. It is written on
  every review and read by nothing (3 occurrences in the engine: type, write, none in an interval).
  Carries no independent information.
- **Lapses (penalty 0.85^N): remove.** Paired difference in K365 vs ENG-CLAMP: mean +0.0003 to +0.0031,
  passing the pre-registered threshold in 2/72 and 10/72 cells (needed 48). Under constant recall 0.65 it
  is harmful (recovery 87 % vs 40 %). The `lapses` counter itself is useful as a statistic, not as an input.
- **Lateness (interval from elapsed time): remove.** Mean K365 **−0.13**, worse in 61–62 of 72 cells. This
  tests one design (growth from the elapsed interval); a better-designed lateness rule is not excluded, but
  the evidence does not justify carrying one.

### 4.6 Box 5: what happens after mastery

- **F21 (every 21 days forever)**: 16.6 reviews per Box-5 card-year and +23 % total load vs G3, for +3.9
  pp K365. Retention at a Box-5 review 0.99.
- **G3-365** (×3 growth: 21→63→189→365 days): 2.7 reviews per card-year, retention at review 0.95.
- **G3-180**: indistinguishable from G3-365 in the decision procedure (same non-dominated share); K365 is
  +1.2 pp higher at +1 % load.
- **Unbounded V1**: 4.05 reviews per card-year and intervals past 281 days, with no rule saying so.
- Both G3 options make "mastered" an intentional rule: a mastered card is never more than C days away, and
  a single Unknown moves it down. **The cap C is a product decision the data cannot make** (see §7).

### 4.7 Missed and late reviews, return after absence (`cp1/gap.txt`)

- The engine family, with a strong learner, returns after a 14/30/90-day gap with K 1.000/1.000/0.999, with
  19/34/35 cards due and 1–2 recovery sessions. The ladder returns with K 0.93/0.89/0.79, and fewer cards due
  on the short gaps (4–5 vs 19–34) because its Box 5 cards have shorter intervals.
- Every candidate clears the backlog (oldest overdue ≤ 7 days) in 1.7–4 sessions.
- **For a weak learner this scenario is uninformative** (`cp1/gap-weak.txt`): all candidates are
  saturated by recovery mode before and after the gap, so it says nothing about return behavior there.

### 4.8 Progression stability and new-card interaction

- Known answers that change no Box: **ladder 0 %**, engine family **64–80 %**. A learner pressing
  «بلد بودم» under the engine sees the card stay in Box 1 through five consecutive answers (`K×12` trace);
  under the ladder it moves up every time.
- Box reversals per Box change: 0.39–0.57 across candidates, no consistent ordering.
- New cards (300-card curriculum, floor): by day 30 the ladder has introduced 41 cards vs 27 for the
  engine. By day 365 it is 167 vs 167–172, so nothing is starved in the end. In `orig` every candidate
  stalls at about 30 introduced cards because recovery mode blocks new cards.

### 4.9 Replay of real history (58 owner events, 16 cards, 4.78 days — a small sample)

Not evidence of learning quality. It shows where the owner's real answers would have placed the cards
(historical grades mapped forgot→Unknown; hard/remembered/mastered→Known):

- V1 and ENG-CLAMP: all 16 cards in Box 1 (as stored today).
- LAD-R: Box 1: 1, Box 2: 3, Box 3: 11, Box 4: 1. LAD-B: 1 / 2 / 11 / 2. ENG-LATE: 3 / 11 / 2 / 0.
- So after five days of real use the shipped scheduler shows **no** card beyond Box 1 while the ladder
  shows most in Box 3. That is a learner-perception difference independent of the simulation models.

## 5. Post-hoc observation (A17, report-only)

Under ENG-CLAMP an Unknown from deep Box 5 can leave the card in Box 5 (stability 365 × 0.35 = 128 days).
A one-line variant (`ENG-DROP`: Unknown always lowers the Box by exactly one) gives the same K365 and load to
within 0.001 and 0.1 % (`cp1/ablation-drop.txt`), and removes the case. This was found after viewing
results, so it is reported as a refinement, not a pre-registered finding.

## 6. Recommendation

**Policy: ENG-CLAMP with Box-5 growth ×3 capped, with Unknown = exactly one Box down; no difficulty, no
lapse penalty, no lateness input. Persisted scheduling state: `stability_days`, `due_at`, `last_reviewed_at`
(and `lapses` as a counter only).**

Evidence for: is not dominated in more cells than either ladder in every decay variant (by 8–12 points in the two defensible variants); bounded (passes G1, unlike V1);
lands within 2 pp of V1's K365 (.894 vs .916) without V1's unbounded interval; the three decorative fields go away.

**Honest weaknesses — the recommendation is conditional on the owner accepting them:**

1. **Weak-recall learners are badly served** (§4.4): at recall 0.65 or lower the engine family lives in
   recovery mode; the ladder does not. The ladder is the safer policy if weak recall is common.
2. **Known answers mostly do not move the Box** (§4.8, §4.9). This conflicts with the "simple, visible Box
   1–5" goal. The ladder satisfies it by construction, at a cost of 10 pp (LAD-R) to 18 pp (LAD-B) of K365 in the decay model.
3. **The learner model favors multiplicative schedulers.** My decay model grows half-life multiplicatively
   per Known (a stand-in for the same assumption the engine uses). Fixed-interval ladders would be
   penalized by construction. The K advantage of the engine is therefore less strong than the table
   suggests; I cannot quantify the bias.
4. Both constant-recall and replay results point the opposite way from the decay results. The data does not
   support a confident "engine wins" claim, only "engine wins under this model".

**If you weigh points 1–2 above the K advantage, LAD-B with the same Box-5 rule is the defensible
alternative** (Known = +1 Box visibly; Unknown = −1 Box; K365 lower by about 18 pp in the decay model but
steady and cheapest under weak recall). A hybrid (ladder for Boxes 1–3, engine for 4–5) was not tested: no
strong technical reason emerged that it would beat both, and adding it would be over-engineering.

## 7. Unresolved assumptions and owner decisions

1. **Policy family**: engine-based (recommended by the registered procedure) or ladder-based (simpler
   mental model, better under weak recall). **This is the main decision.**
2. **Box-5 cap**: 180 or 365 days (data: +1.2 pp K for 180 at +1 % load; a policy call).
3. **Unknown from Box 5**: one Box down (recommended) vs reset to Box 1.
4. **Removal of difficulty / lapse penalty / lateness from the scheduling contract.** Columns stay in the
   database (no destructive change); only their scheduler use ends.
5. **Learner model validity**: no real-learner retention data exists (58 events, one real user). A
   post-launch measurement plan (e.g. optional 1-in-N recall probes) would be needed to validate any pick.
6. **Data provenance**: the 9 early owner schedules that V1 replay does not reproduce (A13) remain
   unexplained.
7. **Carried to LB-B34 only**: Admin user-detail selects `review_events.rating` and `created_at`; the table
   has `grade` and `occurred_at`. No Admin work was started.

## 8. Reproducing

`pnpm --filter @learnbox/learning-engine build`, then in `tools/learning-sim`: `node selfcheck.mjs`;
`LB_VARIANT={orig|floor|floor-uncapped} node run.mjs <outdir> 100`; `node analyze.mjs <grid.json>`;
`node pool.mjs <grid.json>`; `node report.mjs ...`; `node traces.mjs`; `node gap.mjs 100 [strong|weak]`;
`node difficulty-check.mjs`; `node replay.mjs <review_events.copy> <card_schedules.copy>`. Grid hashes are
in `cp1/grid-sha256.txt`; the `orig` grid re-ran bit-identically. The backup-derived input files are not
committed.
