# ADR 0008 — Neon PostgreSQL for the closed-alpha server boundary

- **Status:** accepted and provisioned for non-production environments
- **Date:** 2026-08-05

## Context

The SMS.ir OTP flow requires durable, transactional challenge storage before any real message may
be delivered. LearnBox's preview application already runs on Vercel, while the repository's schema
and stores target PostgreSQL. No alpha database was previously connected.

## Decision

- Use the Vercel Marketplace Neon integration for the closed-alpha PostgreSQL database.
- Provision resource `learnbox-alpha-db` on Neon's free plan in Frankfurt (`fra1`).
- Connect it only to Vercel Preview and Development; Production remains deliberately unconnected.
- Disable Neon Auth because LearnBox owns OTP verification, learner identity mapping and signed
  sessions.
- Keep generated database credentials only in Vercel's environment store.
- Apply numbered migrations through the checksum-attested, advisory-locked transaction runner in
  `apps/api`; never paste connection strings into source, chat or operational logs.
- Require TLS certificate and hostname verification explicitly with `sslmode=verify-full`.

## Consequences

All eight current migrations are applied to the alpha database, and an immediate repeat run
applies zero changes. SMS.ir delivery remains disabled until its private key is installed and the
audited request/verify routes are connected. Production data, invitations and billing remain out
of scope.

## Reversal trigger

Disconnect and replace the integration if regional latency, reliability, privacy requirements,
pricing or operational controls are unsuitable. The standard PostgreSQL schema and `pg` adapter
keep this migration provider-neutral.
