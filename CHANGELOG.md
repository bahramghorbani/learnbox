# Changelog

## 0.1.0 — Foundation

- Initial monorepo, governance, shell applications, learning engine, database draft, and CI.

## Stage 23 — Closed alpha hardening

Compatibility and hardening work landed on `main` after the foundation. All provider, release and
production seams remain disabled by default and owner-gated.

### Learning experience

- Adaptive daily session composition with bounded recovery sessions.
- Multi-card review session state, review resume after interruption and calm learning streak.
- Daily review progress persisted on device, safe offline fallback and offline-sync queue with
  idempotent client events.
- Personal vocabulary form with duplicate prevention and device-local persistence.
- RTL onboarding goal flow, learner progress flow, searchable vocabulary and pronunciation control.
- Canonical Bobo identity, expression assets and offline fallback with Bobo.
- In-app installation guide, installable PWA foundation and offline return shell.
- Disabled supportive Plus offer behind a feature flag.

### Content and AI review

- Versioned learning content validation and atomic content review boundary.
- Content pack release-readiness gate and quality guards.
- Review-gated Start slice candidates, drafts and scheduled media.
- Start/Plus client experience adapter and consent-gated analytics core.

### Identity, auth and media

- Local phone authentication prototype, provider-neutral billing foundation.
- Fail-closed OTP provider boundary with rate limits, verification coordinators and a prepared
  SMS.ir delivery client (disabled by default).
- Guarded private media delivery and uploader with receipt validation.
- Owner passkey boundary for the admin app: bootstrap/reauth routes, keyed-hash store, UI gate and
  source validator (disabled by default).
- Closed-alpha invite + consent boundary: allowlist invite-code gate, HMAC-keyed persistence and
  consent versioning (disabled by default; no invitation sent).
- Authenticated Start media client seam with neutral failure fallback.

### Infrastructure and security

- Same-server learner app isolated as one service on the shared edge network.
- Baseline web and API security headers, dependency audit and Flutter checks in CI.
- Ten checksum-attested PostgreSQL migrations covering content review, entitlement tiers, OTP
  challenges, owner passkey auth and invite access.
