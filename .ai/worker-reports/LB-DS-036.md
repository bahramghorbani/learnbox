# LB-DS-036 — Android Words offline search and recovery

- Status: review_requested
- Base: `58a6590a872d94ccda9c02846a1c06a4fba37e01`
- Branch: `feat/mobile-words-search`
- Head commit: `2845ae128a9d620eb0d76a24b3ed714e8300f8fe`
- Risk: routine Android UI/accessibility

## Outcome

- Adds a labelled, 48px-minimum search field to the Android Words surface.
- Filters the bundled canonical Start words locally across German and Persian text.
- Uses LTR input direction for German and RTL for Persian, with Persian-digit visible counts.
- Shows a truthful no-result state with a clear-search recovery action.
- Returns focus to the search field after clearing.
- Labels the visible count as official; no personal vocabulary or server state is invented.

## TDD evidence

1. Search flow RED: focused test failed because the labelled search control did not exist on baseline.
2. Search flow GREEN: German/Persian filtering, no-result state, clear action and focus recovery pass.
3. Adding the TextField introduced a second `Scrollable`; two existing responsive tests exposed an ambiguous scroll target. The Words list received a stable key and those tests now target its outer scrollable explicitly.

## Verification

- Focused search flow: 1/1 passed.
- Mobile visual parity suite: 16/16 passed.
- Full Flutter suite: 176/176 passed.
- Dart strict format and Flutter analyze: passed.
- Android debug APK: built successfully.
- Responsive widget QA: 320×480 at 200% text and 844×390 landscape passed without overflow;
  labelled search, German/Persian results, no-result recovery and focus return are covered.
- Queue/documentation/continuity validators, dashboard tests (21/21), Prettier and
  `git diff --check`: passed.

## Unchanged gates

No API, auth, sync flag, schema, migration, seed, personal vocabulary, payment, deployment,
publication or Production state changed.
