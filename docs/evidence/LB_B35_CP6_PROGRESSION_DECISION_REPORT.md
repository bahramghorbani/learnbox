# LB-B35 CP6 — Scheduler / Progression Decision & Validation (decision report)

Status: **evidence + decision report, with the owner decisions of 2026-10-01 recorded in §8. Nothing is implemented, built into the product, or activated.** Scheduler v1 is
unchanged. No Production, Admin or Store change. Pre-registration: `LB_B35_CP6_PREREGISTRATION.md` (committed before the grid was run).
Raw outputs: `docs/evidence/cp6/` (`traces.txt`, `sweep.txt`, `continuous.txt`, `invariants.txt`, `compat.txt`, `tables.md`; grid sha256 in `grid-sha256.txt`).

## 0. Read this first: what is measured and what is modelled

- **Deterministic (exact, no model):** scripted Box/interval traces, Box-transition invariants over 4,036 stability points, compatibility with the real `card_schedules` rows. These are facts about the algorithms.
- **Simulated (model-dependent):** knowledge fraction K, workload, recovery-mode share, retention. The learner model multiplies memory half-life by a constant G per Known answer. It favours multiplicative schedulers, has no real-learner validation, and the only real dataset is 58 events from one user. **Nothing here shows pedagogical superiority of any candidate.** A lower modelled K for a faster ladder says "under this model, longer early intervals cost recall", not "it is worse for real learners".

## 1. Finding that needs your attention regardless of which option you pick

**ENG-CLAMP as originally selected (D1) does not satisfy the approved rule "Unknown drops exactly one Box".** The invariant sweep found 742 of 4,036 stability points where an Unknown leaves the card in the same Box (e.g. an Unknown from Box 5 at the 180-day cap gives 63 d, which is still Box 5). This is the CP1 post-hoc A17 case. **ENG-DROP** (same policy plus "Unknown = exactly one Box down") closes it with 0 violations, and CP1 measured it as equal in K and load. Every candidate below therefore includes the ENG-DROP Unknown rule. Plain ENG-CLAMP is not a viable option under the constraints you restated.

## 2. Current policy under the binary model (ENG-DROP/180; Known = ×1.8, at most +1 Box, Box 5 ×3 capped at 180 d)

Once-a-day sessions, on-time answers (`traces.txt`):

