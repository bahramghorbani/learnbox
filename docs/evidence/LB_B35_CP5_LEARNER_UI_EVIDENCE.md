# LB-B35 CP5 — Learner UI (web) evidence

Status: **CP5 review gate — NOT merged, NOT deployed.** No Production change, no migration, every CP5 flag defaults OFF.
Branch `feat/lb-b35-cp5-learner-ui`, draft PR #336. Base `main` = `9c274f69` (PR #335).

## 1. Source and image identity

- Final runtime SHA: `e3c33a36213d0fd4608a2423117b729056138fec` (`APP_SOURCE_SHA` read back from the running container matches). The PR head is this SHA plus docs-only commits (this file); the PR's CI results for the exact merged head are recorded in the PR.
- Checkpoints: CP5-A `56eb9f1` (Today workload) · CP5-B (binary buttons) · CP5-C `a15f582` (goal removal) · CP5-D (session-expiry UX) · `5e469b27` (Today screen shows the canonical remaining count) · final runtime `e3c33a36` (owner-required keyboard operation of the flip card).
- Final staging image (local, disposable, never pushed): `cp5-stg-all-e3c33a36` (`680f90930904`), run against the restored CP4 final dump (180 users, migration `0023`). Earlier images: baseline `cp5-stg-main-9c274f69` (`c78da5183667`), candidate flags-off `cp5-stg-off-5e469b27` (`c17e9adbc74c`), candidate all-flags `cp5-stg-all-5e469b27` (`d04dfd296d86`).
- The API matrix in §5 ran on the earlier candidate `325ea7ef` images. Between `325ea7ef` and `e3c33a36` the only runtime changes are `app/components/TodayScreen.tsx`, the flip-card markup/key handler in `app/LearnerHome.tsx` and one `:focus-visible` rule in `app/globals.css` (all client rendering); no route, service, SQL or scheduler file changed. The matrix was therefore not re-run (owner instruction); §8 spot-checks the final images instead.

## 2. Flags (all default OFF; compose, Dockerfile and `app.env.example` carry them)

| Flag                                     | Kind       | Effect                                                                                                           |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `LEARNBOX_TODAY_WORKLOAD`                | server env | `/api/learner/today` adds `cardsForToday`, `reviewCardsToday`, `newCardsToday`, `planMode`, `unseenCatalogCount` |
| `NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`  | build arg  | two answer buttons «بلد بودم» / «بلد نیستم», sent as `response: known/unknown`                                   |
| `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED`   | build arg  | no onboarding-goal gate, no goal row in Profile or Settings                                                      |
| `NEXT_PUBLIC_LEARNBOX_SESSION_EXPIRY_UX` | build arg  | Persian "session ended" notice that keeps unsent answers                                                         |

All-flags staging also used the CP4 flags (`LEARNBOX_BINARY_REVIEW`, `LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_TZ_PERSIST`, `LEARNBOX_QUEUE_QUARANTINE`).

## 3. Binary + legacy compatibility

- Wire: `known`/`unknown` are posted as `response` only. The durable device queue keeps the lossless shadow grade (known→remembered, unknown→forgot) so a rollback or v1.2.1 server still reads it.
- Legacy four-grade API is unchanged and accepted by the same server. The Dart/mobile client is untouched and still sends four grades (see §11).
- Found by test and fixed: the logout flush did not send the binary shape. Both flush call sites now pass the flag; a test pins it.
- Staging: binary and legacy answers accepted together, stored as shadow grades, `engine_version` stays NULL.

## 4. Today / session-plan semantics

- One learner-visible number, «N کارت دیگه مونده» = cards still left in today's canonical plan: min(due, 12) + min(12 − min(due, 12), 3, unseen). Never due + 3, never 15.
- Before CP5 `/today` returned `newCount` = unseen catalogue (30) and `totalTodayCards` = due + catalogue (35). **No UI ever rendered those two**; the visible number was `plan length − reviewedToday`.
- Final fix (`5e469b27`): with the server flag on, that expression subtracted answered cards twice, because the server plan already drops answered cards (browser showed 6 left after 1 answer; correct is 7). The screen now uses `cardsForToday` when present and falls back to the legacy expression when absent.
- Test `cp5-today-remaining-ui.test.tsx` (9 tests): 3 new/no due → 3; 5 due + 3 new → 8; 10 due + 2 new → 12; exactly 12 due → 12; >12 overdue (recovery) → 12; zero work → empty state; answer one → N−1 (also after refresh) with no replacement new card; answer all → empty state, nothing refilled; server flag off → legacy count. The catalogue size must never appear. Mutation check: reverting `TodayScreen.tsx` alone fails exactly the answer-one test.

