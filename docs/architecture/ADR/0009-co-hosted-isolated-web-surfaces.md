# ADR 0009 — Co-hosted but isolated landing and learner web app

- **Status:** accepted for deployment preparation; public app routing pending
- **Date:** 2026-08-06

## Context

The public marketing landing is already served from the production server at
`learnboxapp.com`. The learner web app must eventually use the same server,
without allowing landing changes to rebuild, restart, configure or roll back the
learner app, and without exposing learner secrets to the public marketing
surface.

## Decision

- Keep `apps/learnbox-website` as the marketing-only codebase and
  `apps/website` as the learner application.
- Serve the landing at `learnboxapp.com` and reserve
  `app.learnboxapp.com` for the learner app. The active domain was verified on
  2026-08-06; `learnbox.com` had no resolvable DNS record at that time.
- Build two independent immutable Docker images from separate Dockerfiles.
- Run the learner app in its own Compose project with no host port. Share only
  the external `learnbox-edge` network with Caddy.
- Give database, OTP, session and private-media values only to the learner-app
  container. The landing service receives none of them.
- Keep release commands and rollback image tags independent. A learner-app
  rollback must not restart the landing or make a destructive database change.
- Keep the existing Vercel learner-app Preview as a temporary non-production
  verification surface. It is not the production routing authority and does not
  change the same-server target.

## Consequences

Caddy remains the only public listener on ports 80 and 443. A compromise or
deployment failure in the landing does not automatically disclose learner
secrets, and app releases do not rebuild the marketing site. DNS creation,
Caddy reload, restricted server secret entry and first real SMS delivery remain
explicitly approved operational actions.

## Reversal trigger

Revisit this decision if the owner selects another verified canonical domain or
if separate physical hosts become necessary. Preserve the same independent
build, secret and rollback boundaries in either case.
