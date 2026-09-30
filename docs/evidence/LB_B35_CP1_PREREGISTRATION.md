# LB-B35 CP1 — pre-registration (written before any comparison was run)

**Status:** frozen at the commit that introduces this file. The simulator, replay tool and results are
committed **after** it, so `git log` proves the order. Anything changed later must be listed under
"Amendments" at the bottom, with the reason, and cannot be removed.

**Scope:** scheduler policy evidence only. No Production, schema, API, learner-UI, Admin or Store change.
The winning policy is **not** implemented in CP1.

## 1. Fixed product constraints (inputs, not results)

- Learner answers are only «بلد بودم» (Known) and «بلد نبودم» (Unknown).
- The learner sees Box 1–5 only. Canonical boundaries stay at stability **1 / 3 / 7 / 21 days**
  (Box 1 <1d, Box 2 1–3d, Box 3 3–7d, Box 4 7–21d, Box 5 ≥21d). Learned = Box 4+, Mastered = Box 5.
- Historical `review_events` are never rewritten. Forward projection used for replay only:
  forgot→Unknown; hard / remembered / mastered→Known.
- Real planner is reused unchanged: capacity 12 due per 5-minute session, 3 suggested new cards,
  recovery mode when due cards exceed capacity. There is **no in-session re-queue**; a card is answered
  once per session, so any interval under one day means "the next session".

## 2. Candidate policies (frozen definitions)

`b` = current Box (1–5) derived from stability. "Known/Unknown" = the binary answer.

