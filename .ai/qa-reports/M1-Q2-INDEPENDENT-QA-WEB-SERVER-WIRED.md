# M1-Q2 Independent QA — Web server-wired learner slice (PR #163, merge 73cdb62)

- Branch: `qa/m1b-web-learner-state-qa`
- Baseline: `origin/main` = `7ddca8c` (PR #163 merged at `73cdb62`; #164 docs sync)
- Executor: independent QA (W8 role; did not implement LB-DS-022)
- Evidence dir: `.ai/qa-reports/m1-q-evidence/` (this report; no screenshots — browser harness unavailable)
- Date: 2026-08-30

## Scope reviewed

M1-B slice 2 / LB-DS-022 server-wired learner slice: `apps/website/app/api/learner/state/route.ts`,
`lib/learner-state-web-http.ts`, `lib/learner-state-web-runtime.ts`, `lib/learner-state-web-client.ts`,
`app/LearnerHome.tsx`, `app/components/TodayScreen.tsx`, `app/learner-sync-state.ts`, 4 test files,
`.env.example`, README-M1B-WEB-SLICE1.md, ADR 0012, PRODUCT_STATUS, WORK_QUEUE, CURRENT_WORK.

## Checks run (real commands, actual output)

| Check | Command | Result |
|---|---|---|
| Focused route/http/client/UI tests | `pnpm vitest run test/learner-state-web-route.test.ts test/learner-state-web-http.test.ts test/learner-state-web-client.test.ts test/learner-today-server-states.test.tsx` | 33 passed / 6 failed — 6 failures = stale `@learnbox/billing-core` dist; after `pnpm --filter @learnbox/billing-core build` all 39 passed |
| Full website suite | `cd apps/website && pnpm test` | 34 files / 197 passed |
| Typecheck | `cd apps/website && pnpm typecheck` | clean (learning-engine + billing-core + api + tsc --noEmit) |
| Production build | `cd apps/website && pnpm build` | green; route emitted as dynamic ƒ |
| Migration validation | `node scripts/validate-migrations.mjs` | 13 migrations validated |
| Live server (flag OFF, prod build) | `npx next start -p 3117` | `GET /api/learner/state` → 503 `{"error":"serverUnavailable"}`, `cache-control: no-store`, **no set-cookie** |
| Live server (flag ON, dev) | `WEB_LEARNER_STATE_ENABLED=true DATABASE_URL=postgresql://learnbox:fake@localhost:5432/learnbox LEARNBOX_SESSION_SECRET=qa-...-32bytes npx next dev -p 3119` | no cookie → 401 `invalidToken`; forged-signature cookie → 401 `invalidToken`; valid HMAC cookie + unreachable DB → 503 `serverUnavailable` (typed, no detail leak); no-store on all; logs show no error internals |
| POST behavior | `curl -X POST` (dev, flag on) | **405** from Next.js router (see M-Q2-H2) |
| HTTP boundary | prod build + `curl` http | 400 validation (prod forces secure check); dev loopback http allowed (tests) |
| Client bundle leak check | `wc -c .next/static/chunks/app/api/learner/state/route-*.js` | **184 bytes** — zero server/pool/secret code in client bundle |
| Security headers | curl | CSP `connect-src 'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy |
| SSR markup | `curl /` | `<html lang="fa" dir="rtl">`; `+98` isolated `dir="ltr"`; launch screen `role="status"` |
| Contrast (computed) | node contrast calc | muted #64748b on #fff 4.76:1 (AA); primary #4d6bfe on #fff 4.33:1 (borderline AA small); orange #ef852e on #fff 2.60:1 (fails AA small) — orange not used by new slice copy |
| Responsive | globals.css | `@media (max-width: 420px)` re-sizes Today h1/summary/figures; `prefers-reduced-motion` handled |

## Findings

### Blocker
None.

### High
None.

### Medium

- **M-Q2-M1 (truthfulness, new copy): «آخرین همگامسازی: HH:MM» overclaims sync.** `TodayScreen.tsx`
  renders «آخرین همگامسازی» whenever the read succeeds, but this slice performs a **read only**;
  there is no push sync (sync coordinator dormant, no acknowledgement watermark). A user reads
  "last sync" when nothing was ever synced — only fetched. Wording originates in ADR 0012 (offline
  last-synced label), but implementing it for `server-backed` state before any push-reconciliation
  exists overstates capability. Evidence: `app/components/TodayScreen.tsx` `lastSyncedAt` block;
  `LearnerHome.tsx` sets `serverLastSyncedAt` on fetch success only. Recommend «آخرین خواندن از
  سرور» until M1-D push sync lands. Not merged-blocking (state itself truthful, local queue never
  claimed as synced).

- **M-Q2-M2 (truthfulness, label vs figure): «این فهرست از سرور LearnBox خوانده شده است» while the
  actionable figure/list is still the device-local bundled Start pack.** The server snapshot is
  parsed but its schedules are **never used** for the figure (deliberate: Start-pack ↔ canonical
  `contentId` join unresolved). So the server-backed label claims the *list* is server-read while
  the list rendered is local. The pending chip correctly stays visible and no acknowledgement is
  claimed, but the «فهرست … از سرور خوانده شده» wording overstates what the UI shows. The slice's
  own README documents "Today figure stays local" — the label contradicts the figure's actual
  source. Recommend distinguishing «وضعیت از سرور خوانده شد» from «فهرست از سرور خوانده شد».
  Test `learner-today-server-states.test.tsx` pins the current copy (`سرور LearnBox خوانده شده`).

- **M-Q2-M3 (a11y, loading state): no loading skeleton; figure remains a concrete local number
  during `loading`.** D1 §5 specifies skeleton figures with no number flash; this slice swaps only
  the small caption to «در حال آمادهکردن مرور امروز…» while `<strong>{toPersianDigits(reviewCount)}</strong>`
  still renders the local count. Not a "0 flash" (figure is the true local count, never 0-forced),
  and the local figure is intentionally authoritative for the CTA, but the visual state is a
  caption change, not the D1 loading board. Slice README says loading fallbacks implemented;
  strictly, only the label is implemented. Low-impact deviation; D1 board remains for the
  snapshot-driven slice.

### Low

- **M-Q2-L1 (ADR drift, live behavior): non-GET returns 405, not the ADR's promised 400
  `validation`.** Next.js router rejects non-GET before the handler runs, so the ADR 0012 contract
  («Non-GET … → 400 validation») never surfaces in a real deployment; only the direct-handler unit
  test sees 400. Verified live: `curl -X POST` → 405, no body. Either document the Next.js router
  behavior in ADR 0012 or move the method check to middleware. Test gap: route test bypasses the
  router.
- **M-Q2-L2 (micro-drift): disabled-branch 503 response omits `charset=utf-8`.** When
  `WEB_LEARNER_STATE_ENABLED` is false the route's inline 503 uses `Response.json` without the
  `JSON_HEADERS` content-type, so the wire content-type is `application/json` (no charset), while
  the enabled path and ADR promise `application/json; charset=utf-8`. Cosmetic.
- **M-Q2-L3 (label accuracy): 401 on stale/expired cookie silently downgrades to the
  `local-only` «هنوز به سرور وصل نشده است» label.** Fail-closed and safe (no server-backed
  claim), but "not connected" is not the same as "session expired". A future slice could surface
  re-auth. No action required now.
- **M-Q2-L4 (format): `formatSyncTime` uses device-local `getHours()`; time-of-day only, no
  date.** Fine for today context; if the snapshot is older than 24h the label shows only a time.

## Acceptance matrix (ADR 0012 / slice claims)

| Criterion | Evidence | Verdict |
|---|---|---|
| Route `GET /api/learner/state` exists, `runtime=nodejs`, nodejs chunk | route.ts; `.next/server/app/api/learner/state/route.js` (`runtime="nodejs"`) | Pass |
| Fail-closed defaults: `WEB_LEARNER_STATE_ENABLED !== 'true'` → 503 no-store, no cookie | runtime test; live 503 + no set-cookie | Pass |
| Cookie-only identity; no Authorization / client userId / mobile token | handler reads only `readLearnerSession(request)`; client sends GET `/api/learner/state` with no auth header; tests assert no `authorization` property; route ignores query/body | Pass |
| Cookie subject = canonical `users.id` (PR #162 `resolveUserId`) | `otp-runtime.ts` → `PostgresWebLearnerIdentityStore.resolveUserId` returns `users.id` UUID; `createLearnerSession(subject)` | Pass |
| 401 invalidToken on cookie miss/invalid/expired, no-store | unit + live (no cookie, forged sig) | Pass |
| 400 validation on non-GET / insecure transport | unit test; live POST → 405 (router) | Pass w/ L1 |
| 503 serverUnavailable on service/DB failure, no detail leak | unit + live (valid cookie, unreachable DB) | Pass |
| no-store on every response | unit + live | Pass |
| Typed errors only; no phone/OTP/token/secret in bodies or logs | handler taxonomy; live logs clean | Pass |
| Secure transport boundary (https prod / bounded loopback dev) | `isSecure`; dev-loopback test; prod http → 400 | Pass |
| Client fails closed: only parsed complete 200 snapshot = server-backed | `fetchWebLearnerState` guards every nested field; 30+ negative cases | Pass |
| Today fetches only in server-otp after auth; never in local-prototype | `LearnerHome` effect guard + test | Pass |
| Loading / error / offline labels truthful, local label fallback | `learner-sync-state.ts` 5 states; UI tests cover all | Pass (M3 for skeleton depth) |
| Local actionable figure kept; server snapshot not used for figure | test `keeps the local session figure` | Pass (M2 label wording) |
| Pending-sync chip preserved & truthful; no sync-ack claimed | test `preserves the local pending-sync chip`; chip from local queue only | Pass (M1 wording) |
| Persian numerals | `toPersianDigits` on figure + chip + caption | Pass |
| RTL/LTR isolation | `html lang=fa dir=rtl`; `+98` `dir=ltr`; German `lang=de` (existing card) | Pass |
| Keyboard / `role=status` semantics | sync-truth, chip, last-synced all `role="status"`; no new focus traps; interactive elements are buttons | Pass |
| Responsive states | 420px media query scales Today; no overflow in previous M1-Q measure (unchanged shell) | Pass (no live viewport re-measure — see Limitations) |
| No real DB / OTP / production / secrets activated | env used: fake DATABASE_URL to unreachable localhost; flag OFF for prod run | Pass |
| Docs governance (ADR/status/queue updated post-merge) | #164 syncs queue `accepted`, records merge commit | Pass |

## Limitations

- **No browser-driven visual/AX verification.** `browser_exec` harness blocked (Chrome
  remote-debugging permission dialog; policy forbids clicking permission UI). No screenshots, no
  axe scan, no live keyboard walk. Visual evidence = SSR markup + CSS + computed contrast +
  previous M1-Q live screenshots of the unchanged shell. Live server evidence was curl-based.
- No real PostgreSQL: DB-dependent paths exercised only as far as the typed 503 boundary; the
  happy-path 200 with real rows and the `users.id` lookup were verified by unit tests only
  (canonical-body serialization is asserted byte-for-byte in `learner-state-web-http.test.ts`).
- `pnpm check` root aggregate not re-run in full; slice-relevant gates (tests, typecheck, build,
  migrations) each run green.
- Prod-mode live route checks ran with flag OFF (safe); flag-ON matrix ran under `next dev`
  (NODE_ENV=development) because `next start` forces production and local HTTP is then rejected by
  the secure-transport check. HTTPS boundary verified by unit test + prod http rejection (400).

## Verdict

**Not production-ready (bounded foundation slice, as documented).** No blockers found; the ADR
0012 security boundary (cookie-only identity, fail-closed flag, no-store, typed errors, no client
leak) is implemented and verified independently at unit and live-server level. Findings M-Q2-M1/M2
are copy-truthfulness refinements that should land with the snapshot-driven slice or a follow-up
copy fix; M-Q2-M3 is a documented D1 deferral; L1/L2 are small contract drifts. Visual/accessibility
acceptance is **not** granted: browser-level AX/reduced-motion/keyboard walk could not be executed
in this environment and must be re-run before any production claim. Server-backed figures must
stay off until the Start-pack ↔ canonical `contentId` join and push-reconciliation watermark exist.

## Scope integrity

QA modified no implementation paths. Changes in this branch: this report only (`.ai/qa-reports/`).
All product code, docs, queue state, and CI state at `7ddca8c` are untouched.