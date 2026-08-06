# Environments

Local, development, staging, and production are separate. Each has separate database, storage, provider credentials, observability, and feature flags. Production requires infrastructure as code and explicit owner approval.

Database migrations run through `pnpm --filter @learnbox/api migrate`. The runner records a SHA-256
checksum for each numbered migration, serializes concurrent runs with a PostgreSQL advisory lock,
and applies every pending file in its own transaction. It refuses to continue if an already-applied
migration was edited.

Use `.env.example` only as a local shape reference. Real environment files stay ignored, and production values must be supplied through the approved deployment secret store. `OTP_DEVELOPMENT_MODE` defaults to false and must never be enabled in production. The approved SMS.ir key and independent OTP/session secrets exist only in the protected Vercel Preview environment and delivery remains disabled. The internal same-server smoke deployment has a mode-`600` app-only environment with generated disposable secrets, an unreachable database URL and every provider flag disabled; it is not an activation environment. Secrets are never copied into the landing container or committed. See [OTP provider activation](OTP_PROVIDER_ACTIVATION.md), [the isolated learner-app stack](../../infrastructure/production/app/README.md) and [the current server deployment record](LEARNER_APP_SERVER_DEPLOYMENT.md).
