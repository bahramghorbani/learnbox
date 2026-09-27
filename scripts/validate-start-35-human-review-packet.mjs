import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  altTextLanguages,
  altTextSourceSuffix,
  altTextStatus,
  cardVersionLinkageBasis,
  checkOutcomeIds,
  checkStateIds,
  draftSourceNames,
  evidenceScopeIds,
  finalVisualAudioEvidenceScope,
  loadStart35HumanReviewPacketSources,
  reviewDecisionIds,
  reviewDimensionIds,
  runStart35HumanReviewPacketBuild,
  visualConceptStatus,
} from './build-start-35-human-review-packet.mjs';

const root = process.cwd();
const contentRoot = 'content/packs/learnbox-start';
// Repository media directories and the extension each selected MIME type uses.
// Used to prove the packet's repositoryLocalMedia claim against real files.
const mediaExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'audio/mpeg': '.mp3' };

// Packet contents must never carry a provider locator, private URL, media digest,
// byte count, receipt, credential or runtime identifier into Git.
const forbiddenFields = [
  'url',
  'uri',
  'href',
  'path',
  'pathname',
  'relativePath',
  'file',
  'filename',
  'sha256',
  'sha1',
  'md5',
  'checksum',
  'hash',
  'digest',
  'bytes',
  'byteCount',
  'size',
  'provider',
  'providerId',
  'objectId',
  'objectUrl',
  'locator',
  'credential',
  'secret',
  'token',
  'apiKey',
  'receipt',
  'receiptPayload',
  'attachmentId',
  'uploadId',
  'storageUrl',
  'signedUrl',
  'approvedForRelease',
  'releaseApproval',
  'reviewerUserId',
  'reviewedAt',
  'reviewedBy',
  'databaseRowId',
  'seedId',
  'flag',
  'publishedAt',
  'publishedVersion',
  'decisionId',
];
const forbiddenValues = [
  [/https?:\/\//, 'a remote URL; only local evidence references are allowed'],
  [/\b[0-9a-f]{32,}\b/i, 'a digest-like hash'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'a runtime row identifier'],
];
const localEvidencePattern =
  /^(validation\/[\w.-]+\.json|vocabulary\/[\w.-]+\.json|docs\/[\w./-]+\.md|CURRENT_WORK\.md|content\/[\w./-]+\.json)(#[\w.-]+)?$/;

const enumerated = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);

async function loadCanonicalVocabulary() {
  const [migration, store] = await Promise.all([
    readFile(resolve(root, 'database/migrations/0006_content_review_quality_gates.sql'), 'utf8'),
    readFile(resolve(root, 'apps/admin/lib/server/postgres-content-review-store.ts'), 'utf8'),
  ]);
  const dimensionEnum = migration.match(
    /CREATE TYPE content_review_dimension AS ENUM \(([\s\S]*?)\);/,
  );
  const outcomeEnum = migration.match(/CREATE TYPE content_review_outcome AS ENUM \(([^)]*)\);/);
  const adminDimensions = store.match(
    /export const contentReviewDimensions = \[([\s\S]*?)\] as const;/,
  );
  const adminActions = store.match(/export type ContentReviewAction = ([^;]+);/);
  if (!dimensionEnum || !outcomeEnum || !adminDimensions || !adminActions) {
    throw new Error('The canonical review dimension, outcome or decision vocabulary is missing.');
  }
  return {
    dimensions: enumerated(dimensionEnum[1]),
    outcomes: enumerated(outcomeEnum[1]),
    adminDimensions: enumerated(adminDimensions[1]),
    reviewDecisions: enumerated(adminActions[1]),
  };
}

const sameSet = (left, right) =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);

// Only the original slice has per-item repository-local media; the final 15 are
// batch-aggregate only and release-level app flow is unproven for every item.
const expectedEvidenceScope = (dimension, isOriginal) => {
  if (dimension === 'app_flow') return 'unproven_at_release_level';
  if ((dimension === 'visual' || dimension === 'audio') && !isOriginal) {
    return finalVisualAudioEvidenceScope;
  }
  return 'repository_local_per_item';
};

