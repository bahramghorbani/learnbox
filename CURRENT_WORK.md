# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### LB-DS-071 — Web offline/error recovery accessibility

- **Status:** Draft PR #282 is open from exact merged base `b49f325c0fa328a90b7e1da0f53e0e509d69cc5a`. Focused tests pass 18/18, Website tests pass 43 files/294 tests, typecheck/build/security/full check pass, and independent exact-code-head review passed at `fde9272` after remediating the two grounded findings from `3034715`.
- **Outcome:** the Next `/offline` route, global error boundary and static service-worker fallback have valid accessible names and decorative-image semantics; reconnect state reads `navigator.onLine` after hydration, keeps visible heading/message consistent and preserves one non-empty composed connection announcement.
- **Boundary:** no learning, sync, identity, API, database, provider, flag, deployment, Preview or Production behavior changed; `public/sw.js` changes only the owned cache version from `v8` to `v9`.
- **Next task:** obtain final independent review and seven terminal-success GitHub/Vercel contexts on the unchanged live PR head, then merge and reconcile stable status.
- **Hard stop:** no deployment, Preview/Production activation, provider mutation or public release is authorized.

### Active release objective

Official Web/PWA v1.0 is targeted for **2026-10-12**. It includes 35/35 human-approved starter items, server-authoritative learning with lossless reconnect, release-critical account/privacy/support and exercised operations. Native Android/Cafe Bazaar, every payment path and premium packs are v1.1+.

## Deadline-critical owner gates

1. **Completed Sep 12:** create an isolated private-media target inside the current plan; the owner attests its boundary, which authorized no upload.
2. By 2026-09-16: separately authorize guarded private upload/attachment after target verification.
3. By 2026-09-22: complete one batched approve/return review for all 35 starter items across the six auditable dimensions.
4. By 2026-09-26: approve starter seed and staging activation after 35/35 release approval.
5. By 2026-10-11: approve phased public Web/PWA rollout after S4 exit evidence.

A missed owner gate moves the 2026-10-12 target one-for-one unless a safe, explicit scope decision removes that dependency. It never authorizes bypassing security, review or release controls.

## Immediate execution order

1. Merge LB-DS-071 only after final independent exact-head PASS and seven terminal-success contexts on the unchanged Draft PR #282 head.
2. Keep the complete 35-item/105-asset manifest upload-free and unattached until the owner authorizes private upload.
3. Keep seed, activation and learner exposure downstream of human content approval.
4. Admit no Android, payment, premium or generalized AI-factory work into v1.0.
