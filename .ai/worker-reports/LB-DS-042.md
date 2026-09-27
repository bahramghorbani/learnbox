# LB-DS-042 — Web M3-P1 Profile/Settings foundation

- Status: accepted
- Branch: `feature/m3-web-profile-settings`
- Base commit: `0f4feb71dc01b878519cae58765284a6028b5daf` (`origin/main`)
- Head commit: `7b58ff2` (Profile/Settings implementation and review hardening)
- Draft PR: #238 (merged) — https://github.com/bahramghorbani/learnbox/pull/238
- Merge commit: `3f6db8ffc81c07afb5c576ce0469e8746a13110a`
- Scope completed: yes
- Files changed: `apps/website/app/LearnerHome.tsx`, `apps/website/app/components/LearnerNav.tsx`, `apps/website/app/components/ProfileScreen.tsx` (new), `apps/website/app/components/SettingsScreen.tsx` (new), `apps/website/app/components/ProgressScreen.tsx` (type-only), `apps/website/app/globals.css`, `apps/website/test/learner-profile-settings.test.tsx` (new), `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-042.md`, `CURRENT_WORK.md`, `docs/design/DESIGN_STATUS.md`, `docs/PRODUCT_STATUS.md`
- Checks run: focused RED-first test suite then GREEN 16/16; full website test suite 245/245 (36 files); website typecheck; `next build`; Prettier; `verify:ai-worker-queue`; `verify:documentation-governance`; `verify:ai-continuity`; `test:dashboard`; `git diff --check`; local Chrome responsive/focus/offline smoke
- Checks unavailable: none
- Remaining work: M3-S1 sound preference persistence and M3-A1 server identity reads
- Risks: scope creep into unapproved account/commerce/reminder claims; mitigated by device-local-only facts and approved informational rows; single allowed-path widening (ProgressScreen type) documented in the queue
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Scope

- Added Profile as the fourth persistent learner destination in the shared bottom `LearnerNav` (grid now four columns, `aria-current="page"` on the active destination, rendered on Today/Words/Progress/Profile).
- Added `ProfileScreen`: heading focuses on entry; «حساب LearnBox» general label with an explicit copy that this alpha prototype does not read personal account data from a server; learning-goal fact from the real device-local onboarding goal with a «فقط در این دستگاه» local badge (re-enters the onboarding goal editor when no goal or on demand); review status from the actual device-local pending review queue count; «دسترسی» rows: child Settings, Privacy (`https://learnboxapp.com/privacy`), Support (`mailto:hi@learnboxapp.com`); no sign-out, no deletion, no fake name/phone/account/purchase/sync/reminder data.
- Added child `SettingsScreen`: back header restores the calling screen, goal editor row reuses the approved onboarding goal picker, approved informational rows (text size follows browser/device settings, app language is Persian), and a footnote that no other settings exist in this version. Privacy and Support remain Profile destinations only.
- Keyboard/focus/back semantics: surface headings focus on entry; returning from Settings restores focus to the Settings row that opened it; completing goal editing restores focus to its initiating row; back uses the explicit button without browser-history coupling. RTL layout throughout; the nav stays four columns at normal 390 px sizing and adapts to two rows at 200% text on Profile/Settings/Words/Progress. Profile and Settings inherit the single layout-level offline banner; duplicate fixed live regions are regression-tested. Storage denial falls back to the in-memory local goal and reports a truthful zero/idle pending-review state.
- Documentation statuses updated (`DESIGN_STATUS.md`, `PRODUCT_STATUS.md`) with the same truth claims.

## Evidence

- RED-first: the new test file failed on module/behavior absence before components existed; then GREEN after implementation.
- Focused suite `test/learner-profile-settings.test.tsx`: 16/16 passed.
- Full website suite: 245/245 passed (36 files).
- Website `typecheck` and `next build` completed successfully; full repo Prettier check, queue/documentation-governance/AI-continuity validators, dashboard tests, and `git diff --check` all passed.
- Visual/browser: on Profile/Settings/Words/Progress at a 390 px viewport, normal text renders four equal nav columns (`88.5px` each). At 200% text, the nav adapts to two equal columns (`177px` each) with no document or nav horizontal overflow (`scrollWidth == clientWidth == 390`). Privacy/support text wraps in place. Chrome interaction smoke verified focus returned to «هدف یادگیری: زندگی روزمره» and the single shared «بدون اینترنت» banner appeared after an `offline` event. The pre-existing Today-shell edge overflow is unchanged by this PR and remains cross-surface debt. The screenshot used the local Next.js development build; its toolbar is QA-only.

## Verification

- `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx` (16/16)
- `pnpm --filter @learnbox/website test` (245/245)
- `pnpm --filter @learnbox/website typecheck`
- `pnpm --filter @learnbox/website build`
- `pnpm format:check`
- `pnpm verify:ai-worker-queue`, `pnpm verify:documentation-governance`, `pnpm verify:ai-continuity`, `pnpm test:dashboard`, `git diff --check`

## Review

- Independent re-review at `b1bb185` returned PASS with no blockers and confirmed all initial findings resolved. It identified duplicate surface-level offline banners as a non-blocking minor; `7b58ff2` removes them in favor of the existing global singleton and adds a regression test. The report also narrows the no-overflow claim to the corrected surfaces and records unchanged Today-shell debt. No secrets, credentials, phone numbers or production configuration touched.
- After Android PR #237 merged, `origin/main` was integrated without history rewriting; conflicts in shared status documents were reconciled to retain both platforms. Web 245/245, mobile 203/203, website typecheck/build, Flutter analyze, repository validators and all seven GitHub checks passed on the integrated head before PR #238 merged at `3f6db8f`.
