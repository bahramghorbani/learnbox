# LearnBox current work

**Scope:** only unfinished work. Stable merged facts live in `PROJECT_STATE.md`; capability truth lives in `docs/PRODUCT_STATUS.md`; release sequencing lives in `ROADMAP.md`; task authorization lives in `.ai/WORK_QUEUE.md`.

## Active work

### LB-DS-065 — Public-v1.0 finish line and release seasons

- **Status:** review requested in Draft PR #276 on `docs/release-seasons-finish-line` from exact `origin/main` `dfede397a9f2ffdccdd7e7fe916688f9fdc6685e`.
- **Outcome:** replace contradictory milestone, alpha, payment, iOS, storyboard and long-horizon scope claims with one S0–S5 critical path, measurable exit gates and a best/target/outer public-release forecast.
- **Boundary:** documentation architecture only. No application code, content/media data, provider, credential, database, flag, deployment, staging, Production or release state changes.
- **Next gate:** independent exact-head product/architecture review and all required CI checks before merge.

## LB-DS-060 — Offline media-attachment preparation (local-only)

- **Status:** deterministic extraction is retained only on local branch `local/start15-media-attachment-rebased` at independently reviewed head `aec94daf678322430cfe3ab34db44cd24b65d3b9`, based on PR #275 merge `dfede397a9f2ffdccdd7e7fe916688f9fdc6685e`.
- **Evidence:** 15 candidate items, 45 expected assets, zero attachment/upload/private locator/learner exposure; focused and governance checks passed.
- **Boundary:** no upstream, push, PR or merge is authorized. A real upload remains blocked on an owner-selected isolated target, owner-authenticated OIDC credentials and a distinct upload approval.

## Critical-path owner gates

1. Select/create an isolated private-media target and accept any provider cost; this does not authorize upload.
2. Separately authorize guarded upload/attachment after target verification.
3. Complete one batched approve/return review for all 35 starter items across the six auditable dimensions.
4. Approve starter seed/Web alpha activation only after 35/35 release approval.
5. Later approve merchant/provider terms, Production activation and Cafe Bazaar publication at their release gates.

## Immediate execution order

1. Complete LB-DS-065 review and merge.
2. Begin S1 with the isolated private-media target decision.
3. Keep learner seed/activation downstream of human content approval.
4. Do not admit post-v1 scope into the v1.0 critical path without a decision record and reforecast.
