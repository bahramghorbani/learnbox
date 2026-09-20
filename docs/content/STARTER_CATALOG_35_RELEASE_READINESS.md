# LearnBox Start 35 — release-readiness audit

**Evidence baseline:** LB-DS-077's repository-only owner-decision record merged through PR #289 at `00d8b988a02aedf189f9588df5e1697c7bcea135` (exact reviewed head `d3924f8d0748df73c3c2460ccfe6f55ca0fcad15`), bound to source packet merge `f0f413bca32317e0bca25e55c54e950a37a95830` (PR #288).
**Audited at:** 2026-09-14
**Decision:** **BLOCKED — do not seed, attach, publish or enable server-backed Today figures.**

## Purpose

This audit separates structural/catalog readiness from human release approval. It does not approve
content, create `cards` or `card_versions`, attach private media, alter a runtime flag, invite
participants, deploy, or publish anything.

## Verified inventory

| Slice                    | Drafts |                                          Linguistic approval | Provenance                                            | Visual                                                                                                                                       | Audio                                                                                                                                                                                                       | App flow                                                                                                                                                       | Release-approved card versions |
| ------------------------ | -----: | -----------------------------------------------------------: | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------: |
| Original vertical slice  |  20/20 |      20/20 for `german_linguistic` and `persian_translation` | candidate-stage evidence for 20/20                    | 20/20 V2 candidates inspected and privately attested; LB-DS-080 records the repository attachment state only, with no operational attachment | 40/40 V1 word/sentence candidates sha-attested and transcription-QA-passed; LB-DS-080 records the repository attachment state only, with no operational attachment; Issue #59 V2 regeneration is incomplete | candidate-stage local flow passed                                                                                                                              |                           0/20 |
| Remaining catalog drafts |  15/15 | 15/15 for `german_linguistic` and `persian_translation` only | lexical-scope ledger exists for 15/15; candidate-only | 15/15 private candidates human-reviewed; LB-DS-080 records the repository attachment state only, with no operational attachment              | 30/30 private candidates human-reviewed; 28/30 exact transcription matches with two recorded exceptions, not attached                                                                                       | not approved                                                                                                                                                   |                           0/15 |
| Total catalog            |  35/35 |                 35/35 for the two linguistic dimensions only | incomplete for release                                | incomplete for release                                                                                                                       | incomplete for release                                                                                                                                                                                      | incomplete for release                                                                                                                                         |                           0/35 |
| Batched review packet    |  35/35 |             35/35 recorded for the two owner dimensions only | source-local page evidence for 35/35                  | alt text plus selected V2/V1 image for 35/35                                                                                                 | 105 selected assets linked; 2 exceptions recorded                                                                                                                                                           | pending/unproven for 35/35                                                                                                                                     |                           0/35 |
| Recorded owner decisions |  35/35 |        35/35 `approve`, repository evidence only (LB-DS-077) | 35/35 owner-submitted `passed`                        | 35/35 owner-submitted `passed`                                                                                                               | 35/35 owner-submitted `passed`                                                                                                                                                                              | 35/35 owner-submitted `passed`; app flow accepted only as the isolated offline review artifact's card flow, not Production runtime; nothing persisted in Admin |                           0/35 |

The canonical catalog snapshot is therefore truthful at its top-level release boundary:
`releaseStatus: draft`, `seedable: false`, `publicationBlocked: true`, and no seedable item IDs.

## Blocking gates

1. **Remaining 15 items still lack final media validation.** Private candidate-only media now exists:
   all 15 images and 30 audio clips received human review, the whole 105-asset selection was uploaded
   to the verified isolated target and passed initial plus complete-resume integrity verification, but
   the package has no operational attachment (LB-DS-080 records the attachment state as repository
   evidence only) and two automated transcription discrepancies
   (`start-a1-essen-sentence`, `start-a1-gross-word`) remain recorded for a later release decision.
   Final visual/audio approval and release authorization are not granted here.
