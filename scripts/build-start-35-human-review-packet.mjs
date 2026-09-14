import { format, resolveConfig } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const packetUrl = new URL('validation/start-a1-35-human-review-packet.json', contentRoot);

export const packetRepositoryPath =
  'content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json';
// Canonical review dimensions, mirrored from migration 0006 and the Admin store.
// The validator re-derives them from both source files and fails on drift.
export const reviewDimensionIds = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];
export const checkOutcomeIds = ['passed', 'failed'];
export const reviewDecisionIds = ['approve', 'reject', 'return_for_revision'];
export const checkStateIds = [
  'owner_linguistic_approval_recorded',
  'candidate_stage_evidence_recorded',
  'pending_unproven',
];

const itemCount = 35;
const originalItemCount = 20;
const finalItemCount = 15;
const dimensionCount = 6;
const assetCount = 105;
const ownerApprovedDimensions = ['german_linguistic', 'persian_translation'];
const audioExceptions = ['start-a1-essen-sentence', 'start-a1-gross-word'];

const sourceNames = {
  catalogSlice: 'start-a1-35-catalog-slice.json',
  drafts: 'start-a1-vertical-slice-drafts.json',
  pendingDrafts: 'start-a1-catalog-35-pending-drafts.json',
  linguisticApproval: 'start-a1-slice-linguistic-approval.json',
  provenanceLedger: 'start-a1-provenance-ledger.json',
  pendingProvenanceLedger: 'start-a1-catalog-35-pending-provenance-ledger.json',
  candidateQa: 'start-a1-candidate-qa.json',
  v2CandidateQa: 'start-a1-v2-candidate-qa.json',
  mediaAttachment: 'start-a1-media-attachment-draft.json',
  v2Images: 'start-a1-v2-image-attachment-draft.json',
  finalCandidates: 'start-a1-15-candidate-media-attachment-draft.json',
  finalManifest: 'start-a1-35-final-media-manifest.json',
};
const draftSourceNames = {
  drafts: 'start-a1-vertical-slice-drafts.json',
  pendingDrafts: 'start-a1-catalog-35-pending-drafts.json',
};

const evidence = {
  slice: 'validation/start-a1-35-catalog-slice.json',
  linguisticApproval: 'validation/start-a1-slice-linguistic-approval.json',
  provenanceLedger: 'validation/start-a1-provenance-ledger.json',
  pendingProvenanceLedger: 'validation/start-a1-catalog-35-pending-provenance-ledger.json',
  candidateQa: 'validation/start-a1-candidate-qa.json',
  v2CandidateQa: 'validation/start-a1-v2-candidate-qa.json',
  mediaAttachment: 'validation/start-a1-media-attachment-draft.json',
  finalCandidates: 'validation/start-a1-15-candidate-media-attachment-draft.json',
  finalManifest: 'validation/start-a1-35-final-media-manifest.json',
  currentWork: 'CURRENT_WORK.md',
  readiness: 'docs/content/STARTER_CATALOG_35_RELEASE_READINESS.md',
  reviewPersistence: 'docs/product-decisions/PDR-008-ADMIN-STARTER-REVIEW-PERSISTENCE.md',
};

const ids = (items, key) => items.map((entry) => entry[key]);
const assertSameIdSet = (left, right, message) => {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  if (
    leftSorted.length !== rightSorted.length ||
    leftSorted.some((id, index) => id !== rightSorted[index])
  ) {
    throw new Error(message);
  }
};

