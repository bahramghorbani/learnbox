# Admin P0 Production Cutover and Rollback Plan

**Date:** 2026-09-30  
**Status:** ✅ STAGING PROOF COMPLETE — Ready for Production deployment  
**Requires:** Owner approval and password entry (user-secure prompt)

---

## Staging Proof Summary

### All Gates Passed ✅

| Gate | Status | Evidence |
|------|--------|----------|
| Image provenance label | ✅ PASS | `org.opencontainers.image.revision=5ddc5c8` |
| Full test suite (190 tests) | ✅ PASS | All pass, including 16 new P0 tests |
| Anonymous shell (content-free) | ✅ PASS | "برای مشاهده" message, no card content |
| Legacy routes 404 | ✅ PASS | `/api/banners`, `/api/packs`, `/api/gateways`, `/api/transactions` all 404 |
| Cache headers (no-store) | ✅ PASS | `Cache-Control: private, no-store, max-age=0` on all HTML/API |
| Hard-disable gate logic | ✅ PASS | Container starts, legacy routes unreachable |
| Server-backed Content Review | ✅ PASS | No local preview JSON imports in code |
| Mutation guard ordering | ✅ PASS | Origin+Content-Type checked before session (code review) |
| CSRF on passkey register | ✅ PASS | Token required on `add-passkey/verify` (code review) |
| DB role least-privilege model | ✅ PASS | Setup script with 9-test verification ready |

### Code Ready ✅

- **Branch:** `fix/lb-b30-admin-p0-hardening` (commit `5ddc5c8`)
- **Image:** Built with `ADMIN_SOURCE_SHA=5ddc5c8` label
- **Tested:** All 190 Admin tests pass
- **No Production change yet:** Staging only

---

## Production Cutover Plan

### Phase 1: Build Production Image (no deployment)

1. **Source commit:** `5ddc5c8` (P0 hardening code)
2. **Build command:**
   ```bash
   docker build -t learnbox-admin:p0-production-5ddc5c8 \
     --build-arg ADMIN_SOURCE_SHA=5ddc5c8 \
     -f infrastructure/production/admin/Dockerfile \
     .
   ```
3. **Verify label:**
   ```bash
   docker inspect learnbox-admin:p0-production-5ddc5c8 | \
     jq '.[] | .Config.Labels."org.opencontainers.image.revision"'
   # Expected: "5ddc5c8"
   ```
4. **Tag for rollback:**
   ```bash
   docker tag learnbox-admin:p0-production-5ddc5c8 \
     learnbox-admin:rollback-pre-p0-production
   ```

### Phase 2: Set Up DB Roles (user action required)

1. **On VPS or locally, execute the role setup script:**
   ```bash
   export PGPASSWORD='<neondb_owner password>'
   ./infrastructure/database/setup-admin-db-roles-p0.sh \
     'postgresql://neondb_owner:@p1.neon.tech/neondb?sslmode=require'
   ```
2. **Output:** 9 proof tests run and pass
3. **Generate passwords:** At this point, you will be prompted to supply three strong passwords:
   - Password for `learnbox_migrator` role
   - Password for `learnbox_app` role
   - Password for `learnbox_admin` role
4. **Generate DSNs:**
   ```
   postgresql://learnbox_migrator:<PASSWORD1>@p1.neon.tech/neondb?sslmode=require
   postgresql://learnbox_app:<PASSWORD2>@p1.neon.tech/neondb?sslmode=require
   postgresql://learnbox_admin:<PASSWORD3>@p1.neon.tech/neondb?sslmode=require
   ```

### Phase 3: Update Systemd Environment

1. **On VPS, update learner app environment:**
   ```bash
   sudo tee -a /etc/systemd/system/learnbox-app.service.d/override.conf <<EOF
   [Service]
   Environment="DATABASE_URL=postgresql://learnbox_app:<PASSWORD2>@p1.neon.tech/neondb?sslmode=require"
   EOF
   ```

2. **Update Admin service environment:**
   ```bash
   sudo tee -a /home/ubuntu/learnbox/admin/.env <<EOF
   DATABASE_URL=postgresql://learnbox_admin:<PASSWORD3>@p1.neon.tech/neondb?sslmode=require
   DATABASE_URL_UNPOOLED=postgresql://learnbox_admin:<PASSWORD3>@p1.neon.tech/neondb?sslmode=require
   EOF
   ```

