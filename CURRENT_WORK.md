# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### LB-DS-069 — Final 35-item/105-asset media manifest

- **Status:** implemented and locally verified on `feat/s1-final35-media-manifest` from the exact PR #280 merge baseline `d594cc557886de44a5a9fbb9a4163ea1c1b0952b`. One deterministic, upload-free record selects exactly 35 canonical contentIds and 105 assets: the current V2 image for each original 20-item entry, the unchanged V1 word and sentence audio for those items, and all 45 prepared assets of the final 15-item package, with every superseded V1 image excluded. It stays `prepared_awaiting_private_upload` with `publicationBlocked: true` and 0 attached assets.
- **Lifecycle truth:** Draft PR #281 is open. The preceding head `38d9d8c` passed all technical/content gates and 7/7 CI but was correctly blocked on stale lifecycle prose; the corrected head requires replacement exact-head review and CI.
- **Boundary:** the record declares expected kinds and MIME types only; it carries no provider identifier, private locator, relative path, byte count, checksum, delivery URL or release approval, and 0/35 items are release-approved.
- **Provider boundary:** the owner attests the isolated target is private, dedicated, empty, disconnected from Production/Preview and attached to a project with no deployments. It remains unused; repository evidence contains no provider identifier or live-state proof.
- **Next task:** obtain independent exact-head review and seven terminal-success CI contexts for Draft PR #281; the first upload remains separately owner-gated.
- **Hard stop:** no credential pull, upload, attachment, review decision, seed, runtime activation, deployment or publication is authorized.

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

1. Merge LB-DS-069 only after independent exact-head PASS and seven terminal-success contexts on the unchanged head.
2. Keep the complete 35-item/105-asset manifest upload-free and unattached until the owner authorizes private upload.
3. Keep seed, activation and learner exposure downstream of human content approval.
4. Admit no Android, payment, premium or generalized AI-factory work into v1.0.
