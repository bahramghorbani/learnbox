# LB-B35 CP6 — Scheduler / Progression Decision & Validation: pre-registration

Status: written BEFORE the CP6 grid was run. Evidence/decision checkpoint. **No scheduler is changed, built into
the product, or activated.** Production unchanged.

## 1. Question

Under the final binary model («بلد بودم» = known, «بلد نیستم» = unknown), can the learner-visible Box 1–5 progression
avoid long stalls (many consecutive successful recalls with no visible Box change) without abandoning sensible
spaced repetition — and what does it cost? Also: should Box transitions be an explicit scheduler invariant?

## 2. Fixed constraints (not under test)

Box 1–5 canonical; Learned = Box 4+; Mastered = Box 5; Unknown drops exactly one Box, Box 1 stays Box 1; Box-5 growth
capped at 180 days; no difficulty / lapse penalty / lateness input; `review_events` append-only; `state` still
written; mobile legacy four-grade compatibility intact. Box edges stay at stored `stability_days` 1 / 3 / 7 / 21.

## 3. Candidates (all with the G3-180 Box-5 rule; all with Unknown = exactly one Box down)

- `ENG-DROP` — the current selection (ENG-CLAMP + the A17 refinement approved in CP1): Known ×1.8, clamped to at most one Box.
- `GR-1.8` — ENG-DROP, plus a Known from Box 1 lifts the card to at least 1 day (enters Box 2).
- `GR-2.5` — as GR-1.8 with Known factor 2.5.
- `GR-3` — as GR-1.8 with Known factor 3 (every Known = +1 Box from a new card).
- `LAD-B` — the CP1 fixed ladder (1 / 3 / 7 / 21 days; Unknown = one Box down) as the strict reference.

`GR-2.2` is run only in the deterministic sweep (it behaves like GR-2.5). No further candidates are added after seeing results.

## 4. Metrics (fixed before running)

Deterministic (no memory model): Box and interval after each answer for scripted sequences; the first answer and day at
which each Box is reached; the longest run of Known answers with no Box change below Box 5 ("max stall").

Simulation (CP1 framework, unchanged learner/attendance models, 100 seeds, paired): K365 (modelled knowledge fraction);
reviews per learner-year (workload); share of Known answers that leave the Box unchanged; share of sessions in recovery
mode; share of introduced cards in Box 4+ / Box 5 at 90/180/365 days; mean retention at the moment of review; Box-5
mean interval and Box-5 retention at review; maximum interval; sensitivity to repeated Unknown (constant recall p = 0.5 … 0.95).

Structural: compatibility with existing `card_schedules` rows (shape, thresholds); historical replay impact on the
real owner dataset; rollback complexity.

## 5. Interpretation rules (declared limits)

1. The simulator's learner model multiplies half-life by a constant G per Known answer, which favours multiplicative
   schedulers and has no real-learner validation (the real dataset is 58 events from one user). **No result is evidence of
   pedagogical superiority.** A higher modelled K365 or lower workload is a statement about the model.
2. Faster Box progression necessarily means longer intervals earlier. Whether that is acceptable for real learners is
   unmeasured; the simulator reports the modelled retention cost only.
3. No candidate is selected here. If candidates materially change learner progression, the choice is the owner's.

## 6. Reproducing

`pnpm --filter @learnbox/learning-engine build`; in `tools/learning-sim`: `LB_EXTRA=1 node cp6-sweep.mjs`,
`LB_EXTRA=1 LB_IDS=... node run.mjs <out> 100`, `node cp6-report.mjs <grid.json>`, `node cp6-traces.mjs`, `node cp6-replay.mjs`.
