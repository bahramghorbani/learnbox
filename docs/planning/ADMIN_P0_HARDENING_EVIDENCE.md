# Admin P0 Hardening — Isolated Staging Verification

**Status:** Ready for staging E2E proof. No Production change yet.

**Branch:** `fix/lb-b30-admin-p0-hardening`

---

## What changed

### Code (apps/admin/)

1. **Hard-disable legacy routes** (fail-closed 404, production-proof)
   - `app/api/banners`, `gateways`, `transactions`, `packs/csv-template`
   - `packs/` (create, publish, generate, import)
   - `users/[userId]` PATCH (account reset)
   - All 8 files gate every handler with `legacyAdminRouteGate()` FIRST
   - Cannot be enabled in production build; requires `NODE_ENV !== 'production'` AND explicit flag

2. **Mutation guard first** (Origin + Content-Type check)
   - New `guardAdminMutation()` in `lib/server/admin-mutation-guard.ts`
   - Checks exact Origin (no null origin, no cross-site)
   - Checks Content-Type allow-list before reading body
   - Returns 403 `request_rejected` + no-store cache
   - Placed FIRST in every guarded mutation route, before any session read

3. **CSRF token on sensitive register** (`add-passkey/verify`)
   - Client reads `__Host-learnbox_admin_csrf=` cookie
   - Sends it as `x-learnbox-csrf-token` header
   - Server calls `verifyAdminCsrf()` AFTER session check
   - Validates against `session.csrfHash`

4. **Remove erase action** (`reset_progress`)
   - Former `PATCH /api/users/[userId]?action=reset_progress` deleted 3 tables outside transaction
   - Code removed; the route returns 400 `unknown_action`
   - Account deletion now only goes through canonical `account-deletion.ts`

5. **Content Review no local preview**
   - Removed build-time draft JSON imports
   - No client-side manifest or stale 35-card hardcoded queue
   - Server-backed only (GET `/api/content/review`, which is gated)
   - Unauthenticated shell shows: "برای مشاهدهٔ محتوای بازبینی باید با ورود امن وارد شوید"

6. **Cache headers** (no edge-caching of Admin)
   - Added `next.config.mjs` header: `Cache-Control: private, no-store, max-age=0`
   - Applies to all routes except `/_next/static`, `/_next/image`, `favicon.ico`

7. **OCI image labels** (provenance tracking)
   - Dockerfile: `LABEL org.opencontainers.image.revision="${ADMIN_SOURCE_SHA}"`
   - compose.yaml: builds with `--build-arg ADMIN_SOURCE_SHA=<commit-SHA>`

### Tests (apps/admin/test/)

8. **New test suites: 16 tests, all pass**
   - `admin-mutation-route-inventory.test.ts` (6 tests)
     - Classifies every mutating route (guarded, delegated, hard-disabled)
     - Verifies guard runs BEFORE session read
     - Checks CSRF token in sensitive routes
   - `admin-legacy-routes.test.ts` (3 tests)
     - Gate is off by default
     - Cannot be enabled in production
     - Exact flag value required
   - `admin-mutation-guard.test.ts` (7 tests)
     - Rejects foreign origin with 403 request_rejected
     - Rejects missing/null origin
     - Rejects wrong Content-Type with 415 content_type_required
     - Never reads cookies or body (pure header check)

### Database (infrastructure/database/)

9. **Least-privilege role model** (staging verification first)
   - `admin-db-roles-p0.sql` defines three roles:
     - `learnbox_migrator`: DDL only (schema changes)
     - `learnbox_app`: learner progress only
     - `learnbox_admin`: review state only
   - Cannot ALTER, DROP, TRUNCATE from app roles (fail-closed)
   - `verify-admin-db-roles.sh` proves the model on staging before Production

---

## How to verify in staging

### 1. Build the Admin container

```bash
cd /Volumes/LearnBox-Dev/LearnBox-final/lb-recovery-candidate-20260926
docker build -t learnbox-admin:p0-staging   --build-arg ADMIN_SOURCE_SHA=$(git rev-parse HEAD)   -f infrastructure/production/admin/Dockerfile   .
```

### 2. Run the test suite

```bash
cd apps/admin
./node_modules/.bin/vitest run
# Expected: 190 tests pass (all, including new LB-B30 tests)
```

### 3. Deploy to staging compose

Update `infrastructure/production/admin/compose.yaml` to use the image:
```yaml
services:
  admin:
    image: learnbox-admin:p0-staging
    # ... rest unchanged
```

Bring it up:
```bash
docker compose -f infrastructure/production/admin/compose.yaml up -d
```

### 4. Run HTTP probes

```bash
# Unauthenticated GET / should show the shell without any card content
curl -sS https://admin-staging.learnboxapp.com/ | grep -q "برای مشاهده" && echo "✓ Shell is content-free"

# GET /api/banners should return 404 (hard-disabled)
curl -sS -o /dev/null -w "%{http_code}" https://admin-staging.learnboxapp.com/api/banners
# Expected: 404

# POST /api/banners from a foreign origin should return 403 request_rejected
curl -sS -H "Origin: https://evil.example" -H "Content-Type: application/json"   -d '{}' https://admin-staging.learnboxapp.com/api/banners | grep request_rejected && echo "✓ CSRF guard works"
```

### 5. Prove the DB role model on staging

```bash
export DATABASE_URL="postgresql://neondb_owner:...@..."  # Staging Neon DSN
infrastructure/database/verify-admin-db-roles.sh "$DATABASE_URL"
# Expected: all 6 tests pass, cleanup runs
```

---

## Staging evidence checklist

- [ ] Container builds with ADMIN_SOURCE_SHA label
- [ ] All 190 tests pass (including 16 new LB-B30 tests)
- [ ] Unauthenticated Admin shell loads without learner card content
- [ ] `GET /api/banners` returns 404
- [ ] `POST /api/banners` from foreign origin returns 403 request_rejected
- [ ] DB role staging verification passes (6 proof tests)

---

## Next: Production gate (owner approval)

After staging verification passes, three owner decisions needed:

1. **Approve Production P0 deployment:**
   - Stop the VPS Production Admin container (already done via Caddy 404)
   - Switch to the hardened Admin image (production-built with real ADMIN_SOURCE_SHA)
   - Restart with the hard-disable flag off (passkey login still off)

2. **DB role credentials (user entry required):**
   - User supplies three passwords in a secure prompt (never logged, never shared)
   - Generate three DSNs and update systemd environment files
   - Restart learner and Admin services to use new DSNs
   - Migration ledger remains writable by learnbox_migrator

3. **Rollback safety:**
   - Revert DSN environment and restart (reverting to neondb_owner)
   - Admin image remains tagged as rollback evidence
   - No data is deleted or mutated

---

## Remaining: Compatibility phase (separate approval)

After P0 verification, the path forward is:
- **C1:** Compatibility refactor (share backend services, remove duplicate logic)
- **C2:** Data unification (all Admin operations go through canonical repositories)
- **C3:** Admin redesign (real routes, role-aware UI, integration tests)
- **C4:** Feature parity (full learner app management from Admin)
- **C5:** Production release (after full E2E suite on staging)

Each step is a separate owner gate with its own audit trail.