function assertSources({
  catalogSlice,
  drafts,
  pendingDrafts,
  linguisticApproval,
  provenanceLedger,
  pendingProvenanceLedger,
  candidateQa,
  v2CandidateQa,
  mediaAttachment,
  v2Images,
  finalCandidates,
  finalManifest,
}) {
  if (catalogSlice.publicationBlocked !== true || catalogSlice.seedDecision?.seedable !== false) {
    throw new Error('The catalog slice must stay publication-blocked and non-seedable.');
  }
  if (
    catalogSlice.draftedItemIds?.length !== itemCount ||
    new Set(catalogSlice.draftedItemIds).size !== itemCount ||
    catalogSlice.pendingDraftedItemIds?.length !== finalItemCount
  ) {
    throw new Error(
      `The catalog slice must stay ${itemCount} drafted items with ${finalItemCount} pending.`,
    );
  }
  if (
    drafts.items?.length !== originalItemCount ||
    pendingDrafts.items?.length !== finalItemCount
  ) {
    throw new Error(
      `The draft sources must stay ${originalItemCount} plus ${finalItemCount} items.`,
    );
  }
  assertSameIdSet(
    ids(drafts.items, 'id'),
    catalogSlice.draftedItemIds.filter((id) => !catalogSlice.pendingDraftedItemIds.includes(id)),
    'The original draft set must equal the catalog slice original item set.',
  );
  assertSameIdSet(
    ids(pendingDrafts.items, 'id'),
    catalogSlice.pendingDraftedItemIds,
    'The pending draft set must equal the catalog slice pending item set.',
  );
  for (const draft of [...drafts.items, ...pendingDrafts.items]) {
    if (draft.status !== 'needs_review' || (draft.media ?? []).length !== 0) {
      throw new Error(`${draft.id} must stay needs_review without attached media.`);
    }
  }

  if (
    JSON.stringify(linguisticApproval.approvedDimensions) !==
      JSON.stringify(ownerApprovedDimensions) ||
    linguisticApproval.approvedByRole !== 'product_owner'
  ) {
    throw new Error(
      `Linguistic approval must stay limited to the ${ownerApprovedDimensions.join('/')} dimensions.`,
    );
  }
  assertSameIdSet(
    linguisticApproval.itemIds,
    catalogSlice.draftedItemIds,
    'Linguistic approval must still cover exactly the canonical item set.',
  );
  const approvalEvents = linguisticApproval.approvalEvents ?? [];
  const approvalCoverage = approvalEvents.reduce(
    (total, event) => total + (event.itemIds ?? []).length,
    0,
  );
  if (approvalCoverage !== itemCount || approvalEvents.length !== 2) {
    throw new Error(`Linguistic approval events must still cover ${itemCount} items.`);
  }
  assertSameIdSet(
    approvalEvents.flatMap((event) => event.itemIds ?? []),
    catalogSlice.draftedItemIds,
    'Linguistic approval events must still cover exactly the canonical item set.',
  );
  for (const event of approvalEvents) {
    if (JSON.stringify(event.approvedDimensions) !== JSON.stringify(ownerApprovedDimensions)) {
      throw new Error(
        'Every linguistic approval event must stay limited to the two owner records.',
      );
    }
  }

  assertSameIdSet(
    ids(provenanceLedger.items ?? [], 'itemId'),
    ids(drafts.items, 'id'),
    'The provenance ledger must cover exactly the original draft set.',
  );
  assertSameIdSet(
    ids(pendingProvenanceLedger.items ?? [], 'itemId'),
    ids(pendingDrafts.items, 'id'),
    'The pending provenance ledger must cover exactly the pending draft set.',
  );
  for (const ledger of [provenanceLedger, pendingProvenanceLedger]) {
    if (ledger.releaseState !== 'documented_not_released') {
      throw new Error('Every provenance ledger must stay documented_not_released.');
    }
    if (
      ledger.candidateMedia?.attachmentAllowed !== false ||
      ledger.candidateMedia?.publicationAllowed !== false
    ) {
      throw new Error('Provenance candidate media must stay unattachable and unpublishable.');
    }
  }

  const candidateOutcomes = Object.entries(candidateQa.checks ?? {}).filter(
    ([, check]) => check.outcome === 'passed_for_candidate_stage',
  );
  if (candidateOutcomes.length !== 4 || candidateQa.publicationBlocked !== true) {
    throw new Error(
      'The original candidate QA must keep four candidate-stage outcomes and stay publication-blocked.',
    );
  }
  if (
    v2CandidateQa.checks?.visual?.outcome !== 'passed_for_candidate_stage' ||
    v2CandidateQa.checks?.audio?.outcome !== 'passed_for_candidate_stage' ||
    v2CandidateQa.publicationBlocked !== true
  ) {
    throw new Error('The V2 candidate QA must keep its candidate-stage visual/audio outcomes.');
  }

  for (const [label, source, status, qaStatus] of [
    ['V1 media', mediaAttachment, 'awaiting_private_storage_url', 'candidate_qa_passed'],
    ['V2 images', v2Images, 'awaiting_private_storage_url', 'candidate_qa_passed'],
    ['Final candidates', finalCandidates, 'awaiting_private_upload', undefined],
  ]) {
    if (source.state !== 'ready_for_private_storage_not_attached' && label !== 'Final candidates') {
      throw new Error(`${label} must stay ready_for_private_storage_not_attached.`);
    }
    if (source.publicationBlocked !== true) {
      throw new Error(`${label} must stay publication-blocked.`);
    }
    for (const asset of source.assets ?? []) {
      if (asset.attachmentStatus !== status)
        throw new Error(`${label} assets must stay ${status}.`);
      if (qaStatus && asset.qaStatus !== qaStatus)
        throw new Error(`${label} assets must retain ${qaStatus}.`);
    }
  }
  if (finalCandidates.assets?.length !== finalItemCount * 3) {
    throw new Error(`The final candidate package must stay ${finalItemCount * 3} assets.`);
  }
  if (
    JSON.stringify(finalCandidates.recordedTranscriptionExceptions) !==
    JSON.stringify(audioExceptions)
  ) {
    throw new Error(
      'The final candidate package must retain both recorded transcription exceptions.',
    );
  }

  if (
    finalManifest.contentIds?.length !== itemCount ||
    new Set(finalManifest.contentIds).size !== itemCount ||
    finalManifest.assets?.length !== assetCount
  ) {
    throw new Error(
      `The final media manifest must stay ${itemCount} canonical items and ${assetCount} selected assets.`,
    );
  }
  assertSameIdSet(
    finalManifest.contentIds,
    catalogSlice.draftedItemIds,
    'The final media manifest must still select the canonical item set.',
  );
  if (finalManifest.state === 'prepared_awaiting_private_upload') {
    // The manifest keeps its historical pre-upload lifecycle fields; they are
    // never restated as current upload truth inside the packet.
    if (finalManifest.publicationBlocked !== true || finalManifest.attachmentAllowed !== false) {
      throw new Error('The final media manifest must stay publication-blocked and unattached.');
    }
  }
}

