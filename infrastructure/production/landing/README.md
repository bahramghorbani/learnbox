# LearnBox landing production stack

This stack builds only `apps/learnbox-website` and serves it behind Caddy.
It intentionally excludes the learner application, API, mobile app, packages,
and services from the Docker build context.

Caddy serves the canonical production host `learnboxapp.com` and permanently
redirects `www.learnboxapp.com` to it while preserving the path and query string.
Both hostnames must have DNS records pointing at the production server before
starting the stack so Caddy can obtain and renew origin TLS certificates.

Use a commit SHA for `LANDING_VERSION`; do not use `latest` for releases.

The same Caddy instance also reserves `app.learnboxapp.com` for the isolated
`learner-app` service on the external `learnbox-edge` network. That service is
owned by `../app/compose.yaml`; the landing compose file does not receive its
database, OTP, session or private-media environment values. Reload Caddy for the
app host only after the app container is healthy and the owner has approved the
public DNS/domain action.
