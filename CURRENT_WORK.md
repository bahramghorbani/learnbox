# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

LB-DS-081 (`feat/v1-web-vertical-loop`, `review_requested`) is open as Draft PR #297. It completes the cookie-authenticated server-backed Web learning loop in one coherent default-off repository slice: server-selected Start cards, Web-scoped idempotent review submission, durable offline queue retry and authoritative refresh. Final exact-head review and terminal CI remain open; merge is not authorized. No runtime flag, database, provider, staging/Production, deployment, seed, attachment, publication or public-release mutation is authorized. LB-DS-080 remains independently open as Draft PR #296 for repository-only media attachment evidence and does not overlap the Web runtime paths.

### Active release objective

Official Web/PWA v1.0 is targeted for **2026-10-12**. It includes 35/35 human-approved starter items, server-authoritative learning with lossless reconnect, release-critical account/privacy/support and exercised operations. Native Android/Cafe Bazaar, every payment path and premium packs are v1.1+.

## Deadline-critical owner gates

1. **Completed Sep 12:** create and verify an isolated private-media target.
2. **Completed Sep 14, bounded:** upload exactly 105 selected private assets and verify every object by cache-disabled download, byte count and SHA-256; attachment was not authorized.
3. **Completed Sep 14, repository evidence only:** record the owner's 210/210 `passed` checks and 35 `approve` decisions as owner intent; `adminOutcomeRecorded` remains false.
4. **Still gated:** separately authorize and execute Admin outcome persistence and private-media attachment. Until both are verified, 0/35 card versions are release-approved and the package remains unseedable.
5. **Still gated:** approve starter seed and staging activation only after 35/35 release approval.
6. **Still gated:** approve phased public Web/PWA rollout only after closed-alpha exit evidence.

A missed owner gate moves the target one-for-one unless an explicit safe scope decision removes that dependency. It never authorizes bypassing security, review or release controls.

## Immediate execution order

1. Obtain explicit owner authorization for the next consequential gate; repository-recorded owner intent alone cannot authorize Admin persistence or attachment.
2. Persist Admin outcomes through the reviewed protected Admin path and independently verify the resulting counts before claiming release approval.
3. Attach the already verified private media only through its distinct authorized path; keep locators and receipts outside Git.
4. Re-evaluate 35/35 release readiness, then request separate seed/staging activation authorization.
5. Continue disjoint default-off S2/S3 implementation only through newly queued, path-bounded tasks.
6. Admit no Android, payment, premium or generalized AI-factory work into v1.0.
