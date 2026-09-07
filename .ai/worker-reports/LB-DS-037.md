# LB-DS-037 — Android device-local personal vocabulary parity

- Status: rereview_passed_ci_passed
- Base: `388ff670479a4b943279d1e9cf6bde3e4d00a2e4`
- Branch: `feat/mobile-personal-vocabulary`
- Head commit: `36283a1ed70d5526dfad70732747401d62ffe06e`
- Risk: routine Android UI with secure device-local persistence

## Outcome

- Adds a typed personal-vocabulary store over the existing `flutter_secure_storage` dependency, using separate key and Android namespace `learnbox.personalVocabulary.v1`.
- Fails closed on corrupt top-level payloads, malformed records, oversized lists, duplicate IDs/German values and canonical-word collisions; it never rewrites a corrupt payload as a successful empty list.
- Enforces the 30-record cap in the storage layer and the UI; canonical constraints are passed from the bundled Start cards.
- Binds local-load completion to a generation and its own timer, so a stale read cannot overwrite or cancel a later retry.
- Keeps personal load failure/retry visible during no-result search, and distinguishes a true empty personal list from a search-miss.
- Wires an injectable personal store through the app shell solely for deterministic runtime/widget tests; runtime default stays secure storage.

## TDD evidence

1. Initial store/UI tests were written first and failed before the original implementation.
2. Follow-up review regressions were added first and failed against the initial code: corrupt payloads, persisted 31st record, duplicate IDs/canonical Unicode German, hidden search error, stale overlapping retry, and personal responsive surface coverage.
3. The smallest hardening change then made those regressions pass: strict validation before storage reads/writes, official-card constraints at the screen boundary, generation-owned load timers, truthful search composition and injected in-memory test storage.
4. Existing official/personal separation, write-before-render, duplicate, quota, retry and focused search tests remain green.

## Verification

- Focused personal-vocabulary store and visual-parity suites: passed.
- Full Flutter suite: 193/193 passed.
- Dart strict format: passed.
- Flutter analyze: passed with no issues.
- Android debug APK: built successfully.
- Personal-word UI responsive QA: 320×480 at 200% text and 844×390 landscape, including loaded personal row and add form, passed without overflow.
- `git diff --check`: passed.
- Independent re-review: PASS; all prior P1 findings resolved. Reviewer found only stale documentation, corrected in the reconciliation commit.
- GitHub CI: all 14 checks passed on `36283a1`.

## Unchanged gates

No API, auth, sync flag, schema, migration, seed, publication, payment, deployment or Production state changed. Personal entries remain device-local only; authoritative server persistence, cross-device sync and expanded Premium quota remain separate gated work.
