# Learner Splash Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` only after atomic splash replacement is green.

**Goal:** Deliver the current owner-selected splash to learner clients while guaranteeing immediate startup from the last valid cache or bundled fallback.

**Architecture:** The learner web app exposes same-origin metadata and media routes backed by the server-side current pointer. A browser cache controller verifies downloaded bytes before promotion. The existing launch screen paints synchronously from cache/fallback, refreshes in the background and always exits within its maximum duration. The Flutter shell receives the same contract in a separate tested adapter without claiming store readiness.

**Tech Stack:** Next.js 15, browser Cache API/Web Crypto, PostgreSQL, Vercel Blob, React 19, Vitest/JSDOM, Flutter/Dart tests.

## Global Constraints

- Delivery remains unavailable unless `LEARNBOX_DYNAMIC_SPLASH_DELIVERY_ENABLED=true`; bundled splash behavior stays functional when false.
- Metadata exposes only opaque revision, checksum, dimensions and a same-origin media path.
- Media route reads only the version selected by the current database pointer and never redirects to or returns a private storage URL.
- A network, database, storage, decode or checksum failure cannot blank or block startup or delete the last valid cache.
- The splash is decorative and must exit after the existing bounded duration.
- Do not deploy or activate dynamic learner delivery.

---

### Task 1: Define the Shared Learner Splash Contract

**Files:**

- Create: `packages/content-models/src/current-splash.ts`
- Modify: `packages/content-models/src/index.ts`
- Create: `packages/content-models/test/current-splash.test.ts`

**Interface:**

- Parse/serialize `{ revision, checksum, width, height, mediaPath }` with strict opaque/checksum/dimension/same-origin path validation.
- Reject absolute URLs, traversal, storage keys, unknown fields and invalid checksums.

- [ ] Add failing contract tests for valid metadata and all unsafe path/data cases.
- [ ] Run the focused package test and confirm failure.
- [ ] Implement and export the minimal strict parser.
- [ ] Re-run focused tests and package typecheck/build.
- [ ] Commit with `feat: define current splash contract`.

### Task 2: Add Same-Origin Metadata and Media Delivery

**Files:**

- Create: `apps/website/lib/current-splash-store.ts`
- Create: `apps/website/app/api/launch-splash/current/route.ts`
- Create: `apps/website/app/api/launch-splash/media/[revision]/route.ts`
- Create: `apps/website/test/current-splash-routes.test.ts`
- Modify: `apps/website/package.json`
- Modify: `.env.example`

**HTTP contract:**

- Metadata uses `no-store` and an opaque revision; disabled/unavailable state is a safe `404`/`503` with no storage detail.
- Media verifies the requested revision is still selected, streams the private object server-side, sets `ETag` from checksum, immutable/private-safe cache headers, same-origin CORP and `nosniff`.
- Route parameters are strictly bounded and no learner input can select an arbitrary object key.

- [ ] Add failing tests for disabled, missing, current, stale revision, storage failure, conditional request and URL-leak cases.
- [ ] Run focused tests and confirm failure.
- [ ] Implement PostgreSQL lookup and private Blob streaming with injected adapters.
- [ ] Re-run tests, website typecheck and build.
- [ ] Commit with `feat: deliver current splash same origin`.

### Task 3: Implement Verified Browser Cache Promotion

**Files:**

- Create: `apps/website/lib/splash-cache.ts`
- Create: `apps/website/test/splash-cache.test.ts`
- Modify: `apps/website/public/sw.js`

**Interface:**

- `readCachedSplash()` returns only a fully promoted cached response with matching local metadata.
- `refreshSplash()` fetches metadata, downloads changed media, computes SHA-256, decodes it, and atomically promotes data+metadata only after every check passes.
- Failed refresh preserves the previous cache; stale caches are replaced only after verified success.

- [ ] Add failing tests for first launch, unchanged revision, changed revision, corrupt checksum, decode error, interrupted write, offline mode and cache preservation.
- [ ] Run focused tests and confirm failure.
- [ ] Implement the Cache API/Web Crypto adapter with dependency injection for JSDOM tests.
- [ ] Update service-worker rules so dynamic splash metadata is never stale-cached and verified media is not evicted during offline fallback.
- [ ] Re-run focused tests and the private-media/security validators.
- [ ] Commit with `feat: cache verified learner splash`.

### Task 4: Integrate the Web Launch Screen

**Files:**

- Modify: `apps/website/app/components/LaunchScreen.tsx`
- Modify: `apps/website/app/launch-experience.ts`
- Modify: `apps/website/app/globals.css`
- Create: `apps/website/test/launch-screen.test.tsx`

**UI contract:**

- First paint uses cached object URL when synchronously available to the controller, otherwise `/images/launch/germany-welcome-v1.jpg`.
- Refresh starts in the background; a verified new image may replace the current launch only if decoded before the exit window, otherwise next launch.
- Image/fetch/cache failure retains a visible fallback and timers always hide the screen by the maximum duration.

- [ ] Add failing tests for bundled fallback, cached launch, timely refresh, late refresh, image error, reduced motion and maximum-duration exit.
- [ ] Run the focused test and confirm failure.
- [ ] Integrate cache controller without delaying application rendering.
- [ ] Re-run tests, typecheck and website build; visually inspect mobile 1080x1920 rendering.
- [ ] Commit with `feat: use dynamic splash safely on web`.

### Task 5: Add the Native Flutter Cache Boundary

**Files:**

- Create: `apps/mobile/lib/launch/current_splash.dart`
- Create: `apps/mobile/lib/launch/splash_cache.dart`
- Create: `apps/mobile/lib/launch/launch_screen.dart`
- Modify: `apps/mobile/lib/main.dart`
- Create: `apps/mobile/test/splash_cache_test.dart`
- Modify: `apps/mobile/test/app_test.dart`
- Modify: `apps/mobile/pubspec.yaml`

**Native contract:**

- Bundle the approved initial splash as an application asset.
- Read the last verified local file immediately, refresh metadata/media asynchronously, verify SHA-256 and decodability, then atomically rename the candidate into the cache.
- Preserve the previous file on every failure and never extend the splash past its maximum duration.

- [ ] Add failing Dart tests for bundled/cached/offline/corrupt/changed/late cases using fake HTTP and filesystem adapters.
- [ ] Run Flutter tests when the SDK is available; otherwise record the existing explicit environment blocker without claiming native verification.
- [ ] Implement the minimum adapter and UI, keeping Android/iOS packaging outside this task.
- [ ] Re-run available Flutter checks and document any toolchain blocker truthfully.
- [ ] Commit with `feat: add native splash cache boundary` only after available checks pass.

### Task 6: Close the Delivery Slice Without Deployment

**Files:**

- Create: `scripts/validate-dynamic-splash-delivery.mjs`
- Modify: `package.json`
- Modify: `BACKLOG.md`
- Modify: `docs/operations/AGENT_ACTIVE_BRIEF.md`
- Modify: `docs/storyboard/STATUS.md`
- Create: `docs/operations/DYNAMIC_SPLASH_DELIVERY.md`
- Modify: this plan checklist.

- [ ] Validate false defaults, same-origin-only metadata/media paths, bundled fallback and absence of storage URLs.
- [ ] Add the validator to `pnpm check` and document cache/fallback/activation behavior.
- [ ] Run focused tests, `pnpm check`, `pnpm build`, migration validation and production dependency audit.
- [ ] Perform independent security, regression and mobile-startup review; resolve findings or record real blockers.
- [ ] Leave delivery false and do not deploy; commit with `docs: record dynamic splash delivery boundary`.