## 5. All-flags matrix (real HTTP, `325ea7ef` all-flags image) — 22 PASS / 0 FAIL

Evidence: `sCP5-all-flags.json`. Covers: new learner = 3 (allowance, not catalogue 35), `unseenCatalogCount` separate; 5 due → 8; 10 due → 12; exactly 12 due → 12/0 new; 20 overdue → recovery capped at 12; nothing due and nothing unseen → 0; refresh and second device (different timezone) see the same workload and share one allowance row; Today equals the `/state` queue length; Today/Progress/Summary agree; answering shrinks remaining work with no refill; binary + legacy writes; `card_schedules.state` still written.

## 6. Timezone / midnight

Asia/Tehran midnight (20:30Z, fake clock) → fresh daily allowance and `reviewedToday` back to 0; a second device after midnight sees the same plan. Run through a fake clock in the staging process only.

## 7. Flag-off rollback (final head `5e469b27`)

- Read endpoints (state, today, progress, words, summary) all 200. `/today` has none of the new fields; `newCount` = 30, `totalTodayCards` = 35 (v1.2.1 semantics).
- Legacy four-grade write after rollback: 200 acknowledged.
- Earlier byte comparison of candidate-off vs `main` (on `325ea7ef`): 9 read endpoints and the deterministic write responses, schedule rows and events equal.
- Browser, flags off: onboarding-goal gate returns, four grade buttons shown, POST carries `grade: remembered` and no `response`, Today shows the legacy count.

## 8. Real-browser results (Chrome, iPhone-size 390×844, touch emulation, final all-flags image)

PASS:

- A new learner with no stored goal lands on Today. No onboarding-goal screen.
- Profile and Settings contain no goal row.
- Review screen shows exactly «بلد بودم» and «بلد نیستم» (nothing else in the answer area; none of the four legacy labels anywhere).
- «بلد بودم» posts `response: "known"`, «بلد نیستم» posts `response: "unknown"`; each advances to the next card and the in-session counter and Today count move by one.
- Today after 1 known + 1 unknown: 8 → 7 → 6 left, ring 2 of 8, and the same after a page refresh; `/today` payload `cardsForToday` = 6 agrees with the screen.
- Session expiry (cookie removed while offline with one queued answer): a Persian «نشست شما تمام شد — برای ادامه، دوباره وارد شو» notice appears above the login form, says one unsent answer is kept on this device and will be sent after login; no session-policy numbers, scheduler or engine terms are shown. The device queue still held the entry. After re-login the queue flushed (0 left) and the server count matched (2 reviewed).

Findings, not hidden:

- On an iPhone-size viewport the two answer buttons start below the fold (top at 835 px of 844); the learner must scroll to reach them. They are reachable and tappable (56 px high). Not changed.
- **Keyboard (fixed in `e3c33a36`, owner-approved pre-merge fix):** previously the flip card was a plain `div` with only `onClick`, so a keyboard-only user could not flip it or reach the answer buttons (the same markup exists on `main`, so it was not a CP5 regression). The `.flip-container` element is now `role="button"` with `tabindex=0`, a Persian `aria-label` carrying the German word plus the current action (front: «Apfel. برای دیدن معنی، فعال کن»; back: «Apfel؛ سیب. برای برگشتن به روی کارت، فعال کن»), Enter/Space toggle the flip exactly as click does (default prevented, auto-repeat ignored, only when the card itself is the event target so the nested pronunciation buttons are unaffected) and a `.flip-container:focus-visible` rule gives a 3px solid outline. Click/tap behaviour and the animation are unchanged. Once flipped, tab order is sane (audio, «بلد بودم», «بلد نیستم») and the answer area is a labelled group («پاسخ شما»).
- **Focused browser verification on `e3c33a36`** (Chrome, 390×844, touch emulation, real `Input.dispatchKeyEvent` / touch / mouse events, all-flags image): Tab from the session header reaches the flip card second (after «خروج از جلسه»), `:focus-visible` is true with a solid 3px outline; Enter flips (answer buttons appear), Space flips back, Space flips again, with no page scroll (scrollY 0); Tab then reaches the pronunciation buttons and «بلد بودم», and Enter on it POSTs `response: known` and advances 1→2 of 8 to the next unflipped card; a touch tap on the card flips it; a touch tap on «بلد نیستم» POSTs `response: unknown` and advances 2→3 of 8; a mouse click flips; none of the four legacy grade labels is present; Enter and Space on the pronunciation button (front and back face, tested one key at a time) never flip the card.