export function buildStart35HumanReviewPacket(sources) {
  const { catalogSlice, drafts, pendingDrafts, finalManifest } = sources;
  assertSources(sources);

  const manifestAsset = (assetId) => {
    const asset = finalManifest.assets.find((candidate) => candidate.assetId === assetId);
    if (!asset) throw new Error(`${assetId} must be selected in the final media manifest.`);
    return asset;
  };
  const assetFor = (contentId, kind, version) => manifestAsset(`${contentId}-${kind}-${version}`);

  const originalIds = new Set(ids(drafts.items, 'id'));
  const ledgerItems = [...sources.provenanceLedger.items, ...sources.pendingProvenanceLedger.items];
  const ledgerByItem = new Map(ledgerItems.map((entry) => [entry.itemId, entry]));
  const draftById = new Map(
    [...drafts.items, ...pendingDrafts.items].map((draft) => [draft.id, draft]),
  );
  const exceptionItemIds = new Set(
    audioExceptions.map((id) => id.replace(/-(sentence|word)$/, '')),
  );

  const items = [...catalogSlice.draftedItemIds].sort().map((contentId, index) => {
    const draft = draftById.get(contentId);
    const ledger = ledgerByItem.get(contentId);
    const isOriginal = originalIds.has(contentId);
    const imageAsset = assetFor(contentId, 'image', isOriginal ? 'v2' : 'v1');
    const wordAsset = assetFor(contentId, 'word-audio', 'v1');
    const sentenceAsset = assetFor(contentId, 'sentence-audio', 'v1');
    const draftSource = isOriginal ? draftSourceNames.drafts : draftSourceNames.pendingDrafts;
    const mediaStageRecord = isOriginal
      ? 'passed_for_candidate_stage'
      : sources.pendingProvenanceLedger.candidateMedia.status;
    const itemExceptions = audioExceptions.filter((id) => id.startsWith(`${contentId}-`));
    const draftRef = `vocabulary/${draftSource}#${contentId}`;

    const check = (dimension, { status, candidateStageRecord, evidence: sources_, exceptions }) => {
      const entry = {
        status,
        candidateStageRecord,
        releaseOutcome: null,
        evidence: sources_,
      };
      if (exceptions?.length) entry.exceptions = exceptions;
      if (!checkStateIds.includes(status)) {
        throw new Error(`${dimension} has an unknown check state ${status}.`);
      }
      return entry;
    };

    const checks = {
      german_linguistic: check('german_linguistic', {
        status: 'owner_linguistic_approval_recorded',
        candidateStageRecord: 'approved_by_product_owner',
        evidence: [`${evidence.linguisticApproval}#${contentId}`, draftRef],
      }),
      persian_translation: check('persian_translation', {
        status: 'owner_linguistic_approval_recorded',
        candidateStageRecord: 'approved_by_product_owner',
        evidence: [`${evidence.linguisticApproval}#${contentId}`, draftRef],
      }),
      provenance: check('provenance', {
        status: 'candidate_stage_evidence_recorded',
        candidateStageRecord: isOriginal ? sources.candidateQa.checks.provenance.outcome : null,
        evidence: [
          `${isOriginal ? evidence.provenanceLedger : evidence.pendingProvenanceLedger}#${contentId}`,
          draftRef,
        ],
      }),
      visual: check('visual', {
        status: 'candidate_stage_evidence_recorded',
        candidateStageRecord: mediaStageRecord,
        evidence: isOriginal
          ? [
              `${evidence.mediaAttachment}#${contentId}-image-v1`,
              `${evidence.candidateQa}#visual`,
              `${evidence.v2CandidateQa}#visual`,
              `${evidence.finalManifest}#${imageAsset.assetId}`,
            ]
          : [
              `${evidence.pendingProvenanceLedger}#${contentId}`,
              `${evidence.finalCandidates}#${imageAsset.assetId}`,
              `${evidence.finalManifest}#${imageAsset.assetId}`,
            ],
      }),
      audio: check('audio', {
        status: 'candidate_stage_evidence_recorded',
        candidateStageRecord: mediaStageRecord,
        evidence: isOriginal
          ? [
              `${evidence.mediaAttachment}#${wordAsset.assetId}`,
              `${evidence.candidateQa}#audio`,
              `${evidence.v2CandidateQa}#audio`,
              `${evidence.finalManifest}#${wordAsset.assetId}`,
            ]
          : [
              `${evidence.pendingProvenanceLedger}#${contentId}`,
              `${evidence.finalCandidates}#${wordAsset.assetId}`,
              `${evidence.finalCandidates}#${sentenceAsset.assetId}`,
              `${evidence.finalManifest}#${sentenceAsset.assetId}`,
            ],
        exceptions: itemExceptions,
      }),
      // Release-level app flow is unproven for every item; candidate-stage flow
      // evidence is preserved only where a source actually records it.
      app_flow: check('app_flow', {
        status: 'pending_unproven',
        candidateStageRecord: isOriginal ? sources.candidateQa.checks.app_flow.outcome : null,
        evidence: isOriginal ? [`${evidence.candidateQa}#app_flow`] : [],
      }),
    };

    return {
      contentId,
      order: index + 1,
      catalogBatch: isOriginal ? 'original_vertical_slice' : 'final_catalog_pending',
      german: {
        lemma: draft.lemma,
        article: draft.article ?? null,
        partOfSpeech: draft.partOfSpeech,
        cefr: draft.cefr,
        essentialInflection: draft.essentialInflection ?? null,
        simpleGermanDefinition: draft.simpleGermanDefinition,
        example: draft.examples[0].german,
      },
      persian: {
        meanings: [...draft.persianMeanings],
        example: draft.examples[0].persian,
      },
      provenance: {
        evidenceType: ledger.evidenceType,
        evidencePages: [...ledger.evidencePages],
      },
      image: {
        selectedAssetId: imageAsset.assetId,
        assetVersion: imageAsset.assetVersion,
        expectedMimeType: imageAsset.expectedMimeType,
        visualConcept: draft.visualConcept,
        altText: `${draft.lemma} — ${draft.persianMeanings.join('، ')}: ${draft.simpleGermanDefinition}`,
      },
      versions: {
        draftVersion: draft.version,
        candidateCardVersion: 1,
        image: {
          assetId: imageAsset.assetId,
          assetVersion: imageAsset.assetVersion,
          storageKey: imageAsset.storageKey,
          supersededAssetId: isOriginal ? `${contentId}-image-v1` : null,
        },
        wordAudio: { assetId: wordAsset.assetId, assetVersion: wordAsset.assetVersion },
        sentenceAudio: { assetId: sentenceAsset.assetId, assetVersion: sentenceAsset.assetVersion },
      },
      checks,
      decision: { allowed: [...reviewDecisionIds], recorded: null },
    };
  });

  if (items.length !== itemCount) {
    throw new Error(`The packet must contain exactly ${itemCount} canonical items.`);
  }

  return {
    batchId: 'learnbox-start-a1-35-human-review-packet-v1',
    state: 'prepared_awaiting_owner_review',
    publicationBlocked: true,
    attachmentAllowed: false,
    seedable: false,
    learnerExposure: false,
    reviewDecisionRecorded: false,
    databaseMutationPerformed: false,
    providerCallPerformed: false,
    purpose:
      'One deterministic batched human-review packet for the 35 canonical LearnBox Start A1 items across the six canonical review dimensions. It restates final German and Persian text, provenance, selected image with alt text and rollback/version linkage, visual and audio candidate evidence, explicit previously recorded exceptions and an explicitly unproven release-level app flow. It records no check outcome and no approve/reject/return_for_revision decision, points only at repository-local evidence, and authorizes no attachment, database write, seed, flag, deployment or publication.',
    reviewDimensions: [...reviewDimensionIds],
    reviewVocabulary: {
      checkOutcomes: [...checkOutcomeIds],
      reviewDecisions: [...reviewDecisionIds],
      checkStates: [...checkStateIds],
      pendingReleaseOutcome: null,
    },
    reviewScope: {
      itemCount,
      dimensionCount,
      itemDimensionPairs: itemCount * dimensionCount,
      originalItemCount,
      finalItemCount,
    },
    dimensionsAwaitingReleaseReview: [...catalogSlice.stillRequiredBeforePublication],
    pendingReleaseGates: [...sources.pendingProvenanceLedger.remainingReleaseGates],
    releasePosition: {
      releaseApprovedItemCount: 0,
      releaseOutcomesRecorded: 0,
      releaseOutcomesPending: itemCount * dimensionCount,
      pendingDecisionCount: itemCount,
      seedDecision: 'blocked_until_every_dimension_passes_and_the_owner_approves',
    },
    candidateMediaEvidence: {
      originalV2Images: {
        assetCount: sources.v2Images.assets.length,
        qaStatus: 'candidate_qa_passed',
      },
      originalV1Audio: {
        assetCount: sources.mediaAttachment.assets.filter((asset) => asset.kind !== 'image').length,
        qaStatus: 'candidate_qa_passed',
      },
      finalCandidatePackage: {
        images: sources.pendingProvenanceLedger.candidateMedia.inventory.images,
        audio: sources.pendingProvenanceLedger.candidateMedia.inventory.audio,
        humanReviewApproved:
          sources.pendingProvenanceLedger.candidateMedia.inventory.humanReviewApproved,
        automatedTranscriptionMatches:
          sources.pendingProvenanceLedger.candidateMedia.transcriptionQa.exactMatches,
        automatedTranscriptionTotal:
          sources.pendingProvenanceLedger.candidateMedia.transcriptionQa.total,
      },
    },
    privateUploadBaseline: {
      selectedAssetCount: finalManifest.assets.length,
      completedOn: '2026-09-14',
      verification:
        'Every selected object passed an initial and a complete resume cache-disabled private-download byte-count and SHA-256 verification.',
      receiptInRepository: false,
      attachmentAllowed: false,
      finalManifestLifecycleFieldsAreCurrentTruth: false,
    },
    knownExceptions: audioExceptions.map((exceptionId) => ({
      exceptionId,
      itemId: exceptionId.replace(/-(sentence|word)$/, ''),
      dimension: 'audio',
      kind: 'automated_transcription_discrepancy',
      state: 'recorded_not_resolved',
      detail:
        'Automated transcription QA reached 28/30 exact normalized matches; this audio stays a recorded discrepancy that human listening approval neither removes nor converts into release approval.',
      evidence: [evidence.pendingProvenanceLedger, evidence.finalCandidates, evidence.readiness],
    })),
    unresolvedItemExceptions: [...exceptionItemIds].sort(),
    rollbackPlan: {
      reference: 'PDR-008',
      codeRevert:
        'Keep the Admin review runtime gate false to disable every review route and client composition.',
      evidencePreservation:
        'Rolling back route composition does not delete recorded review evidence; no candidate, check, decision or audit record is removed here.',
      destructiveDeletionRequiresSeparateAuthorization: true,
      supersededMedia:
        'The superseded V1 image of every original item is recorded per item and stays excluded from the selected media, so a media rollback target remains explicit.',
    },
    sourceDocuments: {
      catalogSlice: evidence.slice,
      originalDrafts: `vocabulary/${draftSourceNames.drafts}`,
      pendingDrafts: `vocabulary/${draftSourceNames.pendingDrafts}`,
      linguisticApproval: evidence.linguisticApproval,
      provenanceLedger: evidence.provenanceLedger,
      pendingProvenanceLedger: evidence.pendingProvenanceLedger,
      candidateQa: evidence.candidateQa,
      v2CandidateQa: evidence.v2CandidateQa,
      finalMediaManifest: evidence.finalManifest,
      releaseReadinessAudit: evidence.readiness,
      reviewPersistenceDecision: evidence.reviewPersistence,
      currentWork: evidence.currentWork,
    },
    items,
  };
}

