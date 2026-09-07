# LB-DS-038 — Learner Web Progress local-data truthfulness

- Status: review_requested
- Base: `b46867c57daf2d4657b2573411c50f015fc4d221`
- Branch: `fix/web-progress-local-truth`
- Head commit: `8f462c955508e3f0026a337ebda6a7d74a3db267`
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
- `git diff --check`: passed before documentation updates.
- GitHub CI: pending.
- Independent review: pending.

## Unchanged gates

No API, route, authentication, sync activation/client composition, schema, migration, seed, content, payment, deployment, publication or Production state changed. The screen does not claim server acknowledgement or server-backed analytics.
