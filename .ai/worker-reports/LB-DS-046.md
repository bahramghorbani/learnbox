# LB-DS-046 — Web M3-S1 versioned sound preference

- Status: review_requested
- Branch: `feature/m3-web-sound-preference`
- Base commit: `7dba5adab77b0b90a228ac8c7aabab0bc54e3830` (`origin/main`, M3-S1 coordination merge)
- Head commit: `2715ff9ea5950320f1cb9d707c019bde43a5804b` (implementation + tests; docs/status commit follows)
- Draft PR: not opened — task scope is a local implementation commit without push/merge
- Scope completed: yes (implementation and local verification)
- Files changed: `apps/website/app/LearnerHome.tsx`, `apps/website/app/components/SettingsScreen.tsx`, `apps/website/app/components/PronunciationButton.tsx`, `apps/website/app/globals.css`, `apps/website/app/sound-preference.ts` (new), `apps/website/test/learner-profile-settings.test.tsx`, `.ai/WORK_QUEUE.md`, `.ai/worker-reports/LB-DS-046.md`, `CURRENT_WORK.md`, `docs/design/DESIGN_STATUS.md`, `docs/PRODUCT_STATUS.md`
- Checks run: RED→GREEN focused tests (7 module + 6 Settings + 12 ProfileScreen/LearnerNav + 9 shell = 30/30); full website test suite 259/259 (36 files); website `typecheck`; website production `build`; Prettier `format:check`; `verify:ai-worker-queue`; `verify:documentation-governance`; `verify:ai-continuity`; `test:dashboard`; `git diff --check`
- Checks unavailable: real-browser screenshot review was not performed (no visual claim is made); independent code/product review remains for the reviewing agent
- Remaining work: Android M3-S1 (LB-DS-047); server identity reads (M3-A1); open a Draft PR and merge after independent review
- Risks: default-on recovery of an unknown future record re-enables sound until that future version is understood (documented, matches default-on compatibility); save-error `role="alert"` branch is intentionally absent because the resilient memory fallback makes a failed write unreachable — denial is surfaced as a truthful non-durable label instead; audio-button disabled state is visual/real and removes the control from the tab order (keyboard users still toggle via Settings)
- Secrets or production changes: none
- Bobo canonical status: unchanged

## Scope

- Added `apps/website/app/sound-preference.ts`: one versioned device-local record under
  `learnbox:sound-preference:v1:local-prototype` stored as `{"version":1,"enabled":boolean}`.
  Reads default to enabled; malformed records and unknown future versions recover to enabled
  (read-only — no rewrite, no deletion of unrelated keys). Writes report `'durable' | 'session'`;
  a denied/failing `localStorage` falls back to a module-level in-memory store for the open
  session and is labelled non-durable so the UI never claims a permanent save that did not happen.
  No server, sync, auth, flag or learning-engine change.
- `SettingsScreen` renders the first hierarchy row «پخش تلفظ» as a real labelled switch
  (`role="switch"`, real `aria-checked`, focus-visible outline, 78 px row touch target, device-local
  badge «روی این دستگاه») plus a polite `role="status"` save line that reports either the durable
  save or the non-durable session-only outcome. Sound row joins, does not replace, the goal/text/
  language rows; no reminder, sign-out or deletion surface is added.
- `LearnerHome` loads the preference once on mount (default enabled), owns the single source of
  truth, passes it to Settings and to every `PronunciationButton`, and persists toggles through
  `saveSoundPreference`.
- `PronunciationButton` accepts `soundEnabled` (default true). When off the button is a real
  disabled control and both the `Audio` path and the `speechSynthesis` path are unreachable; the
  label and visible text change to «پخش تلفظ خاموش است» / «تلفظ خاموش است».
- `globals.css` adds the switch track/thumb (logical RTL inset properties), focus-visible outline,
  polite save-status style and a muted disabled audio-button state; motion uses the shared
  reduced-motion rule.

## RED→GREEN evidence

- RED 1 (module): adding the versioned-record tests produced
  `Failed to resolve import "../app/sound-preference"` — no module existed. After
  `sound-preference.ts` the 7 module tests passed.
- RED 2 (Settings): four new switch/status tests failed (no `[role="switch"]`, missing props)
  before `SettingsScreen` gained the sound row; GREEN 6/6 after implementation.
- RED 3 (shell): four LearnerHome integration tests failed before wiring (missing `aria-checked`,
  playback not gated, no persistence); GREEN after wiring. One controlled-component assertion
  (standalone `aria-checked` flip) was moved to the shell flow where the real parent state lives,
  and the storage-denial test tolerates a pre-onboarded session left by the neighbouring
  denial test's shared module memory.
- Final focused file: 30/30; full website suite: 259/259 (36 files).

## Verification

- `pnpm --filter @learnbox/website exec vitest run test/learner-profile-settings.test.tsx` (30/30)
- `pnpm --filter @learnbox/website test` (259/259)
- `pnpm --filter @learnbox/website typecheck`
- `pnpm --filter @learnbox/website build`
- `pnpm format:check`; `pnpm verify:ai-worker-queue`; `pnpm verify:documentation-governance`;
  `pnpm verify:ai-continuity`; `pnpm test:dashboard`; `git diff --check`

## Responsive / accessibility review (honest limits)

- Semantics are verified by DOM assertions: labelled `role="switch"` with real `aria-checked`,
  polite `role="status"` save region, real disabled pronunciation control, Persian RTL row order
  with LTR German content unchanged.
- No real-browser screenshot or viewport measurement was performed in this task; the RTL
  switch/thumb uses logical CSS (`inset-inline-*`) so it mirrors correctly, and the 200%-text /
  390 px no-overflow claim from M3-P1 is not re-measured here. A visual/browser pass plus the
  independent code/product review remain open review items.
