# LB-DS-035 — Learner Web Words source filters and search recovery

- Status: review_requested
- Base: `1634744a1929edd31f68c90af8d41228e3df4c27`
- Branch: `feat/web-words-source-filters`
- Risk: routine Web UI/accessibility

## Outcome

- Adds keyboard-reachable `همه` / `رسمی` / `شخصی` buttons with truthful `aria-pressed` state.
- Composes source filtering with the existing German/Persian search.
- Visible count and rendered source sections reflect only the active query/filter.
- Empty query results provide a clear-search action and return focus to the persistent search input.
- Canonical words remain separate from personal entries and do not consume personal quota.

## TDD evidence

1. Source filters RED: focused test failed with `Button not found: رسمی` on baseline.
2. Source filters GREEN: official, personal-empty and all-source transitions passed.
3. Search recovery RED: focused test failed with `Button not found: پاک کردن جست‌وجو`.
4. Search recovery GREEN: clear action restores the filtered official list and empties the input.

## Verification

- Focused learner core flows: 12/12 passed.
- Full Website suite: 228/228 passed across 35 files. The untouched LaunchScreen test retains its
  existing Next Image layout warning; no source for that warning is in this diff.
- Website typecheck and production build: passed.
- Prettier, queue/documentation/continuity/dashboard validators and `git diff --check`: passed.
- Mobile browser at 390×844: RTL, three 44px source controls, truthful pressed state, no horizontal
  overflow; official filter + no-result search + clear recovery verified, including focus return.
- Desktop browser at 1440×900: 44px controls, three official rows and no horizontal overflow.
- Local verification server was stopped.

## Pending merge

Open a Draft PR, verify all GitHub checks, then reconcile canonical status after merge.

## Unchanged gates

No API, auth, sync flag, schema, migration, seed, content approval, payment, deployment, publication
or Production state changed.
