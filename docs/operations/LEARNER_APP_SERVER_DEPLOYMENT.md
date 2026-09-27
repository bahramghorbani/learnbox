# Learner app same-server deployment

## Current internal release

- Source commit: `3f8f113`
- Release directory: `/srv/learnbox/releases/3f8f113-app-internal`
- Compose project: `learnbox-app-production`
- Service: `learner-app`
- Image: `learnbox-learner-app:3f8f113-internal`
- Shared network: `learnbox-edge`
- Public host port: none
- Public Caddy route: not activated

The internal release was built and started on 2026-08-06. Its container health
check passed, the root route returned HTTP 200 from inside the container, and
Caddy reached `learner-app:3000` over the shared private network. The OTP request
route returned the expected fail-closed HTTP 503 response because SMS delivery
is disabled. The existing landing container remained healthy throughout.

## Security boundary

The internal smoke-test environment uses independent generated session and OTP
secrets, an intentionally unreachable database URL, no SMS.ir API key and no
Blob token. Both `SMS_IR_ENABLED` and
`LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED` are false. These values prove only
container and network health; they must never be promoted as real alpha or
production credentials.

The ignored server file `app.env` is mode `600` and belongs only to the app
release. The landing container does not receive any learner-app environment
value.

## Activation boundary

Before `app.learnboxapp.com` can be public:

1. install the approved restricted database, OTP/session, SMS.ir and private
   media values through the server secret workflow;
2. rerun migrations and a disabled-provider health check;
3. perform one owner-controlled OTP test before enabling participant access;
4. create and verify the DNS record;
5. validate and reload Caddy, then verify HTTPS and rollback readiness.

DNS creation, live Caddy reload, real SMS delivery and participant access remain
explicit owner-approved actions.

## Rollback

The app is currently internal, so rollback is isolated from the landing:

```bash
cd /srv/learnbox/releases/3f8f113-app-internal/infrastructure/production/app
docker compose --env-file app.env --file compose.yaml down
```

This removes only the learner-app container and its Compose resources. It does
not restart Caddy or the landing service, change DNS, delete the immutable image,
or modify learner data.
