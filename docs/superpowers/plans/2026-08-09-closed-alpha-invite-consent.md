# Closed-Alpha Invite + Consent Boundary Implementation Plan

**Goal:** Add a disabled-by-default invitation and consent boundary to the learner web app so a
participant can only enter after an allowlist invite code is accepted and the closed-alpha consent
wording is explicitly acknowledged.

**Architecture:** Pure policy, coordinator and PostgreSQL store live in `apps/api/src/alpha/`
(mirroring `apps/api/src/auth/`); the same-origin HTTP seam lives in `apps/website` route handlers
(mirroring `lib/otp-http.ts` / `lib/otp-runtime.ts`). A client gate renders before the existing
auth gate and is invisible when the flag is off.

**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL (migration 0010), Vitest.

## Global Constraints

- All release flags default to `false` in `.env.example`; every server path fails closed with
  `!== 'true'` checks and 404/503 responses when disabled.
- Invite codes are never committed, logged or stored in plaintext; PostgreSQL holds keyed HMAC
  hashes only (server secret `LEARNBOX_ALPHA_INVITE_SECRET`, ≥32 chars).
- No localStorage/sessionStorage/console. in gated UI or API code; no local fallback for the
  server path; no consent checkbox — an explicit acknowledgment button only.
- No data-deletion endpoint (owner-gated per `docs/operations/CLOSED_ALPHA.md`).
- Never work on `main`; branch + PR only; no push until the owner refreshes the gh token.
- Write a failing focused test before each implementation change.

---

### Task 1: Config, Migration and Persistence Contract

**Files:**

- Modify: `config/closed-alpha.json` (add `consent.version: "v1"`, `inviteCodeMaxUses: 5`)
- Modify: `scripts/validate-closed-alpha.mjs` (consent version, max uses, no committed codes)
- Create: `database/migrations/0010_invite_access.sql`
- Create: `apps/api/test/invite-migration.test.ts`

**Schema contract:** `invite_codes` (keyed hash PK, bounded max/used count, optional expiry),
`invite_consents` (code-hash-keyed acknowledgements with version), `invite_request_events`
(opaque IP hash windows). No plaintext code/phone/consent-text columns.

- [x] Add a failing migration source test.
- [x] Run the focused test and confirm the missing migration fails.
- [x] Add migration `0010` without modifying earlier checksum-attested migrations.
- [x] Run `node scripts/validate-migrations.mjs` (contiguity).
- [x] Extend `scripts/validate-closed-alpha.mjs` and confirm `pnpm verify:alpha` passes.
- [x] Commit with `feat: add invite code and consent persistence`.

### Task 2: Pure Policy, Coordinator and Postgres Store

**Files:**

- Create: `apps/api/src/alpha/invite-policy.ts`
- Create: `apps/api/src/alpha/invite-access.service.ts`
- Create: `apps/api/src/alpha/postgres-invite-access.store.ts`
- Create: `apps/api/test/invite-policy.test.ts`, `invite-access.service.test.ts`,
  `postgres-invite-access.store.test.ts`

**Contracts:** strict ASCII code format; keyed HMAC hash; constant-time comparison; per-IP sliding
window (5 per 15 min); advisory-locked transaction that validates the code, records consent
`ON CONFLICT DO NOTHING`, consumes one use and records the request event atomically; generic
`invalid`/`limited` rejection outcomes.

- [x] Failing tests first (format, hashing, rate window, store rollback paths).
- [x] Implement policy, service and store.
- [x] `pnpm --filter @learnbox/api build` + focused tests green.
- [x] Commit with `feat: add invite access policy and store`.

### Task 3: Website Runtime and HTTP Seam

**Files:**

- Create: `apps/website/lib/alpha-runtime.ts`, `apps/website/lib/alpha-http.ts`
- Create: `apps/website/app/api/auth/invite/check/route.ts`
- Create: `apps/website/test/alpha-runtime.test.ts`, `alpha-http.test.ts`

**Contracts:** fail-closed env factory (`null` unless `LEARNBOX_ALPHA_INVITE_ENABLED === 'true'`);
consent version from `LEARNBOX_ALPHA_CONSENT_VERSION` (deployment override) or
`config/closed-alpha.json`; same-origin JSON POST guard; `invite_invalid`/`invite_limited`/
`invite_unavailable` error codes; 204 on success; 404 when disabled; no session cookie minted
(the OTP flow owns learner sessions).

- [x] Failing tests first (config null paths, handler mappings, disabled route 404).
- [x] Implement runtime, handler and route.
- [x] `pnpm --filter @learnbox/website build` + typecheck + focused tests green.
- [x] Commit with `feat: add invite check route`.

### Task 4: Client Gate and Learner Home Wiring

**Files:**

- Create: `apps/website/app/alpha-invite-mode.ts`
- Create: `apps/website/app/components/InviteGate.tsx`
- Modify: `apps/website/app/LearnerHome.tsx`
- Create: `apps/website/test/alpha-invite-mode.test.ts`, `invite-gate.test.tsx`

**Contracts:** pure mode resolver (`'local-prototype' | 'server-invite'`); gate renders nothing in
local mode; server mode shows the approved consent wording verbatim and a single invite-code
input with an explicit acknowledgment action; `fetch('/api/auth/invite/check')` posts only the
code; success only on exact 204; the invite gate renders before the auth gate in `LearnerHome` and
is byte-for-byte invisible when the flag is off.

- [x] Failing tests first (mode table, `.env.example` default, gate behavior with fetch mock).
- [x] Implement resolver, gate and wiring.
- [x] Website tests, typecheck and build green.
- [x] Commit with `feat: gate learner home behind invite consent`.

### Task 5: Boundary Validator and Check Wiring

**Files:**

- Create: `scripts/validate-alpha-invite-boundary.mjs`
- Modify: `package.json` (`verify:alpha-invite-boundary` in the `check` chain)

**Assertions:** both flags `=false` in `.env.example`; fail-closed runtime check present; route 404
when disabled; handler error codes and 204; keyed HMAC hashing; consent wording verbatim; no
storage/console/checkbox in the gate; invite gate precedes auth gate in `LearnerHome`; closed-alpha
config stays disabled with a versioned consent and no plaintext codes.

- [x] Create the validator; run it green.
- [x] Wire `pnpm verify:alpha-invite-boundary` into `check`.
- [x] Commit with `chore: wire invite boundary validation`.

### Task 6: Documentation and State

**Files:**

- Modify: `docs/operations/CLOSED_ALPHA.md`, `docs/operations/AGENT_ACTIVE_BRIEF.md`,
  `CURRENT_WORK.md`, `.env.example`

**Contracts:** the invitation boundary is recorded as disabled by default with HMAC-only storage,
consent versioning and rollback (flip flags to false); the active-work registry lists the branch;
`.env.example` documents the two flags and the secret placeholder.

- [x] Commit with `docs: record closed-alpha invite boundary`.

---

## Final Verification

```bash
pnpm --filter @learnbox/api build
pnpm --filter @learnbox/api test -- invite-migration invite-policy invite-access postgres-invite-access
pnpm --filter @learnbox/website build
pnpm --filter @learnbox/website test -- alpha-runtime alpha-http alpha-invite-mode invite-gate
node scripts/validate-alpha-invite-boundary.mjs
node scripts/validate-closed-alpha.mjs
node scripts/validate-migrations.mjs
pnpm check
pnpm build
pnpm audit --prod --audit-level=high
```

No flag enabled, no invitation sent, no deployment. PR creation follows once the owner refreshes
the GitHub token (`gh auth refresh -h github.com -u bahramghorbani`).
