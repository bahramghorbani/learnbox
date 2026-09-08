# LearnBox Start 35 — release-readiness audit

**Audit baseline:** `bb6c6d6ca1b0af1b0a96a771c4f29a6aabe73d4e` (`origin/main`)
**Audited at:** 2026-09-08 11:53 +0330
**Decision:** **BLOCKED — do not seed, attach, publish or enable server-backed Today figures.**

## Purpose

This audit separates structural/catalog readiness from human release approval. It does not approve
content, create `cards` or `card_versions`, attach private media, alter a runtime flag, invite
participants, deploy, or publish anything.

## Verified inventory

| Slice                    | Drafts |                                     Linguistic approval | Provenance                                                     | Visual                                                             | Audio                                                                                                                             | App flow                          | Release-approved card versions |
| ------------------------ | -----: | ------------------------------------------------------: | -------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -----------------------------: |
| Original vertical slice  |  20/20 | 20/20 for `german_linguistic` and `persian_translation` | candidate-stage evidence for 20/20                             | 20/20 V2 candidates inspected and privately attested, not attached | 40/40 V1 word/sentence candidates sha-attested and transcription-QA-passed, not attached; Issue #59 V2 regeneration is incomplete | candidate-stage local flow passed |                           0/20 |
| Remaining catalog drafts |  15/15 | 15/15 for `german_linguistic` and `persian_translation` | lexical-scope ledger exists for 15/15; release gate not closed | no candidate media requested                                       | no candidate media requested                                                                                                      | not approved                      |                           0/15 |
| Total catalog            |  35/35 |            35/35 for the two linguistic dimensions only | incomplete for release                                         | incomplete for release                                             | incomplete for release                                                                                                            | incomplete for release            |                           0/35 |

The canonical catalog snapshot is therefore truthful at its top-level release boundary:
`releaseStatus: draft`, `seedable: false`, `publicationBlocked: true`, and no seedable item IDs.

## Blocking gates

1. **Remaining 15 items lack candidate and final media validation.** Their provenance ledger records
   `candidateMedia.status: none_requested`; visual and audio release gates remain open.
2. **Remaining 15 items lack app-flow approval.** No artifact proves those items in the learner flow.
3. **No item has an approved/published `card_versions` row.** ADR 0013 and
   `evaluateStartCatalogSeed` require a release-approved version for every target item; current count
   is 0/35.
4. **The original 20 have candidate-stage evidence, not release approval.** Private media is attested
   but remains deliberately unattached. Server-session authorization, owner release approval and
   participant-invitation approval remain open.
5. **Owner release approval is absent for all 35.** Existing owner confirmations cover only German
   linguistic and Persian translation dimensions; they do not authorize publication.
6. **Evidence metadata has stale pre-approval and candidate-QA chronology that must be reconciled
   before a release decision:**
   - both draft batches still use top-level/item `needs_editorial_review` / `needs_review` wording
     and source/provenance text saying German/Persian editorial review is pending, although later
     approval events and the derived 35-item snapshot record those two dimensions as approved;
   - both candidate-intake files (`start-a1-slice-candidates.json` and
     `start-a1-catalog-35-pending-candidates.json`) still say their candidates require German and
     Persian editorial review, although later approval events record those two dimensions;
   - `start-a1-catalog-35-pending-provenance-ledger.json` still lists German/Persian review as
     remaining for the 15-item batch, although those dimensions were later approved;
   - Issue #59's V2 audio gate says 40/40 passed, but its ledger records only 6/40 listening-approved
     V2 files, 34/40 pending/absent and four transcription mismatches. It is not evidence for the
     V1 attested/transcription-QA set.
     These are chronology drift, not permission to infer broader approval.

## Safe next workstream

A bounded, owner-free preparation slice may:

1. reconcile stale pre-approval and candidate-QA metadata across both draft batches, both candidate
   intakes, the 15-item provenance ledger and the Issue #59 V2 audio gate/ledger without changing
   approval scope;
2. define and generate **candidate-only** image and audio assets for the remaining 15 under the
   existing visual/media contracts, with immutable IDs and checksums;
3. run provenance, visual, audio and local app-flow QA for those 15;
4. produce a 35-item release ledger that remains `publicationBlocked: true`;
5. stop before media attachment, DB seed, `card_versions` approval/publication, participant invitation,
   runtime-flag enablement, deployment or Production.

Candidate generation may incur provider cost and must be separately authorized before execution.
Human visual/audio/content judgment remains mandatory; validators and AI output cannot grant it.

## Release decision package required afterward

Only after the preparation slice is complete should the owner receive a per-item review package with:

- immutable `contentId` and final German/Persian text;
- provenance evidence;
- selected image plus alt text and visual-QA result;
- selected word and sentence audio plus listening-QA result;
- learner-flow screenshot/interaction result;
- explicit approve/return decision for each item;
- rollback/version linkage.

A subsequent serial release task may create approved/published `card_versions`, attach authorized
private media, seed the catalog and consider Preview flag enablement. Publication, participant
invitation, Preview activation and Production remain separate owner gates.

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
- `apps/api/src/catalog/start-catalog-seed-gate.ts`
- ADR 0013 and ADR 0016