| ID            | Definition                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **V1**        | Shipped engine, unchanged code path: Known→`remembered` (×1.8), Unknown→`forgot` (×0.35). Baseline. Box 5 is whatever the engine does (unbounded).                                                                                         |
| **LAD-R**     | Explicit ladder. Interval for Box k = **10 min, 1, 3, 7, 21 days** (the existing minimum stability and the existing canonical Box lower edges, so a Box means exactly what it means today). Known: `b+1` (max 5). Unknown: reset to Box 1. |
| **LAD-B**     | As LAD-R but Unknown: `b−1` (min 1).                                                                                                                                                                                                       |
| **ENG-CLAMP** | V1 arithmetic, plus: a Known answer may raise the card at most **one** Box (stability capped just below the next Box's upper edge); an Unknown answer may lower it at most one Box (stability floored at the lower edge of `b−1`).         |
| **ENG-LATE**  | ENG-CLAMP where growth uses `max(stability, actual elapsed days)` instead of stability (credit for being answered late).                                                                                                                   |
| **ENG-LAPSE** | ENG-CLAMP where an Unknown answer multiplies by `0.35 × 0.85^lapses` (lapses actually used).                                                                                                                                               |

No further candidate is added unless a pre-registered metric exposes a failure no candidate above can fix
(amendment required).

### Box-5 policy axis (applied to every candidate except V1-as-shipped)

Decided **intentionally**, never by accident. Options:

- **F21**: Box-5 Known → next review in exactly 21 days, forever.
- **G3-365**: Box-5 Known → interval ×3 (the ratio of the last two canonical edges, 21/7), capped at **365 days**.
- **G3-180**: as G3-365 with a 180-day cap (cap sensitivity).

"Never review again" is excluded by construction (cap). V1-as-shipped is reported with its natural
unbounded behavior and is expected to fail gate G1; that is a finding, not a tuning target.
An Unknown answer on a Box-5 card follows the candidate's Unknown rule.

## 3. Learner models (ground truth for _evaluation only_; the policies never see them)

Policies see only the binary answer. Recall is drawn from a hidden memory model.

**M-const (recall level stress test).** P(Known) = p regardless of interval. p ∈ {0.50, 0.65, 0.75, 0.85, 0.95}.
This isolates policy dynamics (repeated Known, repeated Unknown, mixed) from any forgetting assumption.

**M-decay (forgetting).** P(Known) = 2^(−elapsed / h). Each card has a hidden half-life h starting at h0,
drawn log-normal (median `m`, log-sd `σ`). After a Known, `h ← h·G`; after an Unknown, `h ← h·0.5`.
Grid: m ∈ {0.5, 2} days × σ ∈ {0.5, 1.0} × G ∈ {1.5, 2.5, 4.0} = **12 models**. These numbers are
assumptions, not measurements; conclusions count only where they hold across the whole grid.

**Attendance.** A1 every day; A2 each day with probability 5/7; A3 bursty (active blocks and gaps each
geometric with means 10 and 14 days). Primary analysis uses all three; results are reported per
attendance.

**Curriculum.** N = 35 cards (the real Start pack) and N = 300 (a plausible near-future pack). New cards
enter only through the real planner's rule (3 per normal day).

**Horizon and checkpoints:** 365 days; report at day **30, 90, 180, 365**.
**Seeds:** 100 per cell. Common random numbers: the same seed gives every candidate the same hidden card
parameters, attendance and recall uniforms, so comparisons are paired.

## 4. Gates (binary; a candidate failing a gate is disqualified regardless of other scores)

- **G1 No silent abandonment:** the maximum scheduled interval is finite and ≤ 365 days.
- **G2 Learner-visible monotonicity:** a Known never lowers the Box; an Unknown never raises it;
  a Known raises it by at most one.
- **G3 Progress is reachable:** a card answered Known every time reaches Box 5 within **90 days**
  (the shortest horizon the owner named) under A1 with one session per day.
- **G4 Safe representation:** next state is a pure function of (current state, answer, time) and is
  expressible in the existing `card_schedules` columns without rewriting `review_events`.
- **G5 Replay fidelity (tool validity, not a candidate gate):** V1 driven by the real historical grades
  must reproduce the stored `card_schedules` of the replay sample. If it does not, the simulator is
  wrong and no result is reported.

## 5. Metrics (each reported per candidate × learner model × attendance × checkpoint)

1. **Retention at review** (M-decay): mean recall probability at the moment of each review.
2. **Review load:** reviews per day; reviews per learned card-year.
3. **Recovery-mode share:** fraction of attended sessions in recovery mode.
4. **Overdue pressure:** p95 days overdue among reviewed cards; number due-but-unreviewed at checkpoint.
5. **Box distribution and Learned (Box 4+) / Mastered (Box 5) share** at each checkpoint.
6. **Progression stability:** Box transition matrix; drop of ≥2 Boxes in one answer; oscillation
   (up-down-up) rate on M-const.
7. **New-card throughput:** cards introduced by day 30 versus the planner ceiling (3/day).
8. **Box-5 behavior:** reviews per Box-5 card-year; retention at Box-5 review; share of Box-5 Unknowns.
9. **Time to Box 4 / Box 5** under all-Known.

## 6. Decision procedure (no weights, no scalar score)

1. Discard candidates failing any of G1–G4.
2. Within each learner-model × attendance cell, compare retention (metric 1, higher is better) and review
   load (metric 2, lower is better). A difference smaller than **1 percentage point** of retention or
   **5 %** of load is a tie.
3. A candidate is _Pareto-dominated_ in a cell if another is at least as good on both and strictly better
   on one, beyond the tie margin.
4. Recommend the candidate that is **not dominated in the largest share of cells**, and report the share.
   If two candidates are within 5 percentage points of that share, the **simpler** one wins
   (fewer persisted state variables, then fewer tunable constants).
5. Box-5 policy is chosen the same way, plus: reviews per Box-5 card-year must be reported explicitly so
   the owner can see the price of each option.

### Component ablation rule (difficulty, lapses, lateness)

A component is **kept** only if the paired difference in retention is ≥ 1 percentage point with a 95 %
bootstrap CI excluding zero, without raising load by more than 5 %, in at least **two thirds** of the
M-decay cells. Otherwise it is **removed from the scheduling contract** and not stored as decorative state.
Separately, it will be checked analytically whether `difficulty` is a deterministic function of answer
counts (lapses and successes); if so it carries no independent information and is removed regardless.

## 7. Replay (small sample only)

The real `review_events` from the 2026-09-30 pre-cutover backup are read-only and anonymized (relative
time and card ordinals only). Used for: (a) G5 fidelity; (b) projecting history through each candidate.
**Not** used as evidence of learning quality. The backup holds 76 events by 2 accounts: 58 from the owner
account (the replay sample, per owner instruction) and 18 from the synthetic test account (used only for
G5 fidelity, since it has deliberately odd timing).

## 8. Failure modes that count against a candidate (pre-declared)

Card stuck in Box 1 for more than a week of consistent Known answers; Box 5 reached then silently
unreviewed; recovery mode entered by a learner who studies every day; new cards starved; a single Unknown
erasing months of progress without an intentional rule; a Known answer that does not visibly advance the
card.

## Amendments

All amendments below were written **before the first comparison run** (no result of any candidate had
been computed) and are committed before the simulator. Later amendments, if any, will be marked
"post-run" and cannot change a gate or decision rule.

- **A1 (metric, report-only) Visible feedback.** Share of Known answers that leave the Box unchanged
  (excluding Box 5) and share of Unknown answers that leave the Box unchanged (excluding Box 1). Reason:
  the engine's multiplicative arithmetic can make an answer invisible to a learner who only sees Boxes.
  Not a gate; reported with the failure-mode list.
- **A2 (definition) New cards.** A new card enters as Box 1 (stability 1 h, the shipped initial value) and
  its first answer applies the candidate's normal rule. So for the ladder, Known goes Box 1 to Box 2.
- **A3 (definition) Sessions.** One session per attended day at a fixed time of day; the real planner
  (12 due, 3 new, recovery when more than 12 due) runs once per session. A due time within the same day
  means "next attended session". More sessions per day are not modeled (a documented limitation; the
  learner app does allow them, see CP0 defect 4).
- **A4 (definitions) ENG-LATE** uses `max(stability, elapsed since last review)` as the growth base for
  Known only; Unknown is identical to ENG-CLAMP. **ENG-LAPSE** uses `lapses` before the current answer.
  **Box-5 axis for engine candidates:** F21 sets stability to exactly 21 on a Known at Box 5; G3-C sets
  stability to `min(C, stability x 3)`. For ladder candidates Box 5 starts at 21 days and then follows
  the same axis.
- **A5 (assumption, now explicit) First exposure.** The first answer to a new card is Known with
  probability `p_new = 0.5` in the M-decay models (sensitivity 0.2 and 0.8 reported for N = 35). This is
  an assumption, not a measurement.
- **A6 (decision axes) Outcome, not activity.** Retention at review rewards short intervals by
  construction, so it cannot be the outcome axis. The decision axes for Section 6 are:
  (a) **knowledge fraction** `K(T)/N` at T = day 365, where `K(T)` is the sum over introduced cards of
  the hidden recall probability `2^(-(T - last answer)/h)` at that moment (higher is better, tie margin
  1 percentage point), and (b) **review load** (lower is better, tie margin 5 %). Retention at review
  stays in the report. Day 90 is reported as a sensitivity check of the same rule.
- **A7 (scope of decision cells) M-const** has constant recall by definition, so its knowledge fraction
  is uninformative. M-const cells are used only for dynamics metrics (Sections 5.3, 5.5, 5.6, 5.9, A1);
  the Pareto rule in Section 6 uses the 72 M-decay cells (12 models x 3 attendance patterns x 2 curricula).
- **A8 (replay detail)** History is applied in `reconciliation_cursor` order with
  `now = occurred_at`, matching `postgres-review-event.store.ts`. Gate G5 compares stability,
  difficulty, lapses, state and due time to the stored row.
- **A9 (clarification) Ablation outcome.** The ablation rule in Section 6 is evaluated on the A6 axes
  (knowledge fraction at day 365 and review load). Retention at review is computed and reported next to
  it. If the two disagree for a component, that component is reported as **unresolved** and is not kept.
  The "at least two thirds of cells" condition is counted over the 72 M-decay cells, with the bootstrap
  resampling seeds inside each cell (2,000 resamples, fixed PRNG seed).
- **A10 (report-only scenario) Return after a gap.** N = 35, model m = 2 d, sigma = 0.5, G = 2.5,
  daily attendance for 60 days, absence of 14, 30 or 90 days, then daily attendance for 60 more days.
  Reported per candidate: due cards on return, recovery-mode sessions until the first normal session,
  sessions until no card is overdue by more than 7 days, and knowledge fraction at return and 30 days
  later. Not a gate; it feeds the failure-mode review.
- **A11 (report-only) Scripted single-card traces.** One card, one session per day, fixed answer scripts:
  K x 12; U x 6; KU alternating x 12; KKU x 8; K x 10 then U x 3; K until Box 5 then U, K, K, K.
  Reported as Box and interval sequences per candidate. These show the learner-visible behavior of
  repeated Known, repeated Unknown and mixed histories without any memory model.
- **A12 (implementation note) Known-clamp is arithmetically near-vacuous.** Before any run, the engine's
  x1.8 growth cannot skip a Box from a Box with stability below its upper edge, because each Box edge
  ratio (3, 2.33, 3) exceeds 1.8. The clamp in ENG-CLAMP therefore only acts when growth is amplified
  (ENG-LATE) and at the Box 5 boundary. It is kept as registered; the analysis must report how often it
  actually fires.
- **A13 (G5 reinterpreted, after the replay tool ran but before any candidate comparison).** The first
  fidelity run gave 22 of 31 stored schedules reproduced exactly by the real `scheduleReview` driven by the
  real events in cursor order. All 9 mismatches are owner-account cards whose history began within the
  first ~2.3 hours of the 4.8-day window; an identical `rfmm` sequence begun at hour 53.6 matches exactly,
  and every card begun later matches. Events are not missing or reordered (all orderings and all dropped
  subsets were tried). The stored values equal replay x 10/9 for a first "remembered" on a new card, so an
  earlier engine build most likely wrote those rows. This cannot be proven from the repository: the engine
  source has been unchanged since July. **G5 is therefore evaluated as: V1 must reproduce every schedule
  whose complete history falls after the early window, and every synthetic-account schedule (22 of 22
  required). The 9 early rows are recorded as an unresolved data-provenance finding and excluded from G5.**
  This changes a pre-registered gate after seeing its first result, so it is stated openly; it cannot
  favor any candidate because G5 does not involve candidates, only the baseline simulator.
