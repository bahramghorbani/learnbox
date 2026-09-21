# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

No feature implementation is currently open. LB-DS-080 (`feat/s1-start35-private-media-attachment`, `review_requested`, Draft PR #296; merge is not authorized) adds the canonical attachment record `content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json`: derived deterministically from the immutable committed manifest and attestation, digest-anchoring both, state `private_media_attached`, authorization limited to repository evidence, `publicationBlocked: true` and `learnerDeliveryActivated`, `databaseMediaRowsWritten` and `providerCallPerformed` all false. It records the verified exposure truth that 60 of the 105 attested assets across 20 of the 35 content IDs have byte-identical copies already tracked in this public repository and so are not private, while 45 assets across 15 content IDs have no public copy; no route, flag, environment, migration, database row, provider call, deployment, seed or publication changed. LB-DS-077 through LB-DS-079 are merged: owner decisions remain repository intent only (PR #289), protected private-media delivery/attestation preserves `private_storage_verified_not_attached` (PR #292), targeted first-review schedule creation replaced the eager catalog bootstrap (PR #293), and bounded learner-scoped approved Start-card intake is implemented behind the existing default-off learner-state runtimes (PR #294).

### Active release objective

Official Web/PWA v1.0 is targeted for **2026-10-12**. It includes 35/35 human-approved starter items, server-authoritative learning with lossless reconnect, release-critical account/privacy/support and exercised operations. Native Android/Cafe Bazaar, every payment path and premium packs are v1.1+.

## Deadline-critical owner gates

1. **Completed Sep 12:** create and verify an isolated private-media target.
2. **Completed Sep 14, bounded:** upload exactly 105 selected private assets and verify every object by cache-disabled download, byte count and SHA-256; attachment was not authorized.
3. **Completed Sep 14, repository evidence only:** record the owner's 210/210 `passed` checks and 35 `approve` decisions as owner intent; `adminOutcomeRecorded` remains false.
4. **Completed Sep 20, repository evidence only:** record the private-media attachment state canonically (LB-DS-080). **Still gated:** Admin outcome persistence and every operational attachment or learner-delivery step. Until they are verified, 0/35 card versions are release-approved and the package remains unseedable.
5. **Still gated:** approve starter seed and staging activation only after 35/35 release approval.
6. **Still gated:** approve phased public Web/PWA rollout only after closed-alpha exit evidence.

A missed owner gate moves the target one-for-one unless an explicit safe scope decision removes that dependency. It never authorizes bypassing security, review or release controls.

## Immediate execution order

1. Obtain explicit owner authorization for the next consequential gate; repository-recorded owner intent alone cannot authorize Admin persistence or operational media attachment/delivery.
2. Persist Admin outcomes through the reviewed protected Admin path and independently verify the resulting counts before claiming release approval.
3. Execute operational private-media attachment and authenticated delivery only through their distinct authorized paths; keep locators and receipts outside Git. LB-DS-080 records the attachment state as repository evidence only and authorizes no operational step.
4. Re-evaluate 35/35 release readiness, then request separate seed/staging activation authorization.
5. Continue disjoint default-off S2/S3 implementation only through newly queued, path-bounded tasks.
6. Admit no Android, payment, premium or generalized AI-factory work into v1.0.