export async function renderStart35HumanReviewPacket(packet) {
  return format(JSON.stringify(packet), {
    ...(await resolveConfig(packetUrl.pathname)),
    filepath: packetUrl.pathname,
  });
}

export async function loadStart35HumanReviewPacketSources() {
  const read = (name, directory = 'validation') =>
    readFile(new URL(`${directory}/${name}`, contentRoot), 'utf8').then(JSON.parse);
  const [
    catalogSlice,
    drafts,
    pendingDrafts,
    linguisticApproval,
    provenanceLedger,
    pendingProvenanceLedger,
    candidateQa,
    v2CandidateQa,
    mediaAttachment,
    v2Images,
    finalCandidates,
    finalManifest,
  ] = await Promise.all([
    read(sourceNames.catalogSlice),
    read(sourceNames.drafts, 'vocabulary'),
    read(sourceNames.pendingDrafts, 'vocabulary'),
    read(sourceNames.linguisticApproval),
    read(sourceNames.provenanceLedger),
    read(sourceNames.pendingProvenanceLedger),
    read(sourceNames.candidateQa),
    read(sourceNames.v2CandidateQa),
    read(sourceNames.mediaAttachment),
    read(sourceNames.v2Images),
    read(sourceNames.finalCandidates),
    read(sourceNames.finalManifest),
  ]);
  return {
    catalogSlice,
    drafts,
    pendingDrafts,
    linguisticApproval,
    provenanceLedger,
    pendingProvenanceLedger,
    candidateQa,
    v2CandidateQa,
    mediaAttachment,
    v2Images,
    finalCandidates,
    finalManifest,
  };
}

export async function runStart35HumanReviewPacketBuild({ write = false } = {}) {
  const packet = buildStart35HumanReviewPacket(await loadStart35HumanReviewPacketSources());
  const serialized = await renderStart35HumanReviewPacket(packet);

  if (write) {
    await writeFile(packetUrl, serialized);
    console.info(
      'LB-DS-076 human-review packet written for 35 items and six dimensions; no decision, attachment, database write, seed or flag change was performed.',
    );
  } else if ((await readFile(packetUrl, 'utf8')) !== serialized) {
    throw new Error(
      'LB-DS-076 human-review packet is stale. Run pnpm build:start-35-human-review-packet.',
    );
  } else {
    console.info('LB-DS-076 human-review packet is current and records no human decision.');
  }

  return packet;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runStart35HumanReviewPacketBuild({ write: process.argv.includes('--write') });
}