2. **All 35 items lack release-level app-flow evidence.** The original 20 have candidate-stage local-flow evidence, while no artifact proves any of the 35 in the release learner flow,
   and every release-level `app_flow` check stays pending/unproven in the review packet. The owner
   accepted `app_flow` for all 35 items as repository evidence for the self-contained offline
   35-card review artifact's card flow only; that acceptance is not proof of a run Production learner
   flow and is recorded as `adminOutcomeRecorded: false` with `productionRuntimeVerified: false`.
3. **No item has an approved/published `card_versions` row.** ADR 0013 and
   `evaluateStartCatalogSeed` require a release-approved version for every target item; current count
   is 0/35.
4. **The original 20 have candidate-stage evidence, not release approval.** Private media is attested and its
   repository attachment state is recorded (LB-DS-080, `private_media_attached` as repository evidence
   only), but no operational attachment, database media row, provider call or learner delivery exists.
   Server-session authorization, owner release approval and
   participant-invitation approval remain open.
5. **Owner release approval is still absent for all 35.** The owner has now recorded `approve` for all
   35 items across all six dimensions, but only as repository evidence in the LB-DS-077 decision record:
   no Admin review store row, approved/published `card_versions` row or media attachment exists, so the
   recorded decisions do not authorize publication.

## Recorded owner review decisions — LB-DS-077 — 2026-09-14

The owner returned the batched six-dimension review of all 35 items, and LB-DS-077 records it in
`content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json`, verified by
`scripts/validate-start-35-owner-review-decisions.mjs` through
`pnpm verify:start-35-owner-review-decisions` and `pnpm test:start-35-owner-review-decisions`.

- Exactly 35 unique canonical items in the merged packet's order, six canonical dimensions each: 210
  item/dimension checks carry the owner's submitted outcome `ownerSubmittedOutcome: 'passed'` and 0
  submitted `failed`. They are owner-submitted outcomes, never persisted Admin review outcomes: every
  check states `adminOutcomeRecorded: false`, and the Admin review store keeps 0 recorded / 210 pending.
- Exactly 35 `approve` decisions, 0 `reject` and 0 `return_for_revision`, with no decision note.
- Bound to source merge `f0f413bca32317e0bca25e55c54e950a37a95830` and reviewed at
  `2026-09-14T17:31:26.517Z`; the validator cross-checks the merged packet, the migration 0006 and
  Admin review vocabulary, and the merge commit recorded in `.ai/WORK_QUEUE.md`.
- Every check repeats the reviewed packet's prior evidence status and scope unchanged, so `app_flow`
  keeps the packet's `pending_unproven` / `unproven_at_release_level` while recording the owner's
  acceptance of the isolated artifact's card flow.
- `reviewPresentation` pins what was actually presented: one self-contained offline 35-card
  owner-review artifact, content and card-flow acceptance only, with
  `productionRuntimeVerification: false`, `runtimeActivationVerification: false`,
  `adminReviewOutcomePersistence: false` and `liveDatabaseVerification: false`.
- Both prior transcription discrepancies (`start-a1-essen-sentence`, `start-a1-gross-word`) are
  derived from the reviewed packet into `priorEvidenceExceptions` with disposition
  `accepted_as_presented_unpersisted_to_admin`, `resolved: false` and no Admin outcome; owner
  acceptance of the audio neither removes nor resolves them, and the validator fails closed if either
  disappears or is altered, duplicated or resolved.
- `reviewerRole: 'owner'` is owner-asserted through the submitted review artifact
  (`reviewerRoleBasis: 'owner_asserted_through_submitted_review_artifact'`): reviewer identity is not
  independently verified and no cryptographic, session or external identity proof is claimed.
- The submitted artifact's SHA-256 is retained outside the canonical record — in `.ai/WORK_QUEUE.md`
  and the LB-DS-077 handoff report only. No private-media or provider digest, media byte count,
  provider identifier, credential, receipt payload or remote locator enters this repository.

