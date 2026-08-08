# Owner Passkey Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not delegate unless the owner explicitly changes the standing no-extra-agent preference.

**Goal:** Add a disabled-by-default, single-owner WebAuthn authentication boundary to the local LearnBox admin application.

**Architecture:** The admin Next.js application owns browser ceremonies and server route handlers. PostgreSQL stores one owner, multiple credentials, five-minute one-use challenges, and keyed-hash sessions. Pure policy/crypto helpers are separated from PostgreSQL adapters so security behavior can be tested without a live database.

**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL, `@simplewebauthn/server`, `@simplewebauthn/browser`, Vitest.

## Global Constraints

- Keep every admin auth endpoint unavailable unless `LEARNBOX_ADMIN_PASSKEY_ENABLED=true`.
- Bootstrap also requires `LEARNBOX_ADMIN_BOOTSTRAP_ENABLED=true`, zero active credentials, and a valid one-time secret.
- Never put bootstrap secrets, WebAuthn challenges, credential public keys, session tokens, cookies, raw IPs, or raw user-agent text in logs or audit metadata.
- Preserve one owner record. Additional passkeys attach to it and cannot create another administrator.
- Do not enroll a real passkey, deploy the admin app, configure DNS, or add production secrets.
- Use strict origin/RP-ID verification, `userVerification: 'required'`, one-use five-minute challenges, 15-minute idle sessions, eight-hour absolute sessions, and five-minute recent-auth windows.
- Write a failing focused test before each implementation change.

---

### Task 1: Persist the Singleton Owner and Passkey State

**Files:**

- Create: `database/migrations/0009_owner_passkey_auth.sql`
- Modify: `scripts/validate-migrations.mjs`
- Create: `apps/api/test/owner-passkey-migration.test.ts`

**Schema contract:**

- `admin_owner`: singleton key constrained to `1`, random WebAuthn user handle, timestamps.
- `admin_passkey_credentials`: credential ID, owner foreign key, public key bytes, counter, transports, device/backed-up metadata, active state and timestamps.
- `admin_webauthn_challenges`: keyed challenge hash, browser nonce hash, ceremony enum, expiry and consumed time.
- `admin_sessions`: keyed token hash, owner foreign key, CSRF hash, created/last-seen/absolute-expiry/revoked/recent-auth timestamps.
- Foreign keys, uniqueness and indexes make a second owner and challenge reuse impossible.

- [x] Add a failing migration source test for singleton constraints, credential uniqueness, expiry/revocation columns and the absence of plaintext token/challenge columns.
- [x] Run `pnpm --filter @learnbox/api test -- owner-passkey-migration.test.ts` and confirm the missing migration fails.
- [x] Add migration `0009` without modifying earlier checksum-attested migrations.
- [x] Extend migration validation only if needed to reject duplicate filenames or non-contiguous numbering without changing runtime migration semantics.
- [x] Run the focused test and `pnpm verify:migrations` if added, otherwise `node scripts/validate-migrations.mjs`.
- [x] Commit with `feat: add owner passkey persistence`.

### Task 2: Implement Pure Authentication Policy and Session Primitives

**Files:**

- Create: `apps/admin/lib/server/admin-auth-policy.ts`
- Create: `apps/admin/lib/server/admin-session.ts`
- Create: `apps/admin/test/admin-auth-policy.test.ts`
- Create: `apps/admin/test/admin-session.test.ts`
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- `readAdminAuthConfig(environment)` returns a validated enabled/disabled union and never silently infers an origin or RP ID in enabled mode.
- `assertTrustedAdminMutation(request, config)` enforces exact HTTPS origin and JSON/multipart content types as appropriate.
- Challenge/session helpers create random values, persist only keyed SHA-256 hashes, compare safely, and evaluate expiry/recent-auth rules using an injected clock.
- Cookie helper emits `HttpOnly; Secure; SameSite=Strict; Path=/` with bounded lifetime.

- [x] Add failing tests for disabled defaults, incomplete enabled configuration, exact origin matching, keyed hashes, token non-recoverability, idle/absolute expiry, revocation, recent-auth and strict cookie attributes.
- [x] Run `pnpm --filter @learnbox/admin test -- admin-auth-policy.test.ts admin-session.test.ts` and confirm failure.
- [x] Add Vitest scripts/dev dependencies and implement the smallest pure helpers that satisfy the tests.
- [x] Add `.env.example` keys with false defaults and no secret values.
- [x] Re-run focused tests and `pnpm --filter @learnbox/admin typecheck`.
- [x] Commit with `feat: add admin auth security primitives`.

### Task 3: Add Transactional PostgreSQL Stores

**Files:**

- Create: `apps/admin/lib/server/admin-database.ts`
- Create: `apps/admin/lib/server/postgres-owner-auth-store.ts`
- Create: `apps/admin/test/postgres-owner-auth-store.test.ts`
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Store methods issue registration/login challenges, consume them atomically, bootstrap the first credential, attach a credential to the existing owner, create/touch/revoke sessions and revoke all sessions.
- `bootstrapCredential` locks the singleton/credential set and returns closed when any active credential exists.
- Authentication updates the credential counter and consumes the challenge in the same transaction.
- Session reads never accept expired/revoked rows and touches cannot extend absolute expiry.

