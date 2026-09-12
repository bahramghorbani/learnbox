# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### Active release objective

Official Web/PWA v1.0 is targeted for **2026-10-12**. It includes 35/35 human-approved starter items, server-authoritative learning with lossless reconnect, release-critical account/privacy/support and exercised operations. Native Android/Cafe Bazaar, every payment path and premium packs are v1.1+.

## LB-DS-066 — Web-first 30-day release reset

- **Status:** review requested on branch `docs/web-first-30-day-release`, based on `32aad4c4cffdbdd6211263d9fe5f7ed2d9f191ee`.
- **Outcome:** make all current release views agree on S0–S5 delivery from 2026-09-12 through public rollout on 2026-10-12.
- **Boundary:** documentation only; no implementation, runtime, provider or deployment change.

## LB-DS-060 — Offline media-attachment preparation (local-only)

- **Status:** deterministic extraction is retained only on local branch `local/start15-media-attachment-rebased` at independently reviewed head `aec94daf678322430cfe3ab34db44cd24b65d3b9`, based on PR #275 merge `dfede397a9f2ffdccdd7e7fe916688f9fdc6685e`.
- **Evidence:** 15 candidate items, 45 expected assets, zero attachment/upload/private locator/learner exposure; focused and governance checks passed.
- **Boundary:** no upstream, push, PR or merge is authorized. A real upload remains blocked on an owner-selected isolated target, owner-authenticated OIDC credentials and a distinct upload approval.

## Deadline-critical owner gates

1. By 2026-09-14: select/create the isolated private-media target and accept provider cost. This does not authorize upload.
2. By 2026-09-16: separately authorize guarded private upload/attachment after target verification.
3. By 2026-09-22: complete one batched approve/return review for all 35 starter items across the six auditable dimensions.
4. By 2026-09-26: approve starter seed and staging activation after 35/35 release approval.
5. By 2026-10-11: approve phased public Web/PWA rollout after S4 exit evidence.

A missed owner gate moves the 2026-10-12 target one-for-one unless a safe, explicit scope decision removes that dependency. It never authorizes bypassing security, review or release controls.

## Immediate execution order

1. Merge the independently reviewed 30-day scope reset.
2. Begin S1 with the isolated private-media target decision while S2/S3 non-mutating preparation proceeds on disjoint paths.
3. Keep seed, activation and learner exposure downstream of human content approval.
4. Admit no Android, payment, premium or generalized AI-factory work into v1.0.
