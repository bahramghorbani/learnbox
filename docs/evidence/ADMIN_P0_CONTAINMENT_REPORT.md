# Admin P0 Containment — Production Evidence Report

**Date:** 2026-09-30T12:36:31Z  
**Status:** CONTAINED as observed 2026-09-30 — VPS Admin container stopped; Caddy 404 applied on the VPS (VPS-local edit, not yet in Git); Vercel preview observed closed to anonymous callers (see below).

---

## VPS Production Admin Containment

### Container State
- **Status:** Stopped (exited 0 at 2026-09-30T12:36Z)
- **Evidence:** `/home/ubuntu/learnbox/evidence/admin-containment-20260930T123631Z/`
  - `image-id.txt` → `d4f39bfc` (digest: `sha256:d4f39bfccfbd...`)
  - `image-inspect.json` → OCI metadata (no `ADMIN_SOURCE_SHA` label; provenance unknown, documented as P0 investigation item)
  - `container-inspect.redacted.json` → final state snapshot (secrets [REDACTED])
  - `container-last500.log` → last 500 lines of stdout/stderr
  - `admin-compose.yaml` → service definition (backup copy)
  - `image-history.txt` → layer history from `docker image history learnbox-admin:production`

### Front Door: Caddy 404
- **Route:** `admin.learnboxapp.com` and `admin-staging.learnboxapp.com`
- **Config:** `/srv/learnbox/releases/0a36cce8a0a2-phase1/infrastructure/production/landing/Caddyfile`
- **Change:** Added fixed 404 for `admin.*` blocks (no restart required; live reload)
- **Proof:** Anonymous `curl https://admin.learnboxapp.com/` → 404; `curl https://admin-staging.learnboxapp.com/` → 404
- **Rollback:** Remove the handler block from Caddyfile; Caddy live-reloads in <1s

### Image Preservation
- **Production image:** `learnbox-admin:production` (tagged as `learnbox-admin:evidence-d4f39bfc`)
- **Action:** NOT deleted, NOT retagged, stored as evidence
- **Reason:** P0 investigation requires comparing against source commit to determine if provenance is verifiable
- **Rollback:** Restart the container with the original image; compose.yaml preserved in evidence

---

## Learner App — No Change
- **Status:** ✅ Untouched. Still running `learnbox-app:production` (v1.2.1, SHA `4ade0a8`)
- **Health:** `/api/health` returns 200 OK, authenticated protected media working

---

## Vercel Admin Deployment

### `learnbox-admin-preview.vercel.app`
- **Project:** `learnbox-admin-preview` (exists, deployments listed)
- **Current state:** Live, 200 OK, unauthenticated card content visible
- **Action needed:** User to apply reversible Vercel protection or pause via Vercel CLI/dashboard

**Owner decision required:**
```bash
# Option A: Pause the deployment (reversible)
vercel projects pause learnbox-admin-preview

# Option B: Add password protection (via Vercel dashboard)
# Navigate to project settings > Protection > add password

# Option C: Remove the alias (if not needed for internal staging)
# Requires Vercel CLI deletion and re-setup
```

**Do not:**
- Delete the project
- Delete past deployments
- Modify environment variables
- Change the production alias target

---

## Proof of Containment

### No Anonymous Access to Learner Content
```bash
# VPS Admin blocked at HTTP layer
$ curl -sS https://admin.learnboxapp.com/
(404 Not Found)

# VPS Admin blocked at network layer (container stopped)
$ docker ps -a --filter "name=admin"
learnbox-admin-production-admin-1 exited Exited (0) 21 minutes ago

# Learner app unchanged and healthy
$ curl -sS https://app.learnboxapp.com/api/health | jq .
{
  "status": "ok",
  "database": "ok",
  "timestamp": "2026-09-30T12:46:15Z"
}
```

---

## Next Steps

1. **User decision:** Pause or protect the Vercel Admin deployment
2. **P0 staging verification:** Run isolated hardening tests (see `ADMIN_P0_HARDENING_EVIDENCE.md`)
3. **Production DB roles:** After staging proof, user supplies three passwords for least-privilege roles
4. **Compatibility phase:** P1–P5 require separate owner gates (see `ADMIN_P0_PATCH_PLAN.md`)

---

## Rollback (manual, if needed)

### Restart VPS Admin
```bash
cd /home/ubuntu/learnbox/admin
docker compose -p learnbox-admin-production up -d
# or restore from backup
docker compose -p learnbox-admin-production up -d --no-build
```

### Restore Caddy routing
```bash
# Remove the 404 handler from Caddyfile; Caddy reloads in <1s
systemctl reload caddy
```

### Restore Vercel (if paused)
```bash
vercel projects resume learnbox-admin-preview
```

---

## Files Preserved

| Path | Size | Purpose |
|------|------|---------|
| `/home/ubuntu/learnbox/evidence/admin-containment-20260930T123631Z/` | ~520 KB | Full evidence snapshot |
| `image-id.txt` | 72 B | Image SHA for comparison (provenance audit) |
| `image-inspect.json` | 7.2 KB | OCI metadata; missing `ADMIN_SOURCE_SHA` (finding) |
| `container-inspect.redacted.json` | 7.2 KB | Final container state (secrets masked) |
| `container-last500.log` | 3.7 KB | Last output before stop |
| `admin-compose.yaml` | 592 B | Service definition (backup) |
| `image-history.txt` | 60 KB | Dockerfile layer history |
| `learnbox-admin:evidence-d4f39bfc` | 442 MB | Production image (tagged for evidence) |

---

## Security Notes

- Caddy 404 blocks unauthenticated HTTP access but does NOT rate-limit or log offense
- Container stop does NOT clean volumes; they are still mounted and accessible (by design, for potential recovery)
- Image layers still exist in the Docker daemon; `docker rmi` would delete them (not done)
- Vercel deployment is independent; pausing does NOT affect the VPS or database

The containment is **reversible and auditable**, not destructive.


## Correction (post-review)

The Vercel section above is stale. When re-probed, `learnbox-admin-preview.vercel.app` returned
503 `DEPLOYMENT_PAUSED`, the preview URL 302-redirected to Vercel SSO, and project settings showed
`ssoProtection: all`. The report does not establish who set this or when; only the observed
end state is evidenced. The Caddy 404 block exists only in the VPS working copy of the Caddyfile
and must be committed to Git or it will be lost on the next release sync.
