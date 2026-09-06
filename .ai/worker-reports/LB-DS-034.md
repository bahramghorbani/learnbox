# LB-DS-034 — Learner Web review-session focus recovery

- Status: review_requested
- Base: `2e2d7a36e4f2abf6ab5ed4a04edadcfdda15c1a8`
- Branch: `fix/web-review-session-focus`
- Risk: routine Web accessibility

## Problem

Review-stage controls unmount on start, flip, next-card, completion and return transitions. Without
focus recovery, keyboard and screen-reader users can fall back to the document body and must restart
navigation from the page top.

## Scoped correction

The learner Web screen keeps refs to existing stage controls. An effect moves focus only when the
previously active element no longer belongs to the document: front flip control, back return control,
completion heading or Today review CTA. Stable-stage focus is not stolen. No new interactive control,
route, API, flag, auth, schema, migration, seed, content, payment, deployment, publication or
Production state is introduced.

## TDD evidence

1. RED: focused flow test on the previous implementation observed no active review control after
   starting the session; the start control unmounted and focus fell away.
2. GREEN: the same test passes through start, both flip directions, next-card grade, completion and
   return-to-Today focus targets.

## Verification

- Focused focus-flow test: passed after RED→GREEN.
- Full Website suite: 226/226 passed across 35 files.
- Website typecheck and production build: passed.
- Prettier, queue/documentation/continuity/dashboard validators and `git diff --check`: passed.
- Secret scan: clean.
- Local browser keyboard smoke: passed through start → front flip → back return → next-card grade;
  focus remained on the active stage control. Desktop overflow was absent. Local server was stopped.

## Pending merge

Open a Draft PR, verify its CI, then reconcile this report and canonical status after merge.