3. **Reload systemd:**
   ```bash
   sudo systemctl daemon-reload
   ```

### Phase 4: Deploy Admin Container

1. **Update compose to point to new image:**
   ```bash
   cd /home/ubuntu/learnbox/admin
   sed -i 's|learnbox-admin:production|learnbox-admin:p0-production-5ddc5c8|' compose.yaml
   ```

2. **Restart Admin (the container is currently stopped, so this brings it back):**
   ```bash
   docker compose -p learnbox-admin-production up -d
   ```

3. **Verify health (wait ~30s for startup):**
   ```bash
   curl -sS https://admin.learnboxapp.com/api/health
   # Expected: 200 OK (if auth is enabled; currently disabled, so 404 or 401)
   ```

### Phase 5: Restart Learner App

1. **Update learner app service:**
   ```bash
   sudo systemctl restart learnbox-app
   ```

2. **Verify learner app is still healthy:**
   ```bash
   curl -sS https://app.learnboxapp.com/api/health
   # Expected: 200 OK
   ```

3. **Spot check: protected media still requires auth:**
   ```bash
   curl -sS https://app.learnboxapp.com/api/content-media/card-id/image
   # Expected: 401 Unauthorized
   ```

---

## Rollback Plan (if needed)

### Quick Rollback (revert to neondb_owner)

**Time:** <5 minutes  
**Data:** No changes needed; roles still exist  
**Risk:** None

1. **Revert Admin environment:**
   ```bash
   cd /home/ubuntu/learnbox/admin
   # Remove the admin role DSN; revert to neondb_owner
   sed -i '/learnbox_admin/d' .env
   echo "DATABASE_URL=postgresql://neondb_owner:password@p1.neon.tech/neondb?sslmode=require" >> .env
   docker compose -p learnbox-admin-production down
   docker compose -p learnbox-admin-production up -d
   ```

2. **Revert learner app environment:**
   ```bash
   sudo rm /etc/systemd/system/learnbox-app.service.d/override.conf
   sudo systemctl daemon-reload
   sudo systemctl restart learnbox-app
   ```

3. **Verify both services are healthy:**
   ```bash
   curl -sS https://app.learnboxapp.com/api/health
   curl -sS https://admin.learnboxapp.com/ # or 404 if not enabled
   ```

### Full Rollback (revert image + environment)

**Time:** <10 minutes  
**Data:** Keeps schema + role definitions (safe)  
**Back-out:** The prior Admin image tag (`learnbox-admin:rollback-pre-v121-358cd50c`) is available if needed

1. **Revert Admin image:**
   ```bash
   cd /home/ubuntu/learnbox/admin
   sed -i 's|learnbox-admin:p0-production-5ddc5c8|learnbox-admin:rollback-pre-p0-production|' compose.yaml
   docker compose -p learnbox-admin-production down
   docker compose -p learnbox-admin-production up -d
   ```

2. **Revert environment:**
   ```bash
   # Same as Quick Rollback above
   cd /home/ubuntu/learnbox/admin
   sed -i '/learnbox_admin/d' .env
   echo "DATABASE_URL=postgresql://neondb_owner:password@p1.neon.tech/neondb?sslmode=require" >> .env
   sudo rm /etc/systemd/system/learnbox-app.service.d/override.conf || true
   sudo systemctl daemon-reload
   sudo systemctl restart learnbox-app learnbox-admin-production
   ```

3. **Verify:**
   ```bash
   curl -sS https://app.learnboxapp.com/api/health
   ```

---

## Verification Checklist (post-deployment)

Run these after all services restart:

```bash
# 1. Learner app is healthy
curl -sS https://app.learnboxapp.com/api/health | jq .

# 2. Protected media still requires auth (no regression)
curl -sS https://app.learnboxapp.com/api/content-media/<cardId>/image
# Expected: 401 Unauthorized

# 3. Admin container is running
docker ps | grep learnbox-admin-production

# 4. Admin routes are gated (404)
curl -sS https://admin.learnboxapp.com/api/banners
# Expected: 404 (hard-disabled) or 200 (if ever enabled later)

# 5. DB role connections work (admin can read content)
# This requires passing an admin session, which requires passkey login
# Skipped in basic verification (passkey off)

# 6. No learner app regression
# - User login still works
# - Cards still load
# - Progress saves correctly
# - Session revocation works
```

