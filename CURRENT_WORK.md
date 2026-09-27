# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

Both LB-DS-080 and LB-DS-081 are merged. PR #296 (LB-DS-080, `feat/s1-start35-private-media-attachment`) merged at `3edc699f4133b7def2a28639fb03ebe312db6953`; PR #297 (LB-DS-081, `feat/v1-web-vertical-loop`) merged at `f727ce5204b04852844fbd4f0cfc79826d5d757e`. The repository now holds the canonical digest-anchored private-media attachment record and the complete cookie-authenticated server-backed Web learning loop (server-selected Start cards, Web-scoped idempotent review submission, durable offline queue retry, authoritative refresh) — both default-off with all operational gates closed.

The next critical-path items are:

1. **Owner authorization for Admin outcome persistence** — separately authorize execution of the reviewed Admin review-check/decision path so 35/35 card versions can reach release-approved status; repository-recorded owner intent alone does not authorize this.
2. **Operational private-media attachment** — separately authorize the distinct operational attachment path; the repository attachment record (LB-DS-080) is repository evidence only; no database row, provider call or locator exists yet.
3. Queue a path-bounded task for each authorized gate before execution begins.

No runtime flag, database, provider, staging/Production, deployment, seed, operational attachment, publication or public-release mutation is authorized until each respective owner gate is opened.

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
