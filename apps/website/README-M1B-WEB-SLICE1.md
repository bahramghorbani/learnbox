# M1-B Web slice 1 — Today truth label & server-wiring blocker

Status: Draft PR (`worker/m1b-web-learner-today`). Scope: `apps/website/**` only.

## What this slice delivers (tested, no invented behavior)

- Dedicated `TodayScreen` component (`apps/website/app/components/TodayScreen.tsx`) rendering
  the D1 Today states surface with a **truthful sync label** from
  `apps/website/app/learner-sync-state.ts`:
  - `local-only`: `این فهرست از بستهٔ درون‌دستگاهی همین دستگاه است و هنوز به سرور وصل نشده است.`
    (device-local bundled pack, not connected to any server).
  - `server-backed`: reserved for a future wired read; never rendered by the app today.
- `LearnerHome` Today screen now uses `TodayScreen` with `syncState="local-only"` — no code
  path claims server-backed state.
- Offline banner copy (`NetworkStatus`) now states explicitly that sync only happens after a
  server connection.
- Tests: `test/learner-sync-state.test.ts` + `test/learner-today-sync.test.tsx` (TDD: RED
  before the components existed, GREEN after).

## Historical blocker at the time of this slice

When this original slice landed, the only learner-state route was the M1-D slice-1 snapshot
`GET /api/learner/state` (`apps/api/src/learner-state/learner-state-http.ts`, merged in PR
#152). No Next.js route exposed it under `apps/website/app/api/**`; only `apps/api`'s NestJS
`main.ts` served it, using the mobile Bearer-session contract. The Web learner surface used
the separate browser learner cookie. PR #163 later added the cookie-authenticated Next.js
route described below.

At the time of this original slice, the snapshot returned **schedule rows + a due-card
plan** keyed by `contentId`/`cardId` (DB `card_schedules`), while the Web Today surface
composed its session from the **bundled Start pack** (`content/packs/learnbox-start/...`)
keyed by `start-a1-*` ids. The catalog identity contract had not yet been decided. ADR 0013
later made those bundled `start-a1-*` IDs the canonical immutable `cards.content_id`
values, and LB-DS-079 now returns selected learner-unscheduled cards with both identities.

Under the original M1-B task rules, wiring the Web Today screen would also have required a
new Web route exposing the snapshot with the Web learner-cookie boundary. That route and
identity bridge were then implemented in the follow-up described below. They were
explicitly out of the original slice's bounds ("no API, no inventing routes"), so its
truthful local-only state remains accurate historical scope rather than a current blocker.

## Deliberate limits

- No `apps/website/app/api/**` route added in slice 1; no API/mobile/admin/docs/queue/deployment
  edits; no secrets.
- Today still uses the bundled Start pack (device-local); counts remain device-local and are
  labelled as such.
- No loading/empty/error fetch states added in slice 1 because there was no fetch — adding
  them would be untruthful UI for a route that did not exist. They are implemented in the
  follow-up server-wired slice (ADR 0012), merged in PR #163 at `73cdb62`.
- Removed now-unused `defaultSuggestedNewWords` import from `LearnerHome`.

## Follow-up: server-wired learner-state read (merged, PR #163)

The follow-up slice implements the ADR 0012 contract and merged in PR #163 at `73cdb62`:

- `GET /api/learner/state` Next.js route (`apps/website/app/api/learner/state/route.ts`) behind
  the fail-closed `WEB_LEARNER_STATE_ENABLED=true` runtime; cookie `subject` (canonical
  `users.id` since PR #162) → `LearnerStateService`/`PostgresLearnerStateRepository` via the
  existing `api/dist` mount pattern. `401 invalidToken`, `400 validation`, `503
serverUnavailable`, all `no-store`.
- Today fetches the route (`lib/learner-state-web-client.ts`) only in `server-otp` mode and
  only after authentication; the snapshot is treated as server-backed only after a successful
  fetch and parse. Loading/error/offline fallbacks keep the truthful device-local label, and
  the local pending-sync chip is preserved. No sync acknowledgement is ever claimed.
- Start Pack ↔ canonical `contentId` intake is resolved by LB-DS-079: the server selects a bounded
  set of approved/published, learner-unscheduled `start-a1-*` cards and returns each selected UUID
  beside its authoritative `contentId`. The local prototype review path remains unchanged; server
  admission stays behind the existing dormant learner-state runtime.

## Follow-up hardening (M-L2 / M-L3, merged with this slice's tracking)

- M-L2: Today summary figures render Persian digits (`app/persian-digits.ts`,
  `toPersianDigits`), matching mobile `_persianDigits` parity (D0 §3 tabular numerals).
- M-L3: Today shows a pending-sync chip (`sync-status` + `today-chip` styles) with count
  only when the device-local queue read succeeds and returns > 0; empty queue and failed
  read render no chip (fail-closed). Copy never claims server acknowledgement
  («در انتظار همگام‌سازی» = awaiting sync, not synced); `syncState="local-only"` is
  preserved. Counts come from the same `learnbox:review-sync:v1:local-prototype` queue
  read that already drives the completion screen (`loadSyncQueue`).
