# M1-Q Independent QA — M1-B Web (#156) + M1-C Mobile (#155) at baseline 75ee7be

- Branch: `qa/m1-q-independent-qa`
- Baseline: `origin/main` = `75ee7be2f98da973425e2924d0e50bbb9e0961f3`
- Executor: independent QA (W8 role; did not implement either slice)
- Evidence dir: `.ai/qa-reports/m1-q-evidence/`
- Date: 2026-08-29

## Scope reviewed

M1-B Web slice 1 (`apps/website/**`): TodayScreen component, learner-sync-state,
NetworkStatus copy, LearnerHome rewiring, globals.css sync-truth, 2 new test files,
README-M1B-WEB-SLICE1.md. M1-C Mobile slice 1 (`apps/mobile/**`): today_screen.dart
truth labels + pending chip, 8 widget tests, worker report LB-DS-021.

## Checks run (real commands, actual output)

| Check | Command | Result |
| --- | --- | --- |
| Web full test suite | `cd apps/website && pnpm test` | 26 files / 146 tests passed |
| Web typecheck | `cd apps/website && pnpm typecheck` | clean (learning-engine + billing-core + api tsc + tsc --noEmit) |
| Web eslint (slice files) | `npx eslint apps/website/app/components/TodayScreen.tsx apps/website/app/learner-sync-state.ts apps/website/test/learner-today-sync.test.tsx apps/website/test/learner-sync-state.test.ts --max-warnings=0` | clean |
| Web prettier (slice files) | `npx prettier --check ...7 slice files` | clean |
| Root build | `pnpm build` | green (Next build Done) |
| Migration validation | `node scripts/validate-migrations.mjs` | 13 migrations validated |
| `git diff --check` | — | clean |
| Flutter full suite | `cd apps/mobile && flutter test` | 143/143 passed |
| Flutter focused (new slice tests) | `flutter test test/today_screen_states_test.dart` | 8/8 passed |
| Flutter loop+parity | `flutter test test/mobile_learning_loop_test.dart test/mobile_visual_parity_test.dart` | 28 tests passed |
| Flutter analyze | `flutter analyze` | No issues found |
| Dart format (check-only) | `dart format --output=none --set-exit-if-changed lib test` | **FAILED — 2 files changed** (see finding M-L1) |
| CI on merged commits | `gh api .../commits/{75ee7be,5185e41}/check-runs` | mobile / quality / production-stack / secrets all `success` |

## Live Web exercise (local, no secrets, no server)

`pnpm dev` ran at `http://localhost:3000` (Next 15.5.22). Journey executed in Chrome
(RTL page, `<html lang="fa" dir="rtl">`):

1. AuthGate local-prototype: truthful copy «در این نسخهٔ آزمایشی، پیامکی ارسال نمی‌شود».
2. Phone → 5-digit code → onboarding (3 goals, radio) → Today.
3. Today: «مرورهای امروز 3 / 3 کارت برای شروع آماده است» + truth label
   «این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به سرور وصل نشده است.»
   (`role="status"`, summary `aria-label="پیشنهاد امروز"`).
4. Review 3 cards: flip, grade (4 states with text labels), German lemma LTR
   (`lang="de"`), completion: «3 پاسخ برای همگام‌سازی امن نگه‌داری شد.»
5. Queue: `localStorage['learnbox:review-sync:v1:local-prototype']` = 3 events
   (`start-a1-tuer/bett/apfel`, unique clientEventId UUIDs, attempts 0).
6. Return to Today: «مرورهای امروز 0» (device-local daily count restores after reload:
   `learnbox:daily-review:v1:local-prototype` = `{dateKey:"2026-08-29",reviewedCount:3}`),
   streak «1 روز».
7. Offline event: banner «اینترنت قطع است؛ پاسخ‌ها روی همین دستگاه امن می‌مانند و تا
   وصل‌شدن به سرور، همگام‌سازی انجام نمی‌شود.» — truthful, no false server claim.
8. 390×844 viewport: no horizontal overflow (scrollWidth == clientWidth).
9. Progress screen: real device-local counts («امروز 3 کارت را ثبت کردی»), weekly chart
   deferred with explicit honest note, streak real.
10. Evidence screenshot: `.ai/qa-reports/m1-q-evidence/web-today-synced.png`.

No DB was required: Today path is client-only (bundled Start pack + device storage).
Routes that touch `pg` (`/api/reviews/mobile`, OTP, invite, launch-splash) are lazy
route handlers, never imported by the learner home path; `DATABASE_URL` points at
`localhost:5432` (unreachable) and was never touched by the exercised path.

## Findings

### Blocker
None.

### High
None.

### Medium
None.

### Low

- **M-L1 (both slices, verified): Dart formatting drift.** `dart format
  --output=none --set-exit-if-changed lib test` reports 2 changed files at baseline:
  `apps/mobile/lib/features/review/today_screen.dart` (missing trailing newline at EOF)
  and `apps/mobile/test/today_screen_states_test.dart` (one line-wrap difference).
  Worker report LB-DS-021 claims «dart format … clean»; CI `mobile` job does NOT run
  a format gate (only `flutter analyze && flutter test && flutter build apk --debug`),
  so the drift is unreported by CI. Non-functional. Suggest adding a format gate to the
  `mobile` CI job and a follow-up format commit. QA did not fix (product code off-limits).