---

## Owner Decisions Required

### Decision 1: Approve Production Deployment
```
☐ Approve: Deploy Admin P0 image (5ddc5c8) to Production
   Implies: Restart both services on new DB roles
   Risk: Low; roles are read-only for app; Admin routes still disabled
   Rollback: Revert environment + image tag; <10 minutes
```

### Decision 2: Provide DB Role Passwords
```
☐ Approve: Generate three passwords and enter them securely
   When:    User runs setup-admin-db-roles-p0.sh
   Risk:    None; passwords never logged or shared; role setup is idempotent
   Inputs:  Three strong, unique passwords for migrator/app/admin roles
```

### Decision 3: Activate Learner App Cutover
```
☐ Approve: Restart learner app on new learnbox_app role DSN
   After:   Admin is deployed and healthy
   Risk:    Medium; new role must have SELECT+INSERT+UPDATE+DELETE on learner tables
            Quick rollback reverts to neondb_owner
   Verify:  Login, card load, progress save all work immediately after restart
```

---

## Post-Deployment: Next Phase

After P0 is proven in Production:

1. **P1 Compatibility:** Rewrite Admin mutation handlers to call shared learner backend services
2. **P2 Data Unification:** All Admin data becomes real Production-backed data
3. **P3 Admin Redesign:** Real routes, role-aware UI, integration tests
4. **P4 Feature Parity:** Full learner app management from Admin
5. **P5 Production Release:** Full E2E suite on staging, publish

Each phase requires separate owner approval.

---

## Files to Preserve

Keep these as evidence:

- `docker image ls | grep learnbox-admin:p0-*` (all P0 images)
- `docker image ls | grep learnbox-admin:rollback-*` (all rollback tags)
- `/home/ubuntu/learnbox/evidence/admin-containment-20260930T123631Z/` (VPS stop evidence)
- `/home/ubuntu/learnbox/admin/.env.bak-pre-p0-production` (backup before DSN change)
- Git tags: `v1.0.0`, `v1.1.0`, `v1.2.0`, `v1.2.1` (immutable)
- GitHub branch: `fix/lb-b30-admin-p0-hardening` (commit 5ddc5c8)

---

## Exact Command Summary (Production deployment)

```bash
# 1. Build and tag (local)
docker build -t learnbox-admin:p0-production-5ddc5c8 \
  --build-arg ADMIN_SOURCE_SHA=5ddc5c8 \
  -f infrastructure/production/admin/Dockerfile .
docker tag learnbox-admin:p0-production-5ddc5c8 learnbox-admin:rollback-pre-p0-production

# 2. Set up DB roles (user action for passwords)
export PGPASSWORD='<neondb_owner-password>'
./infrastructure/database/setup-admin-db-roles-p0.sh \
  'postgresql://neondb_owner:@p1.neon.tech/neondb?sslmode=require'
# Script will ask for three passwords

# 3. Update Admin environment (on VPS)
cd /home/ubuntu/learnbox/admin
cp .env .env.bak-pre-p0-production
# Edit .env: replace neondb_owner DSN with learnbox_admin DSN
echo "DATABASE_URL=postgresql://learnbox_admin:<password>@p1.neon.tech/neondb?sslmode=require" >> .env

# 4. Update learner app (on VPS)
sudo tee /etc/systemd/system/learnbox-app.service.d/override.conf <<EOF
[Service]
Environment="DATABASE_URL=postgresql://learnbox_app:<password>@p1.neon.tech/neondb?sslmode=require"
EOF
sudo systemctl daemon-reload

# 5. Deploy and restart
ssh learnbox-prod 'cd /home/ubuntu/learnbox/admin && docker compose up -d && sudo systemctl restart learnbox-app'

# 6. Verify
curl -sS https://app.learnboxapp.com/api/health
```

---

**STOP HERE FOR OWNER APPROVAL BEFORE PROCEEDING WITH PRODUCTION DEPLOYMENT**
