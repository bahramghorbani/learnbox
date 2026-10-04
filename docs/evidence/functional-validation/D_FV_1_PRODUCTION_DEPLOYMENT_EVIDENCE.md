# D-FV-1 Production Deployment Evidence

**Date:** 2026-10-04
**Owner authorization:** explicit, in-session. Option 1 approved — deploy `origin/main` as-is,
with CP15/CP16/CP17 server runtime explicitly authorized to ship as part of this release
(the earlier "no unrelated runtime behaviour" constraint was superseded for this deployment only).
**Result:** SUCCESS. No rollback required.

---

## 1. What shipped

| Field                                               | Value                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Source commit                                       | `6d6aa72489dd895299f8a1f4bedb2c205e32e31b` (`origin/main`)                |
| Candidate image digest                              | `sha256:953b7b6240c266ec22d1ed6bc4dad5998ae679cd907276d39c232676f7709d24` |
| Platform                                            | `linux/amd64` (host `linux/x86_64`)                                       |
| `APP_SOURCE_SHA` (runtime env + OCI revision label) | `6d6aa72489dd895299f8a1f4bedb2c205e32e31b`                                |
| Previous digest (rollback target)                   | `sha256:cb3090dada7b599ec2771fb6612fb14958bff24ab85fa72e8c4ee5ba05d10cc7` |
| Previous source                                     | `d4ea6558b708d055cda8c3aca5010064b1cec58c`                                |

Production was **12 commits behind** main. This release therefore also shipped CP15/CP16/CP17
server runtime, which the owner explicitly authorized after the scope conflict was reported.

### Pre-deploy runtime delta audit

Verified **behaviourally inert** (not merely assumed):

- `learner-review-web-http.ts`, `mobile-review-batch.service.ts` — literals `'schedulerRejected'`
  / `422` replaced by canonical constants whose values were confirmed to be exactly
  `'schedulerRejected'` and `422`.
- `mobile-review-batch.request.ts` — the live web parser was refactored into `parseEnvelope`;
  diffed line by line, identical checks and identical error strings.
- `native-binary-rollout.ts` (+258 lines) — imported by **zero** runtime paths
  (re-confirmed post-deploy in the live bundle: `nativeBinaryRollout` refs = 0).

Genuinely changed: `/api/reviews/mobile` (Native sync endpoint) — per-item salvage instead of
whole-batch rejection, 503 on capability gap, `binaryReview` kill-switch block in responses.
No released client calls it (Native unreleased). This was reported before cutover and authorized.

---

## 2. Build-flag parity proof (pre-cutover gate)

The runner stage carries **no** `NEXT_PUBLIC_*` env, and multi-stage builds discard builder
`ARG`s, so `docker history` yields only `APP_SOURCE_SHA`. Repo docs contain no recorded CP13/CP14
build-arg set. Parity therefore had to be proven **empirically from the built bundles**.

All six `NEXT_PUBLIC_LEARNBOX_*` flags are read as direct member expressions
(`process.env.X === 'true'`), so they are **build-time inlined** — a wrong build arg would
silently change learner-facing behaviour (e.g. switch Binary Review UI off).

Because minifiers rename variables, parity was measured with markers a minifier **cannot**
rewrite: literal class names, object keys and string literals.

The reference image used for the comparison was proven to be the live artifact itself:
local `learnbox-app:cp13-candidate-amd64` id == `sha256:cb3090da…` == the digest the production
container was running.

| Marker                      | Live (`d4ea6558`) | Candidate (`6d6aa724`) |
| --------------------------- | ----------------- | ---------------------- |
| `binaryWire`                | `!0` (true)       | `!0` (true)            |
| `profileIdentityFlag`       | `"true"`          | `"true"`               |
| `grade-grid-binary` (files) | 3                 | 3                      |
| `quarantineKey` (files)     | 1                 | 1                      |
| `onChooseGoal` (files)      | 2                 | 2                      |
| `sw_cache_version`          | `v9`              | **`v10`** (intended)   |
| `sw_celebrate_v2`           | 0                 | **1** (intended)       |

**Verdict: FLAG PARITY IDENTICAL.** The only differences are the two intended D-FV-1 changes.

Build args used (canonical CP9 set with the CP13 `BINARY_REVIEW_UI=true` change):
`PROFILE_IDENTITY_ENABLED=true`, `BINARY_REVIEW_UI=true`, `QUEUE_QUARANTINE=false`,
`SERVER_SESSION_PLAN=false`, `GOAL_UX_REMOVED=false`, `SESSION_EXPIRY_UX=false`.

---

## 3. Pre-cutover safety baseline

- Container `learnbox-app-production-app-1`: digest `cb3090da…`, healthy, `RestartCount=0`.
- Rollback image present **on the host** (not only referenced): `ROLLBACK_IMAGE_PRESENT`.
- `compose.yaml` backed up to `compose.yaml.pre-dfv1`.
- Transfer integrity: `docker save` tar sha256 `d0e3a704ed222324150eaff91f942b39c9addcc70eb13dd703778b14142d2054`
  — **identical** on dev machine and host.