- **M-L2 (web slice, observed): Today count numerals are Latin digits** («3» / «0») while
  surrounding copy is Persian and mobile uses Persian digits (`_persianDigits`). D0 §3
  requires tabular numerals for codes; Today summary figures use plain digits. Minor
  visual inconsistency; parity item for the next M1-B slice.
- **M-L3 (web slice, gap): no pending-sync chip on Web Today.** D1 §5 sync row is met on
  mobile (chip appears only when queue has real pending events; tests cover empty queue,
  fail-closed read error, count, persistence across navigation). Web Today shows only the
  static `local-only` truth label; `pendingReviewCount` is tracked in `LearnerHome` but
  rendered only on the completion screen. The slice's README documents this as deliberate
  (no fetch → no D1 loading/empty/error states; chip is the sync-state statement). Acceptable
  for slice 1, but D1 §5 sync chip parity on Web is outstanding.
- **M-L4 (docs, mobile): LB-DS-021 claims «full suite 143/143» — verified 143/143 locally.**
  Worker report accurate. No issue.
- **M-L5 (D0 §12 checklist): Today still lacks loading skeleton / empty-with-CTA / error
  banner / offline hairline banner with last-synced snapshot** exactly as both slices
  document (deferred to D3 evidence + a connectivity source decision). Not a regression;
  bounded slice scope.

## Readiness matrix (M1-B Web + M1-C Mobile slice 1)

| Criterion | Web | Mobile | Verdict |
| --- | --- | --- | --- |
| Truthful local/server labels | ✅ `local-only` label, no server claim | ✅ same + pending chip | Pass |
| No placeholder numbers presented as real | ✅ counts = device-local, labelled | ✅ same | Pass |
| Fail-closed defaults | ✅ auth mode default `local-prototype`; no API route added | ✅ queue read failure → no chip; `DisabledReviewSyncTransport` untouched | Pass |
| RTL/LTR | ✅ `dir=rtl lang=fa`; German `lang="de"` | ✅ Persian RTL, `_persianDigits` | Pass |
| Accessibility semantics | ✅ `role="status"`, summary aria-label, Bobo alt text | ✅ Semantics labels on loading/pending chip, ExcludeSemantics on Bobo | Pass |
| Contrast AA | ✅ muted-on-canvas 4.58:1, primary-on-white 4.33:1 (D0 doc claims 4.6 — measured 4.33, AA large/UI ok, borderline for small text) | Dart tokens match D0 | Pass w/ note |
| 390×844 no overflow | ✅ measured | ✅ existing parity tests | Pass |
| Tests green | ✅ 146 web + 8 new | ✅ 143 flutter + 8 new | Pass |
| CI on merged commits | ✅ quality/mobile/production-stack/secrets | ✅ same | Pass |
| Server-wiring blocker documented | ✅ README-M1B-WEB-SLICE1 + PR body; verified: no `apps/website/app/api/learner/state` route exists | n/a (contract M1-D) | Pass |

## Verified blocker claim (Web slice)

M1-B README states `GET /api/learner/state` is not exposed by any Next.js route and
requires the mobile-session Bearer token. Verified:
- `apps/website/app/api/` contains only auth/development-session/launch/local-preview-media/
  owner/private-media/reviews — no `learner/state` route.
- The snapshot service lives in `apps/api/src/learner-state/` (NestJS), token audience
  `learnbox-mobile` vs Web cookie `learnbox_alpha_session` (`lib/server-session.ts`) —
  different audience/format, confirmed by reading both files.
- `card_schedules` contentId vs bundled Start pack `start-a1-*` id mapping is an open
  M1-A item (§3.2). Claim is accurate.

## Release recommendation

**Not production-ready (both slices are bounded foundation, as documented).**
- Web Today remains device-local prototype; server wiring blocked on: (a) Web route +
  learner-cookie boundary for the snapshot endpoint, (b) Start-pack ↔ contentId mapping
  contract (M1-A open item), (c) D1 loading/empty/error/offline/sync states for the
  server-wired fetch.
- Mobile pending chip is truthful but sync coordinator remains dormant; production
  activation requires authenticated transport behind owner-approved flags (M1-C §12.1).
- Recommend: accept both slices as merge-ready (already merged), record M-L1/M-L2/M-L3 in
  the next slice's backlog, add a Dart format CI gate, and keep Today labelled
  device-local until the server-wired slice lands. Do NOT expose Today counts as
  server-backed anywhere.

## Limitations

- No Android emulator/physical-device run (no emulator available in this environment);
  mobile evidence = Flutter widget tests + analyze + format check + CI mobile job.
- No `flutter build apk` locally (CI ran it green on both commits).
- Web live run used Chrome headless-backed session; screenshots from the harness are
  stored under `.ai/qa-reports/m1-q-evidence/`.
- No automated a11y scan (axe) run; semantics verified via DOM/AX tree inspection.
- `pnpm check` root aggregate not fully re-run (runs the entire verify chain); the
  slice-relevant components (format, lint, typecheck, tests, build, migrations) were
  each run directly and CI green on both commits.
- QA made no product code, API, mobile, web, admin, queue, secrets, or deployment changes;
  only this report + evidence under `.ai/qa-reports/**`.