This record is repository evidence of owner intent only. It performs and claims no Admin persistence,
database mutation, media attachment, seedability, learner exposure, runtime activation, provider call
or publication: the derived record keeps `attachmentAllowed: false`, `seedable: false`,
`learnerExposure: false` and `publicationBlocked: true`, with 0/35 release-approved card versions and
the Admin review store still at `35 / 210 / 210 / 0 / 0`. Recording an approval is not the same as
executing it, so every blocking gate above remains open and the audit decision remains **BLOCKED**.

## LB-DS-055 evidence reconciliation — 2026-09-11

The merged LB-DS-055 evidence package adds private, human-reviewed candidate media for the remaining
15 items without changing this release decision:

- 15 images and 30 audio clips were reviewed privately; the final review export records 45/45
  approvals.
- Automated transcription is 28/30 exact normalized matches. `start-a1-essen-sentence` and
  `start-a1-gross-word` remain explicit discrepancies; human listening approval neither removes
  them nor grants release approval.
- The evidence ledger anchors the generation manifest, transcription QA and final human-review
  export by SHA-256. Every recorded field remains candidate-only: `attachmentAllowed: false`,
  `seedable: false`, `publicationBlocked: true`.

The decision remains **BLOCKED**. LB-DS-055 did not attach media, write an Admin review check or
review decision, create an approved/published `card_versions` row, seed a catalog, activate a
runtime flag, deploy or invite participants.

## Historical audit finding — 2026-09-08

At the earlier audit baseline, evidence metadata had stale pre-approval and candidate-QA chronology
that needed reconciliation before a release decision:

- both draft batches used top-level/item `needs_editorial_review` / `needs_review` wording and
  source/provenance text saying German/Persian editorial review was pending, although later approval
  events and the derived 35-item snapshot recorded those two dimensions as approved;
- both candidate-intake files (`start-a1-slice-candidates.json` and
  `start-a1-catalog-35-pending-candidates.json`) said their candidates required German and Persian
  editorial review, although later approval events recorded those two dimensions;
- `start-a1-catalog-35-pending-provenance-ledger.json` listed German/Persian review as remaining for
  the 15-item batch, although those dimensions were later approved;
- Issue #59's V2 audio gate said 40/40 passed, but its ledger recorded only 6/40 listening-approved
  V2 files, 34/40 pending/absent and four transcription mismatches. It was not evidence for the V1
  attested/transcription-QA set.
  These were chronology drift, not permission to infer broader approval.

## Post-audit reconciliation — 2026-09-08

LB-DS-045 resolves the evidence-metadata drift identified above without expanding approval:

- both candidate intakes now point to their exact product-owner linguistic approval event;
- both draft batches record the two approved dimensions while every item remains `needs_review` and
  every non-linguistic/release gate remains open;
- the 15-item provenance ledger no longer lists German/Persian review as pending;
- the derived Issue #59 gate is now validated from the committed V2 ledger and reports 36/40
  transcription matches, four regeneration failures, 6/40 listening approvals and 34/40 pending
  reviews; `releaseReady: false`, `attachmentAllowed: false` and `publicationBlocked: true`.

The audit decision remains **BLOCKED** because this reconciliation corrects evidence truth only. It
adds no release-level media or app-flow approval, release-approved `card_versions`, seed permission or
publication permission.

## Private upload completed — 2026-09-14

The bounded owner-authorized operation uploaded exactly 105 selected assets to the verified isolated
private target. All 105 objects passed an initial and a complete-resume cache-disabled private-download
byte-count and SHA-256 verification. The URL-free receipt stays outside Git; no provider identifier,
private locator, asset digest or receipt payload is recorded in this repository. Attachment, learner
delivery and activation have not occurred. The owner later returned the repository-only review now
recorded by LB-DS-077, but no Admin review outcome or release approval was persisted; the historical
pre-upload lifecycle fields inside `start-a1-35-final-media-manifest.json` are **not** current upload
truth.

## Batched human-review packet — LB-DS-076 — 2026-09-14

