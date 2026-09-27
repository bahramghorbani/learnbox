# LearnBox learner-app production service

This stack deploys only `apps/website` and its server-side OTP dependencies. It
does not build or copy `apps/learnbox-website`. The public landing and learner
application therefore keep independent images, environment values, release
commands and rollback points while sharing only the server's `learnbox-edge`
Docker network.

## Intended routing

- `https://learnboxapp.com` → `landing:3000`
- `https://app.learnboxapp.com` → `learner-app:3000`

The active production domain is currently `learnboxapp.com`. A future domain
change must update DNS, Caddy, canonical metadata and rollback notes together;
do not hard-code an unverified alternative inside the learner application.

## Server preparation

1. Deploy the landing stack first so the external `learnbox-edge` network and
   Caddy exist.
2. Copy `app.env.example` to an ignored `app.env` on the server and restrict it
   to the deployment account (`chmod 600 app.env`).
3. Replace every placeholder using the server secret workflow. Do not reuse a
   landing value for `LEARNBOX_OTP_SECRET` or `LEARNBOX_SESSION_SECRET`.
4. Keep `SMS_IR_ENABLED=false` and
   `LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false` for the first health check.

Render the configuration without starting anything:

```bash
docker compose --env-file app.env --file compose.yaml config --quiet
```

Build and run database migrations before the first app start:

```bash
docker compose --env-file app.env --file compose.yaml build learner-app
docker compose --env-file app.env --file compose.yaml run --rm learner-app \
  node apps/api/dist/database/run-migrations.js
docker compose --env-file app.env --file compose.yaml up -d learner-app
```

Do not create a host port for the app. Caddy reaches it through the shared
network. DNS, Caddy reload, first real SMS delivery and public promotion remain
explicit release actions.

## Rollback

Record the current app image tag before every deployment. To roll back, restore
that immutable tag and run `docker compose up -d learner-app`; do not rebuild or
restart the landing service, change DNS, or roll back the database destructively.
