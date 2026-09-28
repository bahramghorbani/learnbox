# Changelog

## v1.1.0 — Option B (implemented on `release/v1.1.0`, not deployed)

Production still runs v1.0 at `2acdcef4`; database migration `0019` is not applied there.

### Learner-facing

- Account deletion from Settings: phone-confirmed, CSRF-protected, POST-only. Deletion removes
  learner data while preserving a privacy-minimized deletion audit record and a purchase-ownership
  claim, is idempotent through a `request_id` unique index, and expires the session cookie so a
  stateless session cannot outlive the account. **Not Production-proven** — requires post-deploy
  end-to-end verification with a dedicated test account.
- Telegram support route (`@learnboxsupportbot`) in the profile, also serving as the OTP delivery
  escape path.
- Privacy notice rewritten against the real system: hashed short-lived OTPs, per-phone and per-IP
  rate limiting, 30-day backup retention, and the honest statement that deletion does not
  immediately purge backups.
- Learner profile identity: one canonical masked-phone helper shared by every endpoint, rendered in
  Persian digits. Two endpoints had previously disagreed about the same field, and one emitted
  mixed Persian/Latin digits.
- Review-sync status now describes actual behaviour instead of claiming automatic sync is disabled
  while it was in fact running.

### Operations

- Daily database backup, uptime monitoring, error capture and a weekly restore drill as systemd
  timers, alerting through `@learnboxmonitoringbot`. Operational alerting and learner support are
  strictly separate bots with separate tokens and chats.
- Secret redaction in error capture proven with planted fake secrets.
- Uptime monitoring is availability-only until `/api/health` deploys; afterwards set
  `LEARNBOX_MONITOR_HEALTH_PATH=/api/health` and re-verify.
- Backup and restore drill are proven by manual runs. An enabled timer is not a successful
  scheduled execution; the first real scheduled run of each is recorded separately.

### Integrity

- The canonical Starter media manifest now models media exposure and release stage independently.
  Authenticated-only media exposure is a permanent invariant enforced at every stage; the release
  stage is forward-only and a released claim must carry its Production verification evidence. The
  previous two-boolean schema could only ever describe the pre-release world.
- Canonical current documentation realigned to live reality, with historical incident, recovery and
  release records preserved as history.

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
- A CPU-only learning-engine profile now verifies 100,000 deterministic review transitions and
  10,000 retry-queue events, failing on scheduling or ordering invariants. It has no network target
  and is not evidence of Android, Preview or Production capacity.