`content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json` presents all 35 canonical
items for the single batched six-dimension owner review. It is deterministic and is built and verified
by `scripts/build-start-35-human-review-packet.mjs` and
`scripts/validate-start-35-human-review-packet.mjs` through
`pnpm build:start-35-human-review-packet`, `pnpm verify:start-35-human-review-packet` and
`pnpm test:start-35-human-review-packet`.

For every canonical item the packet carries:

- the immutable `contentId`, final German and Persian draft text, and the recorded product-owner
  approval of `german_linguistic` and `persian_translation` only;
- provenance evidence anchored to the lexical-scope ledgers by page reference, with no digest or
  private locator;
- the selected image asset with deterministic alt text, expected MIME type, recorded visual concept,
  and the V1→V2 supersession that keeps an explicit media rollback target;
- the selected word and sentence audio assets plus the candidate-stage visual and audio records;
- an explicit release-level `app_flow` status of pending/unproven for all 35 items while
  candidate-stage app-flow evidence is preserved only where a source actually records it;
- the two recorded transcription exceptions, still unresolved and still explicit;
- the allowed check-outcome vocabulary `passed | failed`, the allowed decision vocabulary
  `approve | reject | return_for_revision`, and no recorded check outcome and no recorded decision;
- rollback linkage to PDR-008 for code, evidence preservation and destructive-deletion limits.

All 210 item/dimension pairs stay unrecorded, the packet contains exactly 35 items and exactly the six
canonical dimension IDs of migration 0006 and the Admin review store, and it stays
`publicationBlocked: true`, `seedable: false`, `attachmentAllowed: false`. It offers no provider call,
no runtime mutation, no database write and no automatic approval path.

### Transparency limits — LB-DS-076 hardening

The packet states the limits of its own evidence in the item records and in a single
`transparencyLimits` block, and the validator fails closed on any drift away from them:

- the selected-image alt text is `derived_not_reviewed`: it is derived deterministically from the
  committed draft fields `lemma`, `persianMeanings` and `simpleGermanDefinition` and is **not**
  authored, reviewed, approved or verified against the actual image;
- each image records its language mix truthfully (`de`, `fa`) and the recorded draft locale
  (`de-DE`); no reviewed or approved alt text is claimed;
- the recorded `visualConcept` is labelled `draft_intent_not_verified_depiction` with its committed
  draft source, so it is read as draft intent and not as proof of what the image depicts;
- no item or version is a verified database row: every item states `databaseRowsVerified: false`,
  and card/version linkage is a repository and migration baseline, **not** live database truth;
- `repositoryLocalMedia` is true for the 20 original items, whose selected image and audio files are
  present in this repository, and false for the final 15, whose selected media stays outside the
  repository until it is attached; the validator re-checks the claim against the files on disk;
- evidence scope is explicit per dimension: `repository_local_per_item` for the per-item linguistic,
  provenance and original-slice media records, `batch_aggregate_unverified_in_repository` for the
  final-15 visual and audio candidates, which are batch-aggregate evidence carrying no per-item
  in-repository media proof, and `unproven_at_release_level` for app flow.

Derived alt text, repository/migration linkage and aggregate final-15 evidence are not review
results. The actual media still requires human viewing and listening before any decision.

## Safe next workstream

The bounded preparation slice described by earlier audits is complete: all 35 items have private
candidate-only media, the final 105-asset selection passed initial and complete-resume private
integrity verification, the batched review packet presents the whole set, and the owner has returned
the batched six-dimension decision now recorded as repository evidence by LB-DS-077. Persisting
corresponding Admin outcomes and attaching private media are possible only after two distinct owner
authorizations and through two distinct reviewed execution paths; neither action is authorized by the
recorded review artifact. Once each is separately authorized, neither path requires provider cost or
candidate generation. Human
visual/audio/content judgment remains mandatory — validators and AI output cannot grant it.

## Release decision package — prepared 2026-09-14