- **Known ×14 from new:** B1 B1 B1 B1 B1 → **B2 at answer 6** (day 5) → B2 → B3 (#8, day 10) → B4 (#9, day 15) → B4 → **B5 (#11, day 39)** → 80 d → 180 d, then 180 d forever. Intervals: 108 min, 194 min, 5.8 h, 10.5 h, 19 h, 1.4 d, 2.6 d, 4.6 d, 8.3 d, 15 d, 27 d, 80 d, 180 d.
- **Max stall: 5 consecutive Known answers in Box 1**, then 1 each in Box 2 and Box 4. In the first 12 answers 8 leave the visible Box unchanged; across the simulated year 68% of Known answers below Box 5 change nothing visible.
- **Unknown from Box 2/3/4/5:** next interval 714 min / 1.6 d / 3 d / 21 d; the first Known afterwards gives B1 (21 h) / B2 (2.9 d) / B3 (5.4 d) / **B5 (38 d)**.
- **KU alternating:** the card never leaves Box 1 and the interval collapses to 10–18 min.
- **Long-term:** Box 5 reaches the 180-day cap at the 13th Known answer.

## 3. Candidates (all with Unknown = exactly one Box down, Box 1 stays, Box 5 cap 180 d)

- **A — ENG-DROP (current):** Known ×1.8.
- **B — GR-1.8:** ENG-DROP + a Known from Box 1 enters Box 2 (≥ 1 day). Same ×1.8 growth afterwards.
- **C — GR-2.5:** as B with Known ×2.5.
- **D — GR-3:** as B with Known ×3 (every Known from Box 1–4 = +1 Box).
- **E — LAD-B (CP1 ladder, reference):** fixed 1 / 3 / 7 / 21 d, Unknown = −1 Box.
- (GR-2.2 sits between B and C; shown in `sweep.txt` only.)

### 3.1 Visible progression (exact)

Known ×N from new, once-a-day sessions. "Stall" = longest run of Known answers with no Box change below Box 5.

- **A:** B2 at #6, B3 #8, B4 #9, B5 #11 (day 39). Max stall 5. Known leaving the Box unchanged in simulation: 68%.
- **B:** B2 at #1, B3 #3 (day 3), B4 #5 (day 13), B5 #7 (day 43). **Max stall 1.** Unchanged: 43%.
- **C:** B2 #1, B3 #3, B4 #4, B5 #5 (day 27). Max stall 1. Unchanged: 29%.
- **D:** B2 #1, B3 #2 (day 1), B4 #3 (day 4), B5 #4 (day 13). **Max stall 0.** Unchanged: 0%.
- **E:** B2 #1, B3 #2, B4 #3, B5 #4 (day 11). Max stall 0. Unchanged: 0%.

### 3.2 Review intervals after consecutive Known (continuous time, learner answers exactly when due)

- **A:** 1.8 h, 3.2 h, 5.8 h, 10.5 h, 18.9 h … (a new card is reviewed five times inside its first two days)
- **B:** 1 d, 1.8 d, 3.2 d, 5.8 d, 10.5 d
- **C:** 1 d, 2.5 d, 6.3 d, 15.6 d, 39.1 d
- **D:** 1 d, 3 d, 9 d, 27 d, 81 d
- **E:** 1 d, 3 d, 7 d, 21 d, 63 d

### 3.3 Weak recall and recovery (exact traces)

- **Known ×6, Unknown, Known ×6:** A: the card (in Box 2) drops to B1 and needs 5 more Known answers to reach Box 4. B: from Box 4, drops to B3 (6.6 d), then B4, then B5 within 2 answers. C/D: back to B4 (21 d) → **B5 on the next Known** (52 d / 63 d). **Faster candidates re-promote a dropped card within one or two answers because the interval formula is unchanged; this is a trade-off, not a bug.**
- **Unknown from Box 5:** all candidates give B4 at 21 d; the next Known gives B5 at 38 d (A, B), 52 d (C), 63 d (D) — i.e. the learner is back at "Mastered" after one answer.
- **Repeated Unknown from new:** identical in all candidates (21 min, then 10 min). Learners who fail repeatedly are served the same.
- **Alternating K/U:** A stays in B1 with 10–18 min gaps. B/C/D alternate B2↔B1 with a 1-day gap in B2 (D: gaps grow 1.0 → 1.4 d). The Box flips back and forth (reversals per Box change ≈ 0.32 vs 0.07 for A), which learners will see as "yo-yo" — a UX cost of faster visible progress.

### 3.4 Workload, long-term growth, sensitivity (simulation; A2 = 5 of 7 days attendance, 35 cards, 12 learner models × 100 seeds, paired, 95% CI)

- **Reviews in a year:** all candidates within about ±15 of ENG-DROP's 2,949 (inside the CI). **No candidate changes total workload materially.** It shifts earlier: reviews by day 90 fall by 10 (B), 15 (C), 16 (D), 19 (E).
- **Modelled knowledge at day 365 (K365):** A 0.308; B 0.242 (−0.067); C 0.198 (−0.110); D 0.170 (−0.138); E 0.196 (−0.112). **Every faster candidate scores lower under this model; the cost grows with the speed.** Same ordering under attendance A1, A3 and N = 300. This is the model's retention penalty for longer early intervals, and the model is biased toward the engine (CP1 §6).
- **Retention at the moment of review:** Box 5 average 0.98 (A), 0.96 (B), 0.90 (C), 0.67 (D), 0.71 (E). D and E let Box 5 cards be reviewed when the model says about one in three has been forgotten.
- **Recovery-mode share:** A 70%, B 76%, C 76%, D 78%, E 76% in this stressed simulation (many cards, unrealistically strong forgetting). Every faster candidate has a higher recovery share than A (by 6–8 points); the baseline is high for all.
- **Weak-recall sensitivity (constant recall p):** at p = 0.5 A is in recovery 73% of days and has 2% of cards in Box 4+ at day 365; B/C/D/E reach 50% / 86% / 90% / 91% in Box 4+. At p ≥ 0.75 all candidates converge. **The current engine makes weak learners look worst-off visibly; the ladder-like candidates give them visible progress faster.** Whether that is good (motivation) or bad (false sense of "learned" at 50% recall) is a product call.
- **Box 5 growth:** all candidates share the ×3 growth capped at 180 d; maximum interval is 180 d in all runs. Time to the cap: A 13 answers, B 9, C 7, D 6, E 6.

### 3.5 Compatibility with existing `card_schedules`

- **Shape:** all candidates read and write the same three scheduling columns (`stability_days`, `due_at`, `last_reviewed_at`), with `lapses` as a counter only. No schema change, no migration beyond 0023.
- **No row moves Box at activation:** Box is derived from stored stability with the same 1 / 3 / 7 / 21 d edges.
- **The first answer after activation behaves differently.** On the 31 real rows (all in Box 1): A raises 0 of 31 on the next Known; B, C, D, E raise **31 of 31** to Box 2 (stability from about 0.01–0.4 d to ≥ 1 d). That is a one-time visible jump at the first Known for any card currently below 1 day.
- **Existing intervals are not recomputed.** Rows already due keep their `due_at`; the change only affects the next answer.

### 3.6 Historical replay impact

- `review_events` is append-only and unchanged by any candidate. The `grade` column keeps its shadow value; `response` and `engine_version` (migration 0023) identify which scheduler produced each schedule write.
- **Replay does not reproduce the current schedules even today:** 22 of 31 real cards match v1.2.1 exactly; 9 do not (CP1 A13, unexplained). So no candidate can claim "reproduces history", including A.
- Owner dataset projected through each candidate (58 events, 16 cards, 4.8 days): A leaves all 16 in Box 1; B puts 14 in Box 2; C 13 in Box 2; D 11 in Box 3; E 11 in Box 3. This shows how existing activity would be _seen_, not how well it was learned.

### 3.7 Rollback complexity

- All candidates are a pure function `(schedule, response, now) → schedule`, behind one flag (`LEARNBOX_SCHEDULER_V2` / `engine_version`). Rolling back = flag off; rows written under the new policy are still valid v1 rows (stability and due date), because v1 reads only those fields. **Complexity is the same for A–E.**
- **Candidate-specific risk:** the faster ones write larger stabilities, so after rollback a card carries a larger stability than v1 would have given it and is reviewed later than v1 would have scheduled it. That is a side-effect of speed, not of the flag.

## 4. Should Box be an explicit scheduler invariant?

**Yes, recommended under every option.** Today Box is a post-hoc function of stability, and nothing in `scheduleReview` expresses "Known never lowers a Box, raises at most one, Unknown lowers exactly one". The sweep shows plain ENG-CLAMP violates one of these in 742/4,036 states, which the derived approach would not have caught. Proposal (no implementation yet): the scheduler computes the target Box first, then derives stability from a per-Box interval; the one-Box rules and the 180-day cap become compile-time/test-time invariants (the sweep in `cp6-invariants.mjs` becomes a permanent test). The existing thresholds and columns stay, so this is compatible with `card_schedules` and with mobile.

## 5. Options for your decision

- **Option 1 — Keep ENG-DROP (A).** Smallest change, highest modelled knowledge, lowest retention risk. Accept: up to 5 consecutive Known answers with no visible Box change; a card in Box 1 for the first 5 days. **Does not meet your stated invariant** of no long visible stalls.
- **Option 2 — GR-1.8 (B).** Meets "no long stall" (max 1), keeps the engine's interval growth and Box-5 retention (0.96) after the first Known, and costs 0.067 modelled K365. Same ×1.8 growth as today, started from 1 day instead of 1 hour. Visible yo-yo on mixed answers rises. **My reading: the smallest change that satisfies the invariant.**
- **Option 3 — GR-2.5 (C).** Faster visible progress (Box 5 by 5 Known / day 27); modelled K365 −0.110; Box-5 retention 0.90.
- **Option 4 — GR-3 or the ladder (D/E).** Every Known is +1 Box (Box 5 by 4 Known); the simplest learner model and the best "weak-recall" visible progress; **modelled K365 −0.14, and Box-5 retention at review falls to about 0.67–0.71.** This is the largest departure from spaced-repetition behaviour.
- **Option 5 — Option 2 now, measure, revisit.** Ship B (or A) with a post-launch retention probe (e.g. 1-in-N optional recall checks) before choosing a faster option. The model cannot settle this; real data can.

Decisions I need from you in any case:

1. A, B, C, D or E (the progression itself).
2. Confirm the ENG-DROP Unknown rule replaces plain ENG-CLAMP (§1).
3. Adopt Box as an explicit invariant (§4): yes/no.
4. Accept the one-time jump of existing Box-1 cards at their first Known after activation (§3.5) for options B–E.

## 6. Recorded for later (not part of CP6 decision)

Production rollout, to be executed only after the learning policy is settled: fresh pre-migration backup + restore verification; migration 0023; exact artifact provenance (source SHA = image SHA); flags enabled incrementally with per-flag rollback; post-rollout integrity checks (history fingerprint, `state` still written, `engine_version` stamps). No Production action is taken now.

## 7. Limitations

- Learner model is untested against real retention data; K, retention and recovery share are model outputs only.
- One real learner (58 events); the 9 unexplained replay mismatches are unresolved.
- Attendance patterns A1–A3 are synthetic; the simulated year has up to 300 cards per learner (a stress case) and 35 in the main tables.
- Candidates were fixed before the grid ran; the sweep for GR-2.2 is deterministic only.
- No UI or API was built; the below-fold button and mobile findings are unchanged.

## 8. Owner decisions (2026-10-01)

1. **Selected: Option 2, GR-1.8.** Known ×1.8; a Known from a new/Box-1 card lifts it to at least 1 day (Box 2); at most one Box up per Known.
2. **ENG-DROP replaces ENG-CLAMP.** An Unknown moves a card exactly one Box down from Boxes 2–5; Box 1 stays Box 1.
3. **Box transitions become an explicit scheduler invariant.** The scheduler must not rely only on deriving Box from stability thresholds after scheduling.
4. **Forward-only activation.** An existing Box-1 card moves to Box 2 on its first future Known. No existing schedule and no review history is rewritten at activation.
5. Unchanged: Learned = Box 4+, Mastered = Box 5, Box-5 growth capped at 180 days, difficulty / lapse penalty / lateness are not scheduler inputs, `card_schedules.state` is still written, mobile legacy compatibility is kept.
6. **Post-launch recall probe: telemetry only.** It must never tune, select or change scheduler policy. Any future scheduler change needs its own evidence checkpoint and an owner decision.

### Evidence that must stay attached to this decision

- **GR-1.8 scored lower than ENG-DROP in the simulation.** Modelled day-365 knowledge: 0.242 vs 0.308 (Δ −0.067, 95% CI ±0.006; attendance A2, 35 cards, 12 learner models × 100 seeds); the same ordering held under attendance A1 and A3 and with 300 cards (`cp6/tables.md`). Box-5 retention at review was 0.96 vs 0.98.
- **No real learner-retention dataset establishes that GR-1.8 (or any option) is pedagogically better.** The learner model is an assumption that favours multiplicative schedulers; the only real data is 58 events from one user. The selection is an owner product decision (visible progress), made with this cost known. The simulation is decision support only.
