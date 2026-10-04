# D-FV-1 — Offline Completion Image Fix: Evidence

**Defect:** On the session-completion screen («آفرین! امروز کامل کردی!») the Bobo celebration
illustration rendered as a broken-image icon when the learner finished their first session
while offline.

**Found by:** Owner, during Mona real-device Functional Validation (2026-10-03).
**Severity:** Cosmetic — no data, scheduling, auth or sync impact. Affects the reward moment
at the end of a learner's first offline session.

---

## 1. Root cause

Two independent gaps combined:

1. **`public/sw.js` did not precache `celebrate-v2.png`.** `OFFLINE_ASSETS` listed
   `recovery-v2.png` but not `celebrate-v2.png`. The fetch handler only populates the cache
   _after_ a successful network response, and the completion screen is the only place that
   renders the `celebrate` expression — reached for the first time while already offline, so
   the asset had never been cached.

2. **`Bobo` had no `onError` fallback.** It renders through `next/image`, so the actual request
   is `/_next/image?url=…`, which the worker deliberately does not cache (that path can proxy
   protected media). With the request failing and no fallback, the `<img>` stayed broken; React
   does not retry a failed image, so it did not self-heal on reconnect.

Precaching alone would NOT have fixed this: the optimizer URL never matches the worker's
`/images/` prefix check. The fix needs the component to fall back to the raw precached path.

---

## 2. Changes

| File                                          | Change                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/website/public/sw.js`                   | Added `/images/bobo/celebrate-v2.png` to `OFFLINE_ASSETS`; bumped `CACHE_NAME` v9 → v10 so existing installs re-precache. Comment records why raw paths (not optimizer URLs) are cached. |
| `apps/website/app/components/Bobo.tsx`        | Added a three-stage fallback: `optimized` → `raw` (`unoptimized`, plain precached path) → `failed` (decorative placeholder). Stage resets when the expression changes.                   |
| `apps/website/app/globals.css`                | Added `.bobo-fallback` decorative placeholder.                                                                                                                                           |
| `apps/website/test/offline-fallback.test.tsx` | Asserts celebrate is precached, pins the full asset list and v10, and adds a guard that the optimizer path is never cached.                                                              |
| `apps/website/test/nav-onboarding.test.tsx`   | Four Bobo tests: online render, optimizer-failure → raw path, both-fail → placeholder, speech bubble survives image failure.                                                             |

**Caching strategy, credential boundaries and offline/reconnect behaviour are unchanged.** No
change to API routes, auth, `start-media.ts`, scheduler, flags, migrations or infrastructure.

### Accessibility

The placeholder is `aria-hidden="true"` with no alt text — Bobo is decorative and the
motivational copy is already visible text, so a failed image removes no information. The
speech bubble is asserted to remain readable when the image cannot load.

---

## 3. Browser evidence: real service worker, genuinely offline

Method: serve `apps/website/public` over HTTP, register the real `sw.js`, then **kill the
server process** so the network is genuinely unreachable. An earlier attempt using CDP
`Network.emulateNetworkConditions(offline=True)` was discarded: the server access log showed
requests still returning `200`, i.e. the emulation did not apply and would have produced a
false pass. Killing the server is the trustworthy signal, confirmed by `network_dead: true`.

### Pre-fix (`origin/main` sw.js, v9) — defect reproduced

```
OLD SW precache: caches=["learnbox-public-shell-v9"]
  cached: [fonts/..., icons/..., images/bobo/recovery-v2.png,
           images/launch/germany-welcome-v1.jpg, offline.html]
  celebrate_present: false

PRE-FIX OFFLINE: {"network_dead":true,
                  "raw_plain":{"ok":false},
                  "optimizer":{"ok":false},
                  "recovery_control":{"ok":true,"w":1024}}
```

Both celebrate paths fail → broken image, exactly what the owner saw. `recovery-v2.png`
loads fine, confirming the mechanism is precache membership and not a broken worker.

### Post-fix (v10) — defect gone

```
caches: ["learnbox-public-shell-v10"]
  cached: [fonts/..., icons/..., images/bobo/celebrate-v2.png,
           images/bobo/recovery-v2.png, images/launch/germany-welcome-v1.jpg, offline.html]
  celebrate_present: true, size: 510518, type: "image/png"   (matches on-disk byte size)

POST-FIX OFFLINE: {"network_dead":true,
                   "raw_plain":{"ok":true,"w":1024,"h":1536},
                   "optimizer":{"ok":false}}
```

The raw path now loads from cache at full resolution while offline. The optimizer still fails
offline **by design** — that failure is what triggers the component's fallback to the raw path.

### Online, against Production

```
/images/bobo/celebrate-v2.png                    -> 200 image/png
/_next/image?url=...celebrate-v2.png&w=128&q=75  -> 200 image/png
/api/content-media/start-a1-apfel/image          -> 401   (unauthenticated, unchanged)
```

Normal online rendering is unaffected and the protected-media boundary still refuses
unauthenticated requests.

---

## 4. Test evidence

- Targeted suites: **23 passed** (`nav-onboarding`, `offline-fallback`, `today-bobo-companion`,
  `service-worker-registration`).
- Full website suite: **814 passed, 160 skipped, 0 failed**.
- `tsc --noEmit` exit 0; `eslint` exit 0; prettier clean; `next build` exit 0.

### Mutation check — the tests actually detect the defect

| Mutant                                          | Result                      |
| ----------------------------------------------- | --------------------------- |
| Remove `celebrate-v2.png` from `OFFLINE_ASSETS` | **2 tests failed** (killed) |
| Remove the `onError` handler from `Bobo`        | **3 tests failed** (killed) |

Both reverted; working tree restored before commit.

---

## 5. Remaining findings (not fixed here)

- **F-1 — Other Bobo expressions are not precached.** `welcome`, `encourage` and `focus`
  (~1.5 MB combined) are not in `OFFLINE_ASSETS`. They now degrade to the decorative
  placeholder instead of a broken icon, so this is contained, but a learner offline on those
  screens still sees no mascot. Precaching all five would roughly double the ~1.6 MB install
  payload — deliberately left as a product decision, not silently taken.
- **F-2 — D-FV-2 remains open.** The `67٪` accuracy figure under «دقت» reads as session
  progress. Verified correct (2 of 3 = 66.7%), label/affordance only.
- **F-3 — Cache version bump forces one re-precache.** Existing installs discard v9 and
  re-fetch the v10 asset list on next activation: one-time ~1.6 MB on an online visit.

---

## 6. Scope

Not deployed. No Production flag, migration, deployment or recovery-asset change. Snapshot
`snap-ancient-band-asqfztci` and branch `br-purple-night-as1ji0k0` untouched.