- [x] Add failing query-recording tests for `FOR UPDATE`, one-use consumption, bootstrap closure, same-owner second credentials, counter updates and bounded session touches.
- [x] Run the focused store test and confirm failure.
- [x] Add `pg` and its types to the admin package and implement the store with injected clients for tests.
- [x] Re-run the focused test and admin typecheck.
- [x] Commit with `feat: add owner passkey store`.

### Task 4: Implement WebAuthn Route Handlers

**Files:**

- Create: `apps/admin/lib/server/admin-webauthn.ts`
- Create: `apps/admin/lib/server/admin-route-security.ts`
- Create: `apps/admin/app/api/auth/bootstrap/options/route.ts`
- Create: `apps/admin/app/api/auth/bootstrap/verify/route.ts`
- Create: `apps/admin/app/api/auth/login/options/route.ts`
- Create: `apps/admin/app/api/auth/login/verify/route.ts`
- Create: `apps/admin/app/api/auth/reauth/options/route.ts`
- Create: `apps/admin/app/api/auth/reauth/verify/route.ts`
- Create: `apps/admin/app/api/auth/session/route.ts`
- Create: `apps/admin/app/api/auth/logout/route.ts`
- Create: `apps/admin/test/admin-auth-routes.test.ts`
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`

**HTTP contract:**

- Bootstrap routes return `404` unless both flags are exact and no credential exists.
- Login/options does not accept an owner identifier and uses discoverable credentials.
- Verify routes return generic failures, consume valid challenges once and set/rotate only strict cookies.
- Reauthentication requires a valid session and updates only `recent_authenticated_at` after passkey verification.
- Session returns minimal state; logout revokes the current session and clears the cookie.

- [ ] Add failing route tests with injected WebAuthn/store adapters for all disabled, invalid, expired, reused, unknown-credential, bad-origin, bad-RP-ID, missing-user-verification and success paths.
- [ ] Run the focused route suite and confirm failure.
- [ ] Install SimpleWebAuthn v13-compatible packages and implement route handlers with `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.
- [ ] Prove responses and logs contain no challenge, secret, public key, storage URL or session material outside the required WebAuthn browser payload.
- [ ] Re-run focused tests, typecheck and admin production build.
- [ ] Commit with `feat: add owner passkey routes`.

### Task 5: Gate the Admin UI Behind Passkeys

**Files:**

- Create: `apps/admin/app/components/AdminAuthGate.tsx`
- Create: `apps/admin/app/components/PasskeySignIn.tsx`
- Create: `apps/admin/app/admin-auth-mode.ts`
- Modify: `apps/admin/app/page.tsx`
- Modify: `apps/admin/app/globals.css`
- Create: `apps/admin/test/admin-auth-ui.test.tsx`

**UI contract:**

- Disabled mode visibly remains a local non-production prototype and cannot call auth endpoints.
- Enabled mode checks the session, offers passkey sign-in, explains unsupported browsers, and reveals the workspace only after server-confirmed authentication.
- Logout revokes server state. Add-passkey UI is present only after authenticated recent reauthentication.
- Persian copy is RTL and uses the existing licensed IRANSansX regular/bold files; focus and status messages are accessible.

- [ ] Add failing tests for disabled mode, unsupported browser, successful sign-in/session restore, generic failure, logout, focus, keyboard and reduced-motion behavior.
- [ ] Run the focused UI test and confirm failure.
- [ ] Implement the browser ceremony through `@simplewebauthn/browser` without browser storage of credentials or tokens.
- [ ] Re-run the UI test, typecheck and build.
- [ ] Commit with `feat: gate admin workspace with passkeys`.

### Task 6: Harden, Document and Verify the Boundary

**Files:**

- Create: `scripts/validate-admin-passkey-boundary.mjs`
- Modify: `package.json`
- Modify: `BACKLOG.md`
- Modify: `docs/operations/AGENT_ACTIVE_BRIEF.md`
- Create: `docs/operations/ADMIN_PASSKEY_ACTIVATION.md`
- Modify: `docs/storyboard/STATUS.md`
- Modify: this plan checklist.

- [ ] Add a source validator that requires false defaults, strict cookie/origin markers and rejects secret/client-storage/logging patterns.
- [ ] Add it to `pnpm check` and document the separate owner-approved enrollment procedure without including secrets.
- [ ] Run focused tests, `pnpm check`, `pnpm build`, `node scripts/validate-migrations.mjs` and `pnpm audit --prod --audit-level=high`.
- [ ] Perform an independent security review before merge; fix every high/medium finding or document a truthful blocker.
- [ ] Keep all flags false, do not deploy, and commit with `docs: record owner passkey boundary`.
