# LearnBox landing production stack

This stack builds only `apps/learnbox-website` and serves it behind Caddy.
It intentionally excludes the learner application, API, mobile app, packages,
and services from the Docker build context.

Before DNS cutover, keep `SITE_ADDRESS=:80`. After the Cloudflare `A` records
resolve to the server, set `SITE_ADDRESS=learnboxapp.com,www.learnboxapp.com` so
Caddy obtains and renews origin TLS certificates automatically.

Use a commit SHA for `LANDING_VERSION`; do not use `latest` for releases.
