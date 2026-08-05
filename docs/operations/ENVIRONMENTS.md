# Environments

Local, development, staging, and production are separate. Each has separate database, storage, provider credentials, observability, and feature flags. Production requires infrastructure as code and explicit owner approval.

Database migrations run through `pnpm --filter @learnbox/api migrate`. The runner records a SHA-256
checksum for each numbered migration, serializes concurrent runs with a PostgreSQL advisory lock,
and applies every pending file in its own transaction. It refuses to continue if an already-applied
migration was edited.

Use `.env.example` only as a local shape reference. Real environment files stay ignored, and production values must be supplied through the approved deployment secret store. `OTP_DEVELOPMENT_MODE` defaults to false and must never be enabled in production. SMS/identity provider credentials are not configured yet; the provider boundary fails closed until the owner has approved an adapter, account, terms, and secret-store configuration. See [OTP provider activation](OTP_PROVIDER_ACTIVATION.md).
