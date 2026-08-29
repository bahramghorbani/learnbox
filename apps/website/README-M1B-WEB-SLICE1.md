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

## Exact blocker: why the Today screen is not server-wired

The only existing route the Web app could call for learner state is the M1-D slice-1
snapshot `GET /api/learner/state`
(`apps/api/src/learner-state/learner-state-http.ts`, merged in PR #152). It is **not
exposed by any Next.js route** in `apps/website/app/api/**` — only `apps/api`'s NestJS
`main.ts` serves it, and it requires a `Bearer` access token issued by the **mobile**
session contract (`LEARNBOX_MOBILE_SESSION_SECRET`, audience `learnbox-mobile`). The Web
learner surface authenticates with the **browser** learner cookie
(`learnbox_alpha_session`, HMAC `LEARNBOX_SESSION_SECRET`) via `lib/server-session.ts`,
which is a different audience and format. There is no Web route and no Web credential that
can satisfy the snapshot route.

Additionally, the snapshot returns **schedule rows + a due-card plan** keyed by
`contentId`/`cardId` (DB `card_schedules`), while the Web Today surface composes its
session from the **bundled Start pack** (`content/packs/learnbox-start/...`) keyed by
`start-a1-*` ids. No existing route maps Start-pack content to `card_schedules` content
ids; the contract (`docs/architecture/M1_ONLINE_LEARNING_CONTRACT.md` §3.2) records the
`cardId` ↔ `contentId` mapping as unsolved.

Per the M1-B task rules, wiring the Web Today screen to the snapshot would require either:

1. a new Web route exposing the snapshot with the Web learner-cookie boundary (new code,
   not an "existing route"), or
2. the mobile session contract on Web (out of scope: mobile/admin/API secrets),
   plus the Start-pack ↔ content-id mapping contract (M1-A open item).

Both are explicitly out of this slice's bounds ("no API, no inventing routes"). The
truthful local slice above is the smallest compliant deliverable; the `server-backed`
label exists and is tested so the future wiring is a one-line switch plus a fetch.

## Deliberate limits

- No `apps/website/app/api/**` route added; no API/mobile/admin/docs/queue/deployment
  edits; no secrets.
- Today still uses the bundled Start pack (device-local); counts remain device-local and
  are labelled as such.
- No loading/empty/error fetch states added because there is no fetch — adding them would
  be untruthful UI for a route that does not exist. They are D1 states for the future
  server-wired slice (see `docs/design/D1_LEARNER_UI_KIT.md` §5).
- Removed now-unused `defaultSuggestedNewWords` import from `LearnerHome`.
