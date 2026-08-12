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
- Single-owner splash replacement boundary: private image normalization, atomic version promotion,
  authenticated preview/upload routes, learner same-origin delivery with bundled fallback and an
  explicit-confirmation UI (disabled by default).
- Closed-alpha invite + consent boundary: allowlist invite-code gate, HMAC-keyed persistence and
  consent versioning (disabled by default; no invitation sent).
- Authenticated Start media client seam with neutral failure fallback.

### Infrastructure and security

- Same-server learner app isolated as one service on the shared edge network.
- Baseline web and API security headers, dependency audit and Flutter checks in CI.
- Eleven checksum-attested PostgreSQL migrations covering content review, entitlement tiers, OTP
  challenges, owner passkey auth, invite access and immutable splash replacement state.
- The approved closed-alpha Preview journey completed invite consent, real SMS.ir OTP,
  secure-session creation, three daily cards and authenticated private-image delivery. The Neon
  project connection now supplies a managed `DATABASE_URL`, diagnostic logs remain secret-free and
  every temporary Preview flag was returned to `false` after verification.

## Stage 24 — Beta and load testing

Stage 24 begins with synthetic, non-personal load scenarios and explicit stop/rollback thresholds.
No real beta cohort, production service or public release is activated by this transition.

- Local-only concurrent learner load profiles now reject non-loopback targets, use public read-only
  routes, emit aggregate-only results and have a stopped-server recovery check. The local smoke and
  baseline runs passed with zero failures; no Preview, Production, provider or real-user traffic was
  used.
