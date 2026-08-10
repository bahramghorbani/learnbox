# LearnBox project state

**Scope:** stable `main` only. This is a concise operational index, not a replacement for the
product specification or storyboard.

## Stable position

- **Storyboard:** [23 of 30 — Closed alpha](./docs/storyboard/STATUS.md). This stage is active by
  design and must not be reset.
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
- **Closed-alpha invite + consent boundary:** an allowlist invite-code gate with consent
  acknowledgment, keyed-hash persistence (migration 0010) and consent versioning is implemented
  (merged PR #4). The invite UI and server flags remain disabled by default; no invitation has
  been sent.
- **Start pack V2 media:** the 20 approved 1024px card images are versioned, stored privately in
  `learnbox-media-private`, and receipt-attested. Session-guarded media delivery prefers V2 images
  while retaining the verified V1 German audio. No public or participant release flag is enabled.

## Release and safety posture

- Closed alpha is still private. Provider and learner-release seams remain disabled by default
  unless a committed, owner-approved activation record says otherwise.
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
