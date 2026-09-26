# LearnBox current release baseline — convergence candidate (NOT YET APPROVED)

**Status: forensic candidate, not release authorization.** This file records proven sources, conflicts, and unknowns as of 2026-09-26. It is not permission to activate a flag, attach private media, mutate Production, merge, or publish. Every agent must read this file together with `PROJECT_STATE.md`, `CURRENT_WORK.md`, the current remote branch, and live deployment evidence before editing. Where they conflict, stop and investigate; neither the newest timestamp nor the deployed build automatically wins.

## Integrity hold

GitHub `main` at `058486172019cc6f013581fcb08df52c1e1fdd4b` is **not a buildable repository**: `4c12141bfad8a4e656a98ef068168c9082a3d9d8` deleted 1,165 tracked paths including root package/lockfile, governance, tests, DB migrations, and Dockerfiles. Earlier full-tree `debab257348399f5c1325f741a0bd841ef77eb14` has 1,174 paths. Later direct-API commits added a few Web files but did not restore the tree. Do not build/deploy from main, reset the dirty original worktree, or replace newer approved behavior by copying the old tree wholesale. Restore a complete candidate by selectively reconciling both histories on an isolated branch and passing CI.

Running VPS app image: `sha256:80bf3bf3715cb5cb125f5a710e1c2b6ff7154066611b036e2dec26e7e66eff81` (image created 2026-09-26T15:51:06Z; container created 15:54:36Z); Next BUILD_ID `64Y_ExT7Q8gZX2J9rwcDo`. Source SHA is **not embedded**, so exact source/image equivalence is unproven. Recovery audit supersedes application fixes: do not start general bug fixes before clean, evidence-based repository reconstruction is proven. Live read-only Neon aggregates: 35 published card versions, all 35 with media, 210 review checks, 35 decisions, 27 schedules, 31 review events. These are live aggregates, not proof of an individual user's correct data.

## Surface registry

“Source” names an evidence candidate, not blanket authorization. Legacy items remain preserved until classified and tested.

| Surface | Source / intended design and relevant lineage | Data/flags/deployment evidence | Legacy risk / verification still required |
| --- | --- | --- | --- |
| Landing | Independent `apps/learnbox-website` from full-tree `debab257`; `learnboxapp.com` informational only | Separate VPS landing container healthy | Deleted on current main; do not transplant learner UI here. Render/visual check pending. |
| Learner Web/PWA | Full-tree Web foundation through PR #297 (`f727ce5`), later UI commits `8b2b4f1`–`0584861` claim owner-approved prototype v2 | Public app `/` 200; runtime image identity above | Source tree incomplete; installed PWA cache and authenticated render unverified. |
| Today | `TodayScreen.tsx` at `0584861`, prototype v2 as design comparison only | Banner route 200; authenticated personalized data unverified | Prior hardcoded charts/word/stats and local fallbacks; verify data provenance and absence of fabricated metrics. |
| Learning/review | Server-backed vertical loop PR #297, later `LearnerHome.tsx` 3D-flip UI `0584861` | 27 schedules/31 events globally; card media route 200 unauthenticated | Fixed 340px card faces clip content; old hover transform conflicts with flip. Reported repeated-tap PWA closure unverified. |
| Words | PR #297 Web state and original Words components, later locally generated/possibly untracked files | Endpoint and authenticated data not yet verified | Local-prototype source and personal-vocabulary storage may override server truth. |
| Progress | PR #297 plus subsequent visual UI | Per-user figures not yet verified | 2026-09-21 docs describe browser-local progress; newer screens may imply server-authoritative figures without evidence. |
| Profile/Settings | S3 Web account/privacy scope from pre-break docs | No authenticated walkthrough yet | Dormant identity/account controls vs runtime variants; determine exact current intended policy. |
| Authentication | Signed-cookie Web OTP in PR #297; session-read code in `a95611b` | Anonymous `/api/auth/session` 200, learner state 401; active OTP presence | Refresh/logout/session expiry/account separation must be exercised with authenticated owner. |
| Starter Pack | 35 owner-submitted decisions in PRs #288–289; private-media lineage #286/#292/#296; seed/intake PRs #293–294 | Live DB: 35 published with media | Pre-break docs say 0 release-approved, now stale; public bundled media route may bypass the intended private-delivery gate. Verify owner authorization lineage. |
| Admin | Full-tree passkey/content-review implementation through PR #297 | Separate Admin container healthy; 210 checks/35 decisions in DB | Current main deleted Admin source; inspect authenticated UI and DB writer audit without modifying records. |
| API/backend | Original `apps/api` + Next routes and DB migrations through full-tree `debab257` | Public state endpoint 401 anonymous; DB reachable | Main deleted API, migrations and validators. Reconcile contract and runtime flags before restoration. |
| Sync/offline | PR #297 cookie-authenticated lossless queue; `sw.js` public shell v9 in older full tree | Runtime service worker 200, network-first cache; API excluded from cache writes | Offline navigation can render older cached shell; signed-in offline/reconnect, queue acknowledgments, cache update unverified. |
| Bobo/assets | Canonical Bobo assets and design system in full tree; later animated component commits | Production browser visual audit pending | Duplicate `Bobo.tsx`/asset conventions and prior BuBu/Bobo names; do not replace canonical identity by an old asset. |
| Infrastructure/deployment | Docker/Caddy/source-of-truth from full tree and VPS runtime | Image and BUILD_ID recorded; landing/Admin/app containers separate | No SHA baked in image; build context came from dirty local checkout, not reproducible remote main. Confirm Caddy/Cloudflare/flags with secret-redacted probes. |