The per-item package required before a release decision now exists as
`content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json`, refreshed from the
post-upload baseline. It supplies the immutable `contentId` and final German/Persian text, provenance
evidence, the selected image with alt text and its visual-QA record, the selected word and sentence
audio with their QA records, the explicitly unproven learner-flow status, the allowed
`approve | reject | return_for_revision` decision inputs, and rollback/version linkage.

Preparing that package grants no approval, and the owner's recorded decisions in
`content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json` are repository
evidence of that decision rather than its execution: its 210 `passed` checks are explicit
owner-submitted outcomes (`ownerSubmittedOutcome` with `adminOutcomeRecorded: false`), and its
`reviewPresentation` records acceptance of the self-contained offline 35-card review artifact only,
not Production runtime verification. One later task may persist corresponding Admin outcomes and
produce approved, unpublished `card_versions` only after explicit authorization for that Admin path.
A
distinct later task may attach private media only after explicit attachment authorization and through
the reviewed attachment path. The catalog may be seeded and Preview activation considered only after
both independent operations succeed. Transitioning a version to `published` requires its own explicit
publication authorization and execution path after the attachment, seed/release and publication gates
are satisfied. Participant invitation, Preview activation and Production remain separate owner gates.

LB-DS-080 now records the attachment state itself as repository evidence in
`content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json`: derived
deterministically from the immutable manifest and the immutable attestation, digest-anchoring both,
carrying no per-asset pathname, checksum, byte size or provider locator, and executing nothing
(`publicationBlocked: true`, `learnerDeliveryActivated: false`, `databaseMediaRowsWritten: false`,
`providerCallPerformed: false`). It grants no operational attachment, database row, provider call,
deployment, learner delivery or publication.

That record also preserves the verified exposure truth, which no summary may overstate as "all 105
private": 60 of the 105 attested assets are byte-identical to copies already tracked in this
public repository — 20 images, 20 word-audio and 20 sentence-audio assets across 20 of the 35 content
IDs, matching 63 tracked paths — so those 60 assets are not private. The remaining 45 assets across 15
content IDs have no public byte-identical copy. `pnpm verify:start-35-final-private-media-attachment`
re-derives both counts from tracked Git blobs without any provider or network call.

## Evidence sources

- `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`
- `content/packs/learnbox-start/validation/start-a1-slice-linguistic-approval.json`
- `content/packs/learnbox-start/validation/start-a1-candidate-qa.json`
- `content/packs/learnbox-start/validation/start-a1-v2-candidate-qa.json`
- `content/packs/learnbox-start/validation/start-a1-provenance-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-private-media-attestation.json`
- `content/packs/learnbox-start/validation/start-a1-v2-images-private-media-attestation.json`
- `content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json`
- `content/packs/learnbox-start/validation/start-a1-issue59-audio-gate.json`
- `content/packs/learnbox-start/validation/start-a1-slice-candidates.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-candidates.json`
- `content/packs/learnbox-start/validation/start-a1-slice-review-queue.json`
- `content/packs/learnbox-start/validation/start-a1-issue59-audio-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-avalai-audio-transcription-qa.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json` (LB-DS-055 evidence anchors)
- `content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json` (LB-DS-076 batched review packet)
- `content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json` (LB-DS-077 recorded owner decisions)
- `content/packs/learnbox-start/validation/start-a1-35-final-media-manifest.json`
- `database/migrations/0006_content_review_quality_gates.sql`
- `apps/admin/lib/server/postgres-content-review-store.ts`
- `docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md`
- `scripts/build-start-35-human-review-packet.mjs`; `scripts/validate-start-35-human-review-packet.mjs`; `scripts/validate-start-35-human-review-packet.test.mjs`
- `scripts/validate-start-35-owner-review-decisions.mjs`; `scripts/validate-start-35-owner-review-decisions.test.mjs`
- `.ai/worker-reports/LB-DS-076.md`
- `.ai/worker-reports/LB-DS-077.md`
- `.ai/worker-reports/LB-DS-055.md`
- `apps/api/src/catalog/start-catalog-seed-gate.ts`
- ADR 0013 and ADR 0016
