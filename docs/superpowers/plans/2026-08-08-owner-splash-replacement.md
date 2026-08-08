# Owner Splash Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan only after the owner-passkey foundation is green.

**Goal:** Let the authenticated single owner replace the current splash safely, with no scheduling, history gallery, delete-current action or icon control.

**Architecture:** The admin server decodes and normalizes an upload before writing a unique private Blob. PostgreSQL atomically promotes that immutable version and records a safe audit event. The superseded object is deleted only after promotion; failures become bounded orphan-cleanup work and never roll back the new current pointer.

**Tech Stack:** Next.js server routes, PostgreSQL, Vercel Blob private storage, Sharp, Vitest.

## Global Constraints

- Require an active owner session, exact origin/CSRF checks and authentication within the previous five minutes.
- Keep mutation unavailable unless `LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED=true` and passkey auth is enabled.
- Accept decoded PNG/JPEG/WebP only, maximum 8 MiB, minimum 864x1600, width/height ratio 0.42–0.55; normalize to metadata-free immutable WebP.
- Never overwrite an existing object path, return a private Blob URL, retain the previous image intentionally, or delete the bundled fallback.
- The current pointer changes only inside one transaction after upload succeeds.
- Do not deploy, enable storage mutations or upload the owner-provided production image.

---

### Task 1: Persist Immutable Splash Versions and Replacement State

**Files:**

- Create: `database/migrations/0010_owner_splash_replacement.sql`
- Create: `apps/api/test/owner-splash-migration.test.ts`

**Schema contract:**

- `splash_versions`: opaque ID, private object key, checksum, dimensions, byte count, normalized media type and created time.
- `current_splash`: singleton row constrained to `1` with current version and update time.
- `splash_replacement_actions`: unique idempotency key hash, resulting version and completion state.
- `private_media_cleanup_jobs`: opaque object key, reason code, bounded attempts, next attempt, completion and safe last-error code.
- Existing `audit_logs` stores safe replacement/cleanup metadata only.

- [ ] Add a failing migration test for singleton pointer, immutable version metadata, unique idempotency, cleanup bounds and foreign keys.
- [ ] Run the focused test and confirm failure.
- [ ] Add migration `0010` without touching prior migrations.
- [ ] Run focused test and migration validation.
- [ ] Commit with `feat: add splash replacement persistence`.

### Task 2: Validate and Normalize Real Image Bytes

**Files:**

- Create: `apps/admin/lib/server/splash-image.ts`
- Create: `apps/admin/test/splash-image.test.ts`
- Add fixtures: `apps/admin/test/fixtures/splash/*`
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`

**Interface:**

- `normalizeSplashImage(bytes)` returns normalized WebP bytes, checksum, width, height and byte size or a stable safe rejection code.
- It trusts decoder output rather than filename/MIME, rejects animation and metadata-bearing passthrough, and never logs file content/name.

- [ ] Add failing tests with real tiny fixtures for valid PNG/JPEG/WebP, disguised bytes, corrupt input, animation, size, dimensions and aspect ratio.
- [ ] Run the focused test and confirm failure.
- [ ] Add Sharp and implement decode, validation, auto-orientation, metadata stripping, bounded normalization and SHA-256.
- [ ] Re-run focused tests and admin typecheck.
- [ ] Commit with `feat: validate splash media`.

### Task 3: Implement Atomic Replacement and Cleanup Services

**Files:**

- Create: `apps/admin/lib/server/private-splash-storage.ts`
- Create: `apps/admin/lib/server/postgres-splash-store.ts`
- Create: `apps/admin/lib/server/replace-splash.ts`
- Create: `apps/admin/lib/server/cleanup-private-media.ts`
- Create: `apps/admin/test/replace-splash.test.ts`
- Create: `apps/admin/test/postgres-splash-store.test.ts`
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`

**Transaction contract:**

- Hash and reserve the idempotency key; duplicate completed requests return the same safe result.
- Upload candidate to a new opaque private key, lock `current_splash`, insert version, swap pointer and append audit in one transaction.
- After commit, delete only the formerly current object. Queue deletion failure with bounded retry metadata.
- On transaction failure, delete the unreferenced candidate; queue it if deletion also fails.

- [ ] Add failing adapter/service tests covering concurrency, duplicate idempotency, storage failure, transaction rollback, exact old-object deletion, candidate cleanup and orphan queuing.
- [ ] Run focused tests and confirm failure.
- [ ] Implement injected storage/store adapters and the orchestration service.
- [ ] Re-run focused tests and typecheck.
- [ ] Commit with `feat: replace splash atomically`.

### Task 4: Expose Protected Current/Replace Admin Routes

**Files:**

- Create: `apps/admin/app/api/splash/current/route.ts`
- Create: `apps/admin/app/api/splash/replace/route.ts`
- Create: `apps/admin/test/admin-splash-routes.test.ts`
- Modify: `.env.example`

**HTTP contract:**

- `GET current` returns safe preview metadata and same-origin preview route only to an authenticated owner.
- `POST replace` requires multipart form data, a bounded body, a valid idempotency header, CSRF/origin checks and recent passkey authentication.
- Disabled or misconfigured mutation returns `404`; authentication failures are generic; no response reveals object keys or URLs.

- [ ] Add failing tests for flags, auth, recent-auth, CSRF/origin, body/idempotency limits, invalid media and successful replacement.
- [ ] Run focused route tests and confirm failure.
- [ ] Implement routes with Node runtime and injected test seams.
- [ ] Re-run focused tests, typecheck and build.
- [ ] Commit with `feat: add protected splash routes`.

### Task 5: Build the Owner Replacement Interface

**Files:**

- Create: `apps/admin/app/components/SplashReplacementPanel.tsx`
- Modify: `apps/admin/app/components/ContentReviewWorkspace.tsx`
- Modify: `apps/admin/app/components/AdminSidebar.tsx`
- Modify: `apps/admin/app/globals.css`
- Create: `apps/admin/test/splash-replacement-ui.test.tsx`

**UI contract:**

- Show current splash, revision and update time; one file input; local preview; exact size/format guidance; one explicit replacement confirmation; progress/success/generic errors.
- Generate a fresh idempotency key per confirmed attempt and request recent reauthentication when required.
- Never expose scheduling, icon management, a history gallery, delete-current or object-storage details.

- [ ] Add failing tests for accepted/rejected local files, confirmation, progress, reauth response, success refresh, keyboard/focus and exact absence of excluded controls.
- [ ] Run focused UI tests and confirm failure.
- [ ] Implement RTL UI using existing IRANSansX regular/bold and accessible status regions.
- [ ] Re-run focused tests, typecheck and build.
- [ ] Commit with `feat: add owner splash replacement UI`.

### Task 6: Verify Without Activation

**Files:**

- Create: `scripts/validate-owner-splash-boundary.mjs`
- Modify: `package.json`
- Modify: `BACKLOG.md`
- Modify: `docs/operations/AGENT_ACTIVE_BRIEF.md`
- Create: `docs/operations/SPLASH_REPLACEMENT_ACTIVATION.md`
- Modify: `docs/storyboard/STATUS.md`
- Modify: this plan checklist.

- [ ] Validate false defaults, no icon/schedule controls, no public Blob URLs and required auth/recent-auth boundaries.
- [ ] Add the validator to `pnpm check` and document configuration without secret values.
- [ ] Run focused tests, `pnpm check`, `pnpm build`, migration validation and production dependency audit.
- [ ] Perform an independent security/regression review and resolve findings.
- [ ] Leave all flags false and storage untouched; commit with `docs: record splash replacement boundary`.
