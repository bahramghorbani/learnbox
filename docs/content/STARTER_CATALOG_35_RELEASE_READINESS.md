# LearnBox Start 35 — release-readiness audit

**Audit baseline:** `bb6c6d6ca1b0af1b0a96a771c4f29a6aabe73d4e` (`origin/main`)
**Audited at:** 2026-09-08 11:53 +0330
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

The canonical catalog snapshot is therefore truthful at its top-level release boundary:
`releaseStatus: draft`, `seedable: false`, `publicationBlocked: true`, and no seedable item IDs.

## Blocking gates

1. **Remaining 15 items still lack final media validation.** Private candidate-only media now exists:
   all 15 images and 30 audio clips received human review, but the package remains unattached and
   two automated transcription discrepancies (`start-a1-essen-sentence`, `start-a1-gross-word`) remain
   recorded for a later release decision. Final visual/audio approval and release authorization are not granted here.
2. **Remaining 15 items lack app-flow approval.** No artifact proves those items in the learner flow.
3. **No item has an approved/published `card_versions` row.** ADR 0013 and
   `evaluateStartCatalogSeed` require a release-approved version for every target item; current count
   is 0/35.
4. **The original 20 have candidate-stage evidence, not release approval.** Private media is attested
   but remains deliberately unattached. Server-session authorization, owner release approval and
   participant-invitation approval remain open.
5. **Owner release approval is absent for all 35.** Existing owner confirmations cover only German
   linguistic and Persian translation dimensions; they do not authorize publication.
6. **At the audit baseline, evidence metadata had stale pre-approval and candidate-QA chronology that
   needed reconciliation before a release decision:**
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

## Safe next workstream

A bounded next preparation slice may:

1. with separate cost authorization, define and generate **candidate-only** image and audio assets for
   the remaining 15 under the existing visual/media contracts, with immutable IDs and checksums;
2. run provenance, visual, audio and local app-flow QA for those 15;
3. produce a 35-item release ledger that remains `publicationBlocked: true`;
4. stop before media attachment, DB seed, `card_versions` approval/publication, participant invitation,
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
