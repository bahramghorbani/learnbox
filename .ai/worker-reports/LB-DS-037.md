# LB-DS-037 — Android device-local personal vocabulary parity

- Status: review_requested
- Base: `388ff670479a4b943279d1e9cf6bde3e4d00a2e4`
- Branch: `feat/mobile-personal-vocabulary`
- Head commit: `9f23c72`
- Risk: routine Android UI with secure device-local persistence

## Outcome

- Adds a typed personal-vocabulary store over the existing `flutter_secure_storage` dependency, using the separate `learnbox_personal_vocabulary_v1` namespace.
- Treats malformed local payloads as an empty personal list instead of crashing or inventing data.
- Separates official bundled cards from personal device-local cards and labels both sources explicitly.
- Adds a Persian-first inline form for German and Persian text; storage succeeds before the new card becomes visible.
- Normalizes German case and whitespace for duplicate checks across official and personal collections.
- Enforces the real 30-record device-local personal quota from the persisted personal collection, independent of search filtering.
- Searches official and personal German/Persian text together while keeping official visible counts and personal quota counts truthful.
- Adds truthful loading, empty, load-error/retry, save-error/retry, duplicate, validation, success and quota states. No sync or server acknowledgement is claimed.

## TDD evidence

1. Store tests were added first and failed because `personal_vocabulary_store.dart` did not exist; typed round-trip, malformed-data handling, delete-on-empty and normalization then passed.
2. Personal/official separation test failed before the store seam was accepted by `WordsScreen`; it passed after local loading and grouped rendering were implemented.
3. Valid add flow failed before the inline form existed; it passed after write-before-render persistence was implemented.
4. Cross-source normalized duplicate and 30-word quota tests each failed before their guards existed, then passed after their focused implementation.
5. Load-error recovery failed before a personal-store retry action existed, then passed after the retry state was implemented.
6. A focused search assertion exposed that the personal quota label incorrectly used filtered results; the count was corrected to use the full persisted personal collection.

## Verification

- Personal store and Mobile visual parity focused suites: 27/27 passed.
- Full Flutter suite: 187/187 passed.
- Dart strict format: passed.
- Flutter analyze: passed with no issues.
- Android debug APK: built successfully.
- Existing responsive widget QA passed at 320×480 with 200% text and at 844×390 landscape with no overflow.
- `git diff --check`: passed.
- Independent review: pending.
- GitHub CI: pending.

## Unchanged gates

No API, auth, sync flag, schema, migration, seed, publication, payment, deployment or Production state changed. Personal entries remain device-local only; authoritative server persistence, cross-device sync and expanded Premium quota remain separate gated work.
