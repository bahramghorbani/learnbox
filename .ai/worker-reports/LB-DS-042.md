# LB-DS-042 — Web M3-P1 Profile/Settings foundation

- Status: review_requested
- Branch: `feature/m3-web-profile-settings`
- Base commit: `0f4feb71dc01b878519cae58765284a6028b5daf` (`origin/main`)
- Head commit: `38a6528` (Profile/Settings implementation and review hardening)
- Draft PR: https://github.com/bahramghorbani/learnbox/pull/238
- Scope completed: yes
- Files changed: `apps/website/app/LearnerHome.tsx`, `apps/website/app/components/LearnerNav.tsx`, `apps/website/app/components/ProfileScreen.tsx` (new), `apps/website/app/components/SettingsScreen.tsx` (new), `apps/website/app/components/ProgressScreen.tsx` (type-only), `apps/website/app/globals.css`, `apps/website/test/learner-profile-settings.test.tsx` (new), `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-042.md`, `CURRENT_WORK.md`, `docs/design/DESIGN_STATUS.md`, `docs/PRODUCT_STATUS.md`
- Checks run: focused RED-first test suite then GREEN 17/17; full website test suite 246/246 (36 files); website typecheck; `next build`; Prettier; `verify:ai-worker-queue`; `verify:documentation-governance`; `verify:ai-continuity`; `test:dashboard`; `git diff --check`; local Chrome responsive/focus/offline smoke
- Checks unavailable: none
- Remaining work: M3-S1 sound preference persistence and M3-A1 server identity reads
- Risks: scope creep into unapproved account/commerce/reminder claims; mitigated by device-local-only facts and approved informational rows; single allowed-path widening (ProgressScreen type) documented in the queue
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Scope

- Added Profile as the fourth persistent learner destination in the shared bottom `LearnerNav` (grid now four columns, `aria-current="page"` on the active destination, rendered on Today/Words/Progress/Profile).
- Added `ProfileScreen`: heading focuses on entry; «حساب LearnBox» general label with an explicit copy that this alpha prototype does not read personal account data from a server; learning-goal fact from the real device-local onboarding goal with a «فقط در این دستگاه» local badge (re-enters the onboarding goal editor when no goal or on demand); review status from the actual device-local pending review queue count; «دسترسی» rows: child Settings, Privacy (`https://learnboxapp.com/privacy`), Support (`mailto:hi@learnboxapp.com`); no sign-out, no deletion, no fake name/phone/account/purchase/sync/reminder data.
- Added child `SettingsScreen`: back header restores the calling screen, goal editor row reuses the approved onboarding goal picker, approved informational rows (text size follows browser/device settings, app language is Persian), and a footnote that no other settings exist in this version. Privacy and Support remain Profile destinations only.
- Keyboard/focus/back semantics: surface headings focus on entry; returning from Settings restores focus to the Settings row that opened it; completing goal editing restores focus to its initiating row; back uses the explicit button without browser-history coupling. RTL layout throughout; the nav stays four columns at normal 390 px sizing and adapts to two rows at 200% text. Profile and Settings use the shared offline banner. Storage denial falls back to the in-memory local goal and reports a truthful zero/idle pending-review state.
- Documentation statuses updated (`DESIGN_STATUS.md`, `PRODUCT_STATUS.md`) with the same truth claims.

## Evidence

- RED-first: the new test file failed on module/behavior absence before components existed; then GREEN after implementation.
- Focused suite `test/learner-profile-settings.test.tsx`: 17/17 passed.
- Full website suite: 246/246 passed (36 files).
- Website `typecheck` and `next build` completed successfully; full repo Prettier check, queue/documentation-governance/AI-continuity validators, dashboard tests, and `git diff --check` all passed.
- Visual/browser: at a 390 px viewport, normal text renders four equal nav columns (`88.5px` each). At 200% text, the nav adapts to two equal columns (`177px` each) with no document or nav horizontal overflow (`scrollWidth == clientWidth == 390`). Privacy/support text wraps in place. Chrome interaction smoke verified focus returned to «هدف یادگیری: زندگی روزمره» and the shared «بدون اینترنت» banner appeared after an `offline` event. The screenshot used the local Next.js development build; its toolbar is QA-only.

## Verification

- `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx` (17/17)
- `pnpm --filter @learnbox/website test` (246/246)
- `pnpm --filter @learnbox/website typecheck`
- `pnpm --filter @learnbox/website build`
- `pnpm format:check`
- `pnpm verify:ai-worker-queue`, `pnpm verify:documentation-governance`, `pnpm verify:ai-continuity`, `pnpm test:dashboard`, `git diff --check`

## Review

- Initial independent review of Draft PR #238 found the 200% nav, goal-focus return and shared offline-status gaps. Review hardening through `38a6528` resolves each finding and narrows the idle sentence to the pending-review queue. Re-review of the updated head remains required before merge. No secrets, credentials, phone numbers or production configuration touched.