function guardForbidden(packet) {
  const guard = (value, trail) => {
    if (typeof value === 'string') {
      for (const [pattern, description] of forbiddenValues) {
        if (pattern.test(value)) throw new Error(`${trail} must not contain ${description}.`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => guard(entry, `${trail}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (forbiddenFields.includes(key)) {
          throw new Error(`${trail}.${key} is a forbidden ${key} field for this packet.`);
        }
        guard(entry, `${trail}.${key}`);
      }
    }
  };
  guard(packet, 'packet');
}

async function assertEvidenceRefs(references) {
  for (const reference of references) {
    if (!localEvidencePattern.test(reference)) {
      throw new Error(`Evidence ${reference} must be a repository-local evidence reference.`);
    }
    const [relativePath, anchor] = reference.split('#');
    const absolute = /^(validation|vocabulary)\//.test(relativePath)
      ? resolve(root, contentRoot, relativePath)
      : resolve(root, relativePath);
    let text;
    try {
      text = await readFile(absolute, 'utf8');
    } catch {
      throw new Error(`Evidence ${reference} must resolve to a local file that exists.`);
    }
    if (anchor && !text.includes(anchor)) {
      throw new Error(`Evidence ${reference} must resolve to its anchor inside the local file.`);
    }
  }
}

export async function assertStart35HumanReviewPacket(packet, sources) {
  for (const [key, expected] of Object.entries({
    batchId: 'learnbox-start-a1-35-human-review-packet-v1',
    state: 'prepared_awaiting_owner_review',
    publicationBlocked: true,
    attachmentAllowed: false,
    seedable: false,
    learnerExposure: false,
    reviewDecisionRecorded: false,
    databaseMutationPerformed: false,
    providerCallPerformed: false,
  })) {
    if (packet[key] !== expected) {
      throw new Error(
        `The packet must stay default-off, decision-free and publication-blocked: ${key} must be ${expected}.`,
      );
    }
  }
  if (
    packet.reviewDecisionRecorded !== false ||
    packet.items.some((item) => item.decision?.recorded !== null)
  ) {
    throw new Error('No human decision may be recorded in this packet.');
  }

  guardForbidden(packet);

  // The packet must state the limits of its own claims in one place.
  const limits = packet.transparencyLimits ?? {};
  for (const [key, expected] of Object.entries({
    altTextStatus,
    altTextSourceBasis: `committed_draft_fields_${altTextSourceSuffix}`,
    visualConceptStatus,
    databaseRowsVerified: false,
    cardVersionLinkageBasis,
    finalVisualAudioEvidenceScope,
    humanMediaReviewStillRequired: true,
  })) {
    if (limits[key] !== expected) {
      throw new Error(
        `The packet transparency limits must stay truthful: transparencyLimits.${key} must be ${expected}.`,
      );
    }
  }
  if (
    !sameSet(limits.altTextLanguages ?? [], altTextLanguages) ||
    !sameSet(limits.evidenceScopeIds ?? [], evidenceScopeIds)
  ) {
    throw new Error(
      'The packet transparency limits must restate the truthful alt-text languages and evidence scopes.',
    );
  }

  const vocabulary = await loadCanonicalVocabulary();
  if (
    !sameSet(packet.reviewDimensions, vocabulary.dimensions) ||
    !sameSet(packet.reviewDimensions, reviewDimensionIds) ||
    packet.reviewDimensions.length !== 6
  ) {
    throw new Error('The packet must carry exactly the six canonical review-dimension IDs.');
  }
  if (
    !sameSet(packet.reviewVocabulary.checkOutcomes, checkOutcomeIds) ||
    !sameSet(
      packet.reviewVocabulary.checkOutcomes,
      vocabulary.outcomes.filter((id) => id !== 'pending'),
    ) ||
    !sameSet(packet.reviewVocabulary.reviewDecisions, reviewDecisionIds) ||
    !sameSet(packet.reviewVocabulary.reviewDecisions, vocabulary.reviewDecisions) ||
    !sameSet(vocabulary.adminDimensions, vocabulary.dimensions) ||
    packet.reviewVocabulary.pendingReleaseOutcome !== null
  ) {
    throw new Error(
      'The packet check-outcome vocabulary must equal passed/failed and its review-decision vocabulary must equal the canonical Admin actions.',
    );
  }

  const canonicalIds = [...sources.catalogSlice.draftedItemIds];
  if (
    packet.items.length !== 35 ||
    !sameSet(
      packet.items.map((item) => item.contentId),
      canonicalIds,
    )
  ) {
    throw new Error(
      'The packet must contain exactly 35 items and set-equal the canonical catalog slice.',
    );
  }
  const originalIds = new Set(sources.drafts.items.map((draft) => draft.id));
  const draftById = new Map(
    [...sources.drafts.items, ...sources.pendingDrafts.items].map((draft) => [draft.id, draft]),
  );
  const manifestAssets = sources.finalManifest.assets ?? [];
  const evidenceRefs = new Set(Object.values(packet.sourceDocuments ?? {}));

  for (const [index, item] of packet.items.entries()) {
    const id = item.contentId;
    if (item.order !== index + 1) throw new Error(`${id} order must stay deterministic.`);
    const isOriginal = originalIds.has(id);
    if (item.catalogBatch !== (isOriginal ? 'original_vertical_slice' : 'final_catalog_pending')) {
      throw new Error(`${id} carries a wrong catalog batch.`);
    }
    if (
      Object.keys(item.checks ?? {}).length !== 6 ||
      !sameSet(Object.keys(item.checks), vocabulary.dimensions)
    ) {
      throw new Error(`${id} must carry exactly the six canonical review dimensions.`);
    }
    if (
      Object.keys(item.checks).some(
        (dimension, index) => dimension !== packet.reviewDimensions[index],
      )
    ) {
      throw new Error(`${id} dimension ordering must stay deterministic.`);
    }

    for (const dimension of packet.reviewDimensions) {
      const check = item.checks[dimension];
      if (!checkStateIds.includes(check.status)) {
        throw new Error(`${id} ${dimension} has an unknown check state.`);
      }
      if (check.releaseOutcome !== null) {
        throw new Error(
          `${id} ${dimension} must not record a release-level outcome; only passed/failed may ever be recorded later.`,
        );
      }
      if (
        !evidenceScopeIds.includes(check.evidenceScope) ||
        check.evidenceScope !== expectedEvidenceScope(dimension, isOriginal)
      ) {
        throw new Error(
          `${id} ${dimension} must state a truthful evidence scope instead of implying per-item in-repository proof.`,
        );
      }
      if (
        check.candidateStageRecord !== null &&
        ![
          'approved_by_product_owner',
          'passed_for_candidate_stage',
          'private_candidate_package_human_reviewed',
        ].includes(check.candidateStageRecord)
      ) {
        throw new Error(`${id} ${dimension} carries an unsupported candidate-stage record.`);
      }
      if (!Array.isArray(check.evidence)) {
        throw new Error(`${id} ${dimension} must list its source-local evidence.`);
      }
      for (const reference of check.evidence) await assertEvidenceRefs([reference]);
      for (const reference of check.evidence) evidenceRefs.add(reference);
      if (check.exceptions) {
        for (const exceptionId of check.exceptions) {
          if (!packet.knownExceptions.some((entry) => entry.exceptionId === exceptionId)) {
            throw new Error(`${id} ${dimension} references an unknown exception ${exceptionId}.`);
          }
        }
      }
    }

    if (item.checks.app_flow.status !== 'pending_unproven') {
      throw new Error(`${id} app_flow must stay pending/unproven at release level.`);
    }
    if (
      item.checks.app_flow.candidateStageRecord !==
      (isOriginal ? 'passed_for_candidate_stage' : null)
    ) {
      throw new Error(`${id} app_flow must preserve only evidence a source actually records.`);
    }
    for (const dimension of ['german_linguistic', 'persian_translation']) {
      if (
        item.checks[dimension].status !== 'owner_linguistic_approval_recorded' ||
        item.checks[dimension].candidateStageRecord !== 'approved_by_product_owner'
      ) {
        throw new Error(`${id} ${dimension} must preserve the recorded product-owner approval.`);
      }
    }
    for (const dimension of packet.dimensionsAwaitingReleaseReview) {
      if (item.checks[dimension].status === 'owner_linguistic_approval_recorded') {
        throw new Error(`${id} ${dimension} must not claim an owner approval it does not have.`);
      }
    }
    if (!sameSet(item.decision.allowed, reviewDecisionIds) || item.decision.recorded !== null) {
      throw new Error(
        `${id} decision must offer approve/reject/return_for_revision and record none.`,
      );
    }

    const draft = draftById.get(id);
    if (!draft) throw new Error(`${id} must exist in the canonical draft sources.`);
    if (
      item.german.lemma !== draft.lemma ||
      item.german.article !== (draft.article ?? null) ||
      item.german.simpleGermanDefinition !== draft.simpleGermanDefinition ||
      item.german.example !== draft.examples[0].german ||
      item.persian.example !== draft.examples[0].persian ||
      !sameSet(item.persian.meanings, draft.persianMeanings)
    ) {
      throw new Error(`${id} must restate the final German and Persian draft text.`);
    }
    const expectedAlt = `${draft.lemma} — ${draft.persianMeanings.join('، ')}: ${draft.simpleGermanDefinition}`;
    if (item.image.altText !== expectedAlt || item.image.altText.trim().length === 0) {
      throw new Error(`${id} must carry the deterministic selected-image alt text.`);
    }
    const draftRef = `vocabulary/${
      isOriginal ? draftSourceNames.drafts : draftSourceNames.pendingDrafts
    }#${id}`;
    if (
      item.image.altTextStatus !== altTextStatus ||
      item.image.altTextSource !== `${draftRef}:${altTextSourceSuffix}` ||
      !sameSet(item.image.altTextLanguages, altTextLanguages) ||
      item.image.altTextLocale !== draft.pronunciation.locale
    ) {
      throw new Error(
        `${id} must state its alt text as derived, unreviewed and truthfully sourced from the committed draft fields.`,
      );
    }
    if (
      item.image.visualConcept !== draft.visualConcept ||
      item.image.visualConceptSource !== draftRef ||
      item.image.visualConceptStatus !== visualConceptStatus
    ) {
      throw new Error(
        `${id} must label its visual concept as draft intent rather than a verified image depiction.`,
      );
    }
    if (
      item.versions.databaseRowsVerified !== false ||
      item.versions.linkageBasis !== cardVersionLinkageBasis
    ) {
      throw new Error(
        `${id} must state repository/migration card-version linkage rather than verified database rows.`,
      );
    }
    for (const [label, asset] of [
      ['image', item.image],
      ['versions.image', item.versions.image],
      ['versions.wordAudio', item.versions.wordAudio],
      ['versions.sentenceAudio', item.versions.sentenceAudio],
    ]) {
      if (asset.repositoryLocalMedia !== isOriginal) {
        throw new Error(`${id} ${label} must state repositoryLocalMedia=${isOriginal}.`);
      }
    }
    for (const [label, assetId, mimeType] of [
      ['image', item.image.selectedAssetId, item.image.expectedMimeType],
      ['wordAudio', item.versions.wordAudio.assetId, 'audio/mpeg'],
      ['sentenceAudio', item.versions.sentenceAudio.assetId, 'audio/mpeg'],
    ]) {
      const extension = mediaExtensions[mimeType];
      if (!extension) {
        throw new Error(`${id} ${label} carries an unsupported MIME type ${mimeType}.`);
      }
      const directory = mimeType.startsWith('image/') ? 'images' : 'audio';
      const present = existsSync(resolve(root, contentRoot, directory, `${assetId}${extension}`));
      if (present !== isOriginal) {
        throw new Error(
          `${id} ${label} must keep repositoryLocalMedia truthful toward the media files actually in this repository.`,
        );
      }
    }

    const selectedImage = manifestAssets.find(
      (asset) => asset.assetId === item.image.selectedAssetId,
    );
    if (!selectedImage || selectedImage.contentId !== id || selectedImage.kind !== 'image') {
      throw new Error(`${id} must select an image recorded in the final media manifest.`);
    }
    if (item.image.assetVersion !== selectedImage.assetVersion) {
      throw new Error(`${id} image version linkage must match the final media manifest.`);
    }
    for (const [kind, audio] of [
      ['word_audio', item.versions.wordAudio],
      ['sentence_audio', item.versions.sentenceAudio],
    ]) {
      const asset = manifestAssets.find((candidate) => candidate.assetId === audio.assetId);
      if (!asset || asset.contentId !== id || asset.kind !== kind) {
        throw new Error(`${id} ${kind} version linkage must match the final media manifest.`);
      }
    }
    if (item.versions.draftVersion !== draft.version || item.versions.candidateCardVersion !== 1) {
      throw new Error(`${id} rollback linkage must retain draft and candidate version 1.`);
    }
    const expectedSuperseded = isOriginal ? `${id}-image-v1` : null;
    if (item.versions.image.supersededAssetId !== expectedSuperseded) {
      throw new Error(`${id} superseded media linkage must match the V1/V2 selection history.`);
    }
    if (
      expectedSuperseded &&
      manifestAssets.some((asset) => asset.assetId === expectedSuperseded)
    ) {
      throw new Error(`${id} must not select the superseded V1 image.`);
    }
  }

  const scope = packet.reviewScope;
  if (
    scope.itemCount !== 35 ||
    scope.dimensionCount !== 6 ||
    scope.itemDimensionPairs !== 210 ||
    scope.originalItemCount !== 20 ||
    scope.finalItemCount !== 15
  ) {
    throw new Error('The packet review scope must stay 35 items, six dimensions and 210 pairs.');
  }
  if (
    packet.releasePosition.releaseApprovedItemCount !== 0 ||
    packet.releasePosition.releaseOutcomesRecorded !== 0 ||
    packet.releasePosition.releaseOutcomesPending !== 210 ||
    packet.releasePosition.pendingDecisionCount !== 35
  ) {
    throw new Error(
      'The packet must record zero release-level outcomes and 210 pending release checks.',
    );
  }
  if (
    !sameSet(
      packet.dimensionsAwaitingReleaseReview,
      sources.catalogSlice.stillRequiredBeforePublication,
    )
  ) {
    throw new Error('The packet must restate every dimension still awaiting release review.');
  }
  if (
    !sameSet(packet.pendingReleaseGates, sources.pendingProvenanceLedger.remainingReleaseGates) ||
    !sameSet(packet.pendingReleaseGates, sources.provenanceLedger.remainingReleaseGates)
  ) {
    throw new Error('The packet must restate the recorded remaining release gates.');
  }
  if (
    packet.privateUploadBaseline.selectedAssetCount !== sources.finalManifest.assets.length ||
    packet.privateUploadBaseline.receiptInRepository !== false ||
    packet.privateUploadBaseline.attachmentAllowed !== false ||
    packet.privateUploadBaseline.finalManifestLifecycleFieldsAreCurrentTruth !== false
  ) {
    throw new Error(
      'The packet must stay on the post-upload baseline without restating the manifest pre-upload lifecycle fields as current truth.',
    );
  }
  if (
    packet.candidateMediaEvidence.finalCandidatePackage.humanReviewApproved !==
      sources.pendingProvenanceLedger.candidateMedia.inventory.humanReviewApproved ||
    packet.candidateMediaEvidence.finalCandidatePackage.automatedTranscriptionMatches !==
      sources.pendingProvenanceLedger.candidateMedia.transcriptionQa.exactMatches
  ) {
    throw new Error('The packet must restate the recorded candidate-media evidence counts.');
  }
  if (
    !sameSet(
      packet.knownExceptions.map((entry) => entry.exceptionId),
      sources.finalCandidates.recordedTranscriptionExceptions,
    )
  ) {
    throw new Error('The packet must represent every recorded exception explicitly.');
  }
  for (const exception of packet.knownExceptions) {
    if (exception.state !== 'recorded_not_resolved' || exception.dimension !== 'audio') {
      throw new Error(`${exception.exceptionId} must stay a recorded, unresolved exception.`);
    }
    if (!exception.detail.includes('28/30')) {
      throw new Error(`${exception.exceptionId} must keep its recorded transcription evidence.`);
    }
    await assertEvidenceRefs(exception.evidence);
  }
  if (packet.rollbackPlan.reference !== 'PDR-008' || !packet.rollbackPlan.evidencePreservation) {
    throw new Error('The packet must keep its recorded rollback linkage.');
  }

  for (const reference of evidenceRefs) await assertEvidenceRefs([reference]);
  for (const reference of Object.values(packet.sourceDocuments))
    await assertEvidenceRefs([reference]);

  return packet;
}

export async function validateStart35HumanReviewPacket() {
  const packet = await runStart35HumanReviewPacketBuild({ write: false });
  const sources = await loadStart35HumanReviewPacketSources();
  await assertStart35HumanReviewPacket(packet, sources);
  console.info('START_35_HUMAN_REVIEW_PACKET_OK items=35 dimensions=6 decisions=0');
  return packet;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35HumanReviewPacket();
}
