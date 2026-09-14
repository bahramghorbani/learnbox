# LearnBox Start 35 — release-readiness audit

**Audit baseline:** `9a98197ffeee98f4069a690a59caebd0df4b053f` (`origin/main`, PR #287 merge)
**Audited at:** 2026-09-14
**Decision:** **BLOCKED — do not seed, attach, publish or enable server-backed Today figures.**

## Purpose

This audit separates structural/catalog readiness from human release approval. It does not approve
content, create `cards` or `card_versions`, attach private media, alter a runtime flag, invite
participants, deploy, or publish anything.

## Verified inventory

| Slice                    | Drafts |                                          Linguistic approval | Provenance                                            | Visual                                                             | Audio                                                                                                                             | App flow                          | Release-approved card versions |
| ------------------------ | -----: | -----------------------------------------------------------: | ----------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -----------------------------: |
| Original vertical slice  |  20/20 |      20/20 for `german_linguistic` and `persian_translation` | candidate-stage evidence for 20/20                    | 20/20 V2 candidates inspected and privately attested, not attached | 40/40 V1 word/sentence candidates sha-attested and transcription-QA-passed, not attached; Issue #59 V2 regeneration is incomplete | candidate-stage local flow passed |                           0/20 |
| Remaining catalog drafts |  15/15 | 15/15 for `german_linguistic` and `persian_translation` only | lexical-scope ledger exists for 15/15; candidate-only | 15/15 private candidates human-reviewed, not attached              | 30/30 private candidates human-reviewed; 28/30 exact transcription matches with two recorded exceptions, not attached             | not approved                      |                           0/15 |
| Total catalog            |  35/35 |                 35/35 for the two linguistic dimensions only | incomplete for release                                | incomplete for release                                             | incomplete for release                                                                                                            | incomplete for release            |                           0/35 |
| Batched review packet    |  35/35 |             35/35 recorded for the two owner dimensions only | source-local page evidence for 35/35                  | alt text plus selected V2/V1 image for 35/35                       | 105 selected assets linked; 2 exceptions recorded                                                                                 | pending/unproven for 35/35        |                           0/35 |

The canonical catalog snapshot is therefore truthful at its top-level release boundary:
`releaseStatus: draft`, `seedable: false`, `publicationBlocked: true`, and no seedable item IDs.

## Blocking gates

1. **Remaining 15 items still lack final media validation.** Private candidate-only media now exists:
   all 15 images and 30 audio clips received human review, the whole 105-asset selection was uploaded
   to the verified isolated target and passed initial plus complete-resume integrity verification, but
   the package remains unattached and two automated transcription discrepancies
   (`start-a1-essen-sentence`, `start-a1-gross-word`) remain recorded for a later release decision.
   Final visual/audio approval and release authorization are not granted here.
2. **Remaining 15 items lack app-flow approval.** No artifact proves those items in the learner flow,
   and every release-level `app_flow` check stays pending/unproven in the review packet.
3. **No item has an approved/published `card_versions` row.** ADR 0013 and
   `evaluateStartCatalogSeed` require a release-approved version for every target item; current count
   is 0/35.
4. **The original 20 have candidate-stage evidence, not release approval.** Private media is attested
   but remains deliberately unattached. Server-session authorization, owner release approval and
   participant-invitation approval remain open.
5. **Owner release approval is absent for all 35.** Existing owner confirmations cover only German
   linguistic and Persian translation dimensions; they do not authorize publication.

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
adds no media approval, app-flow approval, release-approved `card_versions`, seed permission or
publication permission.

## Private upload completed — 2026-09-14

The bounded owner-authorized operation uploaded exactly 105 selected assets to the verified isolated
private target. All 105 objects passed an initial and a complete-resume cache-disabled private-download
byte-count and SHA-256 verification. The URL-free receipt stays outside Git; no provider identifier,
private locator, asset digest or receipt payload is recorded in this repository. Attachment, learner
delivery, review decisions and activation have not occurred, and the historical pre-upload lifecycle
fields inside `start-a1-35-final-media-manifest.json` are **not** current upload truth.

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

## Safe next workstream

The bounded preparation slice described by earlier audits is complete: all 35 items have private
candidate-only media, the final 105-asset selection passed initial and complete-resume private
integrity verification, and the batched review packet presents the whole set. The next authorized step
is the owner's per-item review of that packet; it requires no provider cost or candidate generation.
Human visual/audio/content judgment remains mandatory — validators and AI output cannot grant it.

## Release decision package — prepared 2026-09-14

The per-item package required before a release decision now exists as
`content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json`, refreshed from the
post-upload baseline. It supplies the immutable `contentId` and final German/Persian text, provenance
evidence, the selected image with alt text and its visual-QA record, the selected word and sentence
audio with their QA records, the explicitly unproven learner-flow status, the allowed
`approve | reject | return_for_revision` decision inputs, and rollback/version linkage.

Preparing that package grants no approval. A subsequent serial release task may create
approved/published `card_versions`, attach authorized private media, seed the catalog and consider
Preview flag enablement only after the owner returns an explicit decision for every item. Publication,
participant invitation, Preview activation and Production remain separate owner gates.

## Evidence sources

- `content/packs/learnbox-start/validation/start-a1-35-catalog-slice.json`
- `content/packs/learnbox-start/validation/start-a1-slice-linguistic-approval.json`
- `content/packs/learnbox-start/validation/start-a1-candidate-qa.json`
- `content/packs/learnbox-start/validation/start-a1-v2-candidate-qa.json`
- `content/packs/learnbox-start/validation/start-a1-provenance-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-private-media-attestation.json`
- `content/packs/learnbox-start/validation/start-a1-v2-images-private-media-attestation.json`
- `content/packs/learnbox-start/validation/start-a1-issue59-audio-gate.json`
- `content/packs/learnbox-start/validation/start-a1-slice-candidates.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-candidates.json`
- `content/packs/learnbox-start/validation/start-a1-slice-review-queue.json`
- `content/packs/learnbox-start/validation/start-a1-issue59-audio-ledger.json`
- `content/packs/learnbox-start/validation/start-a1-avalai-audio-transcription-qa.json`
- `content/packs/learnbox-start/validation/start-a1-catalog-35-pending-provenance-ledger.json` (LB-DS-055 evidence anchors)
- `content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json` (LB-DS-076 batched review packet)
- `content/packs/learnbox-start/validation/start-a1-35-final-media-manifest.json`
- `database/migrations/0006_content_review_quality_gates.sql`
- `apps/admin/lib/server/postgres-content-review-store.ts`
- `docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md`
- `scripts/build-start-35-human-review-packet.mjs`; `scripts/validate-start-35-human-review-packet.mjs`; `scripts/validate-start-35-human-review-packet.test.mjs`
- `.ai/worker-reports/LB-DS-076.md`
- `.ai/worker-reports/LB-DS-055.md`
- `apps/api/src/catalog/start-catalog-seed-gate.ts`
- ADR 0013 and ADR 0016
