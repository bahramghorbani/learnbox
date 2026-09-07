# LB-DS-038 — Learner Web Progress local-data truthfulness

- Status: accepted
- Base: `b46867c57daf2d4657b2573411c50f015fc4d221`
- Branch: `fix/web-progress-local-truth`
- Head commit: `93bf1de970c18a1b0b696ed450d72231bda76e56`
- Merge commit: `506b334098cebc71e15537c6758882b8fe52527a` (PR #229)
- Risk: routine Web UI truthfulness and accessibility

## Outcome

- Labels the current daily count and streak as browser/device-local instead of leaving their provenance implicit.
- Passes the existing local pending-review count into Progress and announces unacknowledged answers only when the count is non-zero.
- Explicitly states that server weekly history is not active; no chart or server-derived history is invented.
- Preserves the calm zero state, review CTA, navigation and existing local persistence behavior.

## TDD evidence

1. Component and learner-journey assertions were added before production changes.
2. After workspace dependencies were built, the focused run failed on the three new truthfulness expectations while 15 existing focused assertions passed.
3. The minimal prop wiring and Progress copy/state rendering made all focused tests pass 18/18.

## Verification

- Focused Progress/core-flow tests: 18/18 passed.
- Full Website suite: 229/229 passed across 35 files.
- Website typecheck: passed.
- Website production build: passed.
- Prettier on changed implementation/tests: passed.
- Browser smoke: desktop and 390×844 at 200% root text scaling; RTL; local-source and inactive-server-history text present; no horizontal overflow.
- `git diff --check`: passed after the implementation and documentation updates.
- GitHub CI: all seven checks passed at final head `93bf1de` (`quality`, `secrets`, `mobile`,
  `production-stack`, Vercel Preview Comments and both Vercel deployment checks).
- Independent DeepSeek V4 Flash review: PASS; no blocking findings. The
  reviewer independently reran the focused 18/18 tests and verified the exact base, head, scope,
  local/server truth boundary and accessibility semantics.

## Unchanged gates

No API, route, authentication, sync activation/client composition, schema, migration, seed, content, payment, deployment, publication or Production state changed. The screen does not claim server acknowledgement or server-backed analytics.

## Acceptance

Accepted and merged in PR #229 at `506b334` after all seven checks passed at final head
`93bf1de`. `origin/main` ancestry was verified after the merge. The Progress surface remains
device-local and the server-backed history/sync limitations remain unchanged.