## 9. Goal-removal evidence

Tests `cp5-goal-removal.test.tsx` (flag on: no gate, no Profile/Settings row, nothing written for a goal) plus the browser results above. No server persistence, no migration, no deletion of old device-local goal values (they remain as unused local data). Flag off restores the gate (browser-verified).

## 10. Session-expiry / unsynced-review evidence

Tests: a 401 on the review POST ends the session, keeps the device queue untouched, shows the notice with the unsent count, and sends nothing to another account; removing that branch makes the review-POST test fail. Browser result in §8.
**Retry / Stay / Discard:** CP5-D deliberately has exactly one path: sign in again; unsent answers stay on the device and are sent after login. **No Discard action exists, by owner decision** — session expiry is not a user-initiated logout, so a destructive discard is not offered there. Explicit discard semantics remain only in the separate user-initiated logout flow, unchanged.

## 11. `card_schedules.state` and Mobile

- Still written by every review. Dependency scan (CP4/CP5): the web UI reads it (Words semantics) and rollback needs it; retirement is a separate compatibility checkpoint (needs a Words replacement, wire versioning and rollback safety).
- Mobile stays on the legacy four-grade client; binary UX alignment is deferred Mobile Readiness work. Nothing in the Dart client changed.

## 12. History / fingerprint integrity

`fp_orig()` fingerprints (pre-0023 review events, owner schedules, pre-existing users' legacy columns, `account_deletion_events`) are identical to the frozen stage-0 snapshot after the all-flags matrix and again after the final flag-off run on `5e469b27`. No migration was applied for CP5.

## 13. Automated tests

Website suite at runtime head `e3c33a36`, against a real Postgres (`TEST_DATABASE_URL`): 109 files passed, 2 skipped; 892 tests passed, 8 skipped (the 8 skips are unchanged from before). `tsc --noEmit` clean. New `test/cp5-flip-keyboard.test.tsx` (7 tests: role/tabindex/accessible name and state, click/tap flip both ways, Enter and Space flip both ways, key default-prevented and other keys ignored, held-key repeat ignored, nested pronunciation keys do not flip, `:focus-visible` rule present) was run red first (5 of 7 failed on the old markup). Mutation checks: removing the target guard, the repeat guard, or `preventDefault` each fails exactly one test. The existing LB-B23 audio-flip tests still pass. Required CI on runtime head `e3c33a36`: quality, mobile, production-stack and secrets all COMPLETED SUCCESS.

## 14. Limitations / not tested

- Only Chrome with iPhone-size emulation was used; no real iPhone/Safari, no VoiceOver/TalkBack screen-reader pass, no contrast audit.
- A complete screen-reader / contrast / accessibility audit has **not** been done; only keyboard operation of the flip card was fixed and verified. The rest remains separate B14 work. Below-the-fold answer buttons on a 390×844 viewport remain a documented UX finding, not changed.
- The API matrix was run on `325ea7ef` and not re-run (client-only delta since); only the browser checks in §8 ran on `e3c33a36`, and the flag-off rollback in §7 ran on `5e469b27`.
- Browser sessions used minted test cookies for synthetic users, not a real SMS/OTP login (OTP login was proven in earlier checkpoints, not here).
- Session expiry was simulated by deleting the cookie; the 30-day / 14-day server expiry itself was not exercised in the browser.
- The Today screen still labels its ring denominator as answered + remaining; behaviour with >12 overdue was verified in jsdom and API, not in the browser.
- Production, scheduler v2 (O1), Admin exposure, Store and mobile were not touched or tested.
