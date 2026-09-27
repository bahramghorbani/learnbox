# Architecture overview

The monorepo contains a Flutter mobile/PWA client, Next.js public and admin web shells, and a NestJS API boundary. PostgreSQL is the source of truth; Redis supports jobs and rate limiting; local-first clients upload idempotent review events. External SMS, storage, AI, push, analytics, and billing are provider abstractions. See `docs/architecture/SYSTEM_CONTEXT.md`.
