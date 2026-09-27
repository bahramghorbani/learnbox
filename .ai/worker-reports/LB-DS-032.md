# LB-DS-032 — Web Words truthfulness

- Status: accepted
- Base: `900f43aa2ac17a1ce701ddc64c8670d63f94019d`
- Branch: `fix/web-words-truth`
- Head commit: `f1794abead1aec93ffffffd5a7854a516e3d55ed`
- Merge commit: `66e449d8b8487596ccd2ea83bfa15520939e9481` (PR #217)
- Risk: routine Web UI truthfulness

## Trigger

The Words screen merges three canonical Start entries into the device-local personal list. Those official words consume the personal-word quota and are rendered with fixed `72%`, `48%` and `31%` values that do not come from review state and never change.

## Outcome

- Render canonical Start vocabulary separately from personal additions.
- Count and enforce the personal quota using personal additions only.
- Keep duplicate detection across canonical and personal entries.
- Remove fabricated numeric mastery from the Words list.
- Preserve truthful searchable and empty-result states with semantic text.

## Boundaries

Device-local Website UI only. No server snapshot, API, auth, database, migration, seed, content change, payment, deployment, publication or Production activation.

## TDD evidence

1. Canonical/personal truth:
   - RED: expected `0 از 30 واژهٔ شخصی`; received `3 از 30`, with no official section.
   - GREEN: focused flow file passed 7/7 after separating groups and removing `.word-ring` output.
2. Personal quota boundary:
   - RED: with 27 personal entries, adding the twenty-eighth left storage at 27 because three
     canonical words incorrectly consumed the remaining quota.
   - GREEN: the same scenario stores 28 entries and renders `28 از 30 واژهٔ شخصی`.
3. Search empty state:
   - RED: a no-match query rendered zero rows without explanatory status.
   - GREEN: the query renders `واژه‌ای مطابق این جست‌وجو پیدا نشد.` through `role="status"`.

## Checks

- Focused learner core flows: 9/9 passed.
- Full Website suite: 224/224 passed across 35 files. The unchanged LaunchScreen image tests still
  emit their existing Next Image layout warnings on stderr; no warning source is in this diff.
- Website typecheck: passed.
- Website production build: passed.
- Prettier and `git diff --check`: passed.
- `verify:ai-worker-queue`, `verify:documentation-governance`, `verify:ai-continuity` and
  `test:dashboard`: passed.
- GitHub CI for PR #217: 7/7 passed (`quality`, `secrets`, `mobile`, `production-stack`, both
  Vercel deployments and Preview comments); mergeability was clean before merge.
- GPT-5.6 Sol supervisor diff/product-truth review: no blocker. Source-label contrast is 5.82:1.
- Browser smoke:
  - 390×844: RTL, three official rows, zero personal rows, zero `.word-ring` elements and no
    horizontal overflow.
  - 1440×900: no horizontal overflow; H1/H2 hierarchy exposes Words, official and personal groups.
  - no-match search: zero rows and one truthful semantic status.

## Scope read-back

Only the Website Words component/style/flow-test paths and canonical task/status documentation
changed. No API, auth, database, migration, seed, content, payment, deployment, publication or
Production path changed.

## Merge

Merged to `main` through PR #217 at `66e449d8b8487596ccd2ea83bfa15520939e9481`.

## Rollback

Revert the scoped Web UI/test/documentation PR. No server or persisted schema change is involved.
