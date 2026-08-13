# LearnBox project state

**Scope:** stable `main` only. This is a concise operational index, not a replacement for the
product specification or storyboard.

## Stable position

- **Storyboard:** [24 of 30 — Beta and load testing](./docs/storyboard/STATUS.md). Stage 23 exited
  after the owner-controlled Preview invitation, OTP/session and private-media journey passed; the
  storyboard must not be reset.
- **Product authority:** [`docs/product/MASTER_SPEC.md`](./docs/product/MASTER_SPEC.md), approved
  product decisions, architecture ADRs and the current storyboard.
- **Application boundary:** learner product is `apps/website`; public marketing is
  `apps/learnbox-website`. They share the monorepo but must not be rebuilt into one application.
- **Bobo:** canonical approved identity and versioned assets are governed by
  [`PDR-003`](./docs/product-decisions/PDR-003-BOBO-VISUAL-VOCABULARY.md). Do not alter the
  appearance without explicit owner approval.
- **Admin passkeys:** a single-owner WebAuthn boundary, passkey UI gate, session store and
  activation runbook are implemented. The server and UI flags remain disabled by default; no
  enrollment, deployment or production activation has occurred.
- **Owner splash replacement:** migration `0011`, private image normalization, atomic current
  pointer promotion, protected preview/upload routes, explicit-confirmation UI and activation
  runbook are implemented. Learner delivery uses a separately gated same-origin byte stream with
  the bundled launch image as fallback. Both server flags remain false; no production upload or
  app-icon management is included.
- **Closed-alpha invite + consent boundary:** an allowlist invite-code gate with consent
  acknowledgment, keyed-hash persistence (migration 0010) and consent versioning is implemented
  (merged PR #4). The owner approved consent version `v1` and a maximum group size of five on
  2026-08-11, then approved private-message delivery and a two-person first cohort. On 2026-08-12
  the owner-controlled Preview journey completed invite consent, SMS.ir OTP, secure-session
  creation, three daily cards and authenticated private-image delivery. No code, phone or OTP is
  recorded; every temporary Preview flag was returned to `false` and no participant invitation was
  sent by the repository workflow.
- **Start pack V2 media:** the 20 approved 1024px card images are versioned, stored privately in
  `learnbox-media-private`, and receipt-attested. Session-guarded media delivery prefers V2 images
  while retaining the verified V1 German audio. No public or participant release flag is enabled.
- **Stage 24 local load foundation:** the learner app has a bounded concurrent synthetic runner,
  restricted to loopback HTTP on port `3010` and public read-only routes. Smoke, baseline and
  stopped-server recovery checks use aggregate-only evidence; Preview, Production, provider and
  real-user traffic remain excluded. See
  [`STAGE_24_LOAD_TESTING.md`](./docs/operations/STAGE_24_LOAD_TESTING.md).
- **Stage 24 learning-engine guardrail:** `pnpm test:engine-load` exercises 100,000 deterministic
  review transitions and 10,000 retry-queue events. It is CPU-only and therefore is not evidence of
  Flutter, Preview or Production capacity.
- **Native mobile host:** generated Android and iOS hosts are versioned with the Android Gradle
  wrapper, CI builds a non-release debug APK, and the local Android emulator completed an install
  and visual smoke. The approved icon and a static three-second Flutter launch image are packaged
  in the native host. A first physical low-end Android baseline was recorded on a Xiaomi M2006C3LG;
  see [`STAGE_24_ANDROID_BASELINE.md`](./docs/operations/STAGE_24_ANDROID_BASELINE.md). The native
  app now includes the first approved offline learning-loop slice: exactly three canonical Start
  cards, active recall, four grades and a secure device-local pending-event queue. A reviewed
  provider-neutral foreground sync coordinator is present with a maximum batch of twenty, exact
  acknowledgement validation and no-data-loss failure behavior; production supplies only a
  `signedOut` identity state and disabled transport, with no UI trigger or network client. It
  performs no upload, authentication or server acknowledgement and is not a released mobile
  product.

## Release and safety posture

- Beta/load-test preparation is private. Provider and learner-release seams remain disabled by
  default unless a committed, owner-approved activation record says otherwise; Stage 24 does not
  authorize a real beta cohort or production traffic.
- Do not infer production readiness from a prototype, screenshot, healthy endpoint or successful
  local test. Validate code publication, deployment, infrastructure state and the relevant user
  flow separately.
- The main quality command is `pnpm check`. Feature-boundary validation also includes
  `pnpm build` and `node scripts/validate-migrations.mjs`; run relevant Flutter checks when mobile
  code changes.

## Source hierarchy

1. Product and security authority: `docs/product/`, approved PDRs and ADRs.
2. Stable operational position: this file.
3. Unmerged implementation state: [`CURRENT_WORK.md`](./CURRENT_WORK.md) plus live Git and PRs.
4. Agent procedure and capability mapping: [`AI_BOOTSTRAP.md`](./AI_BOOTSTRAP.md) and `.ai/`.

## Owner boundary

Proceed autonomously on ordinary reversible technical work. Ask the owner only for credentials,
paid services, legal acceptance, destructive or irreversible actions, and production activation.
