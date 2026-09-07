# LB-DS-042 — Web M3-P1 Profile/Settings foundation

- Status: review_requested
- Branch: `feature/m3-web-profile-settings`
- Base commit: `0f4feb71dc01b878519cae58765284a6028b5daf` (`origin/main`)
- Head commit (implementation): `742ebad`
- Draft PR: https://github.com/bahramghorbani/learnbox/pull/238
- Scope completed: yes
- Files changed: `apps/website/app/LearnerHome.tsx`, `apps/website/app/components/LearnerNav.tsx`, `apps/website/app/components/ProfileScreen.tsx` (new), `apps/website/app/components/SettingsScreen.tsx` (new), `apps/website/app/components/ProgressScreen.tsx` (type-only), `apps/website/app/globals.css`, `apps/website/test/learner-profile-settings.test.tsx` (new), `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-042.md`, `CURRENT_WORK.md`, `docs/design/DESIGN_STATUS.md`, `docs/PRODUCT_STATUS.md`
- Checks run: focused RED-first test suite then GREEN 14/14; full website test suite 243/243 (36 files); website typecheck; `next build`; Prettier (repo-wide `format:check`); `verify:ai-worker-queue` (tasks=40); `verify:documentation-governance` (documents=6); `verify:ai-continuity`; `test:dashboard`; `git diff --check`
- Checks unavailable: none (visual screenshot review at 390x844/200% requires a browser against the running local prototype; see note below)
- Remaining work: M3-S1 sound preference persistence, M3-A1 server identity reads, Android P1 parity, independent code/product review of the Draft PR
- Risks: scope creep into unapproved account/commerce/reminder claims; mitigated by device-local-only facts and approved informational rows; single allowed-path widening (ProgressScreen type) documented in the queue
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Scope

- Added Profile as the fourth persistent learner destination in the shared bottom `LearnerNav` (grid now four columns, `aria-current="page"` on the active destination, rendered on Today/Words/Progress/Profile).
- Added `ProfileScreen`: heading focuses on entry; «حساب LearnBox» general label with an explicit copy that this alpha prototype does not read personal account data from a server; learning-goal fact from the real device-local onboarding goal with a «فقط در این دستگاه» local badge (re-enters the onboarding goal editor when no goal or on demand); review status from the actual device-local pending review queue count; «دسترسی» rows: child Settings, Privacy (`https://learnboxapp.com/privacy`), Support (`mailto:hi@learnboxapp.com`); no sign-out, no deletion, no fake name/phone/account/purchase/sync/reminder data.
- Added child `SettingsScreen`: back header restores the calling screen, goal editor row reuses the approved onboarding goal picker, approved informational rows (text size follows browser/device settings, app language is Persian), Privacy and Support rows, and a footnote that no other settings exist in this version.
- Keyboard/focus/back semantics: surface headings are focused on entry; returning from Settings restores focus to the Settings row that opened it; back via the explicit button (no browser-history coupling). RTL layout throughout; responsive rules extend the existing 420px handling (390x844/200% class of viewports). Storage-denial falls back to the in-memory local goal and reports a truthful zero/idle pending state.
- Documentation statuses updated (`DESIGN_STATUS.md`, `PRODUCT_STATUS.md`) with the same truth claims.

## Evidence

- RED-first: the new test file failed on module/behavior absence before components existed; then GREEN after implementation.
- Focused suite `test/learner-profile-settings.test.tsx`: 14/14 passed.
- Full website suite: 243/243 passed (36 files).
- Website `typecheck` and `next build` completed successfully; full repo Prettier check, queue/documentation-governance/AI-continuity validators, dashboard tests, and `git diff --check` all passed.
- Visual: 390x844/200% RTL screenshot review not captured in this environment (no live prototype server reachable from the execution host); the review checklist item remains open for the independent reviewer or a local-prototype browser pass.

## Verification

- `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx` (14/14)
- `pnpm --filter @learnbox/website test` (243/243)
- `pnpm --filter @learnbox/website typecheck`
- `pnpm --filter @learnbox/website build`
- `pnpm format:check`
- `pnpm verify:ai-worker-queue`, `pnpm verify:documentation-governance`, `pnpm verify:ai-continuity`, `pnpm test:dashboard`, `git diff --check`

## Review

- Awaiting independent review of Draft PR #238. No secrets, credentials, phone numbers, or production configuration touched.