## Conflict inventory (first evidence-backed pass)

- **MUST MIGRATE** — complete repo tree `debab257` → intended current source after `0584861`: direct-API commit `4c12141` dropped 1,165 paths. Restore required infrastructure, tests, history, docs and source without blindly reverting later Web changes. Regression gate: full-tree path inventory, root `pnpm check`/build/CI and exact source-to-image provenance.
- **MUST REMAIN DORMANT** — local-prototype auth/media/static-data paths → approved server-auth and real per-user flow. Runtime flags and fallback behavior need verification; tests must show a user cannot see another user's state and no fake metrics appear as real.
- **STILL REQUIRED** — `sw.js`, old DB migration history, approved starter evidence, canonical Bobo assets; current main deletion is not evidence that these are obsolete. Test PWA update, migration validation and media/content provenance.
- **UNKNOWN — NEEDS EVIDENCE** — root HTML `s-maxage=31536000`, Cloudflare policy and installed-client cache → latest build; determine edge cache and device behavior before changing caching.
- **UNKNOWN — NEEDS EVIDENCE** — public `/api/content-media/*` → prior private-session media contract; decide from actual later owner approval and content publication state, then test unauthenticated access boundary.
- **UNKNOWN — NEEDS EVIDENCE** — older CSS `.card-face:hover` and fixed-height `.flip-inner` → v2 card presentation; code shows clipping/transform collision but mobile PWA closure needs actual reproduction/logs before selecting the smallest fix.
- **UNKNOWN — NEEDS EVIDENCE** — Admin/Words/Profile/Progress local untracked variants → current approved implementations; inspect source provenance and live screens before classifying removal/migration.

## Release freeze and evidence gate

No new features, optional redesign, Android/payment/premium expansion, or deletion of unknowns. A fix must reproduce the actual defect, add a regression check where practical, use the smallest correct change, and verify responsive/RTL/accessibility and real data. This baseline is not final until authenticated real-user journeys, cache behavior, CI, Admin/API/DB compatibility, image provenance, and the release checklist are verified. **Release Candidate: NO.** The exact blocker count is not yet knowable; do not report an invented number.