- Candidate smoke-tested on the host **off the edge network** (throwaway container, no traffic):
  `running`, internal HTTP `200`, serving `v10` + `celebrate-v2`.
- Learner-data fingerprint (read-only): `ev=61 sch=19 plans=1 rej=0`,
  `ev_ids_md5=7949c518f5e74c239edebca03e1d4d03`, `sch_md5=445d269fbf90d50ab95414e991e8abe3`.

## 4. Cutover

Promotion was by **immutable digest**, never by tag. `diff` against the backup confirmed
**exactly one changed line** (the `image:` pin) before `docker compose up -d app`.

Post-cutover: digest `953b7b62…`, `status=running`, `health=healthy`, `RestartCount=0`,
`APP_SOURCE_SHA=6d6aa724…`.

---

## 5. Post-deploy verification

| Check                                     | Result                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production health                         | `/` 200, `/api/health` 200                                                                                                                        |
| Services stable, no unexpected restarts   | app/admin/landing/caddy all healthy; `RestartCount=0`; 0 error lines in 10m                                                                       |
| Running intended artifact                 | digest `953b7b62…`, `APP_SOURCE_SHA=6d6aa724…`                                                                                                    |
| Service Worker v10 served                 | `learnbox-public-shell-v10` at the public edge                                                                                                    |
| `celebrate-v2.png` in Production precache | present in `OFFLINE_ASSETS`; live `CacheStorage` holds it at 200 / 510,518 B                                                                      |
| Online completion image                   | 200, 510,518 B, `image/png`                                                                                                                       |
| D-FV-1 offline path                       | **PROVEN** (see §6)                                                                                                                               |
| Protected media still protected           | `/api/media/start-media` 404, `/api/cards` 404, `/api/learner/today` 401, `/api/reviews/mobile` 405 — **no 200s**, `private, no-store`, `nosniff` |
| SW excludes `/api/`                       | `/api/` guard present in deployed `sw.js`                                                                                                         |
| Binary Review unchanged                   | `LEARNBOX_BINARY_REVIEW=true`; `grade-grid-binary` inlined; `binaryWire:!0`                                                                       |
| `LEARNBOX_SCHEDULER_V2`                   | **ABSENT** (count 0)                                                                                                                              |
| `LEARNBOX_BINARY_REVIEW_CREATION`         | ABSENT (count 0)                                                                                                                                  |
| Learner data unaltered by verification    | `61/19/1/0` and **both md5s byte-identical** pre/post                                                                                             |
| Recovery snapshot                         | `snap-ancient-band-asqfztci` present (`2026-10-03T20:31:47Z`)                                                                                     |
| Recovery branch                           | `br-purple-night-as1ji0k0` present, `ready`                                                                                                       |

### 6. D-FV-1 offline proof — methodology note

Two emulation harnesses produced **false results** and were discarded:

1. `Network.emulateNetworkConditions(offline=True)` silently did not take effect — a control
   request for an uncached URL returned `404`/`200` instead of failing. (Same pitfall as the
   pre-fix investigation.)
2. `Network.setBlockedURLs(['*'])` was **too blunt**: the deployed SW is network-first with a
   cache fallback, so blocking everything also killed the SW's own fetch path. Proof it was a
   harness artifact and not a fix failure: `offline.html` and `recovery-v2.png` — both precached
   and known-good offline — also "failed", while direct `CacheStorage` reads returned 200.

**Valid test** (the proven methodology — kill the origin): the exact deployed digest
`953b7b62…` was run locally, the SW was installed (v10, `celebrate-v2.png` precached,
optimizer URL correctly **not** cached), then the origin container was **stopped**
(`curl` → connection refused, origin genuinely dead).

| Probe                           | Result                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| Control — uncached URL          | `FAILED_AS_EXPECTED` (offline genuinely in effect)              |
| `/_next/image?...` optimizer    | `FAILED_AS_EXPECTED` → this is what triggers the fallback       |
| `/images/bobo/celebrate-v2.png` | **200, 510,518 B served from SW cache**                         |
| Raw image decode                | **`DECODED_1024x1536`** — a real image, no broken-image icon    |
| Optimizer as `<img>`            | `ERRORED_AS_EXPECTED` → `onError` fires, fallback chain engages |

This reproduces the owner's exact device condition and confirms the fix: the optimizer request
still fails offline (by design — that path can proxy protected media), `onError` routes to the
precached raw path, and the learner sees the celebration image instead of a broken icon.

---

## 7. Scope discipline

No code changes, no cherry-picks, no special release artifact — the deployed artifact is
`origin/main` at `6d6aa724` built with the existing Dockerfile and the canonical flag set.
No migrations, no DB-role changes, no learner-data writes, no Native release or activation,
no feature-flag changes. Rollback target `cb3090da…` remains on the host with
`compose.yaml.pre-dfv1` for a one-line revert.

**D-FV-1 status: DEPLOYED** (previously merged-only; Production now serves the fix).

### Residual

- **F-1:** `welcome` / `encourage` / `focus` Bobo expressions remain unprecached (~1.5 MB).
  They now degrade to the decorative placeholder rather than a broken icon. Not a defect.
- **D-FV-2:** closed with no code change (value correct, label correct and adjacent);
  accepted minor UX debt.
