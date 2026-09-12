import { format, resolveConfig } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const v2ImagesUrl = new URL('validation/start-a1-v2-image-attachment-draft.json', contentRoot);
const v1MediaUrl = new URL('validation/start-a1-media-attachment-draft.json', contentRoot);
const finalCandidatesUrl = new URL(
  'validation/start-a1-15-candidate-media-attachment-draft.json',
  contentRoot,
);
const catalogSliceUrl = new URL('validation/start-a1-35-catalog-slice.json', contentRoot);
const manifestUrl = new URL('validation/start-a1-35-final-media-manifest.json', contentRoot);

const itemCount = 35;
const assetCount = 105;
const originalItemCount = 20;
const finalItemCount = 15;
const audioCount = 40;
const kindOrder = ['image', 'word_audio', 'sentence_audio'];
// Expected kinds and MIME types only. No private path, byte count, checksum or
// delivery URL is copied into the repository from the source drafts.
const expectedMimeTypes = {
  image: { v2: 'image/png', v1: 'image/jpeg' },
  word_audio: { v1: 'audio/mpeg' },
  sentence_audio: { v1: 'audio/mpeg' },
};

const uniqueSortedIds = (assets) => [...new Set(assets.map((asset) => asset.contentId))].sort();
const sameIds = (left, right) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

function assertSameIdSet(left, right, message) {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  if (!sameIds(leftSorted, rightSorted)) throw new Error(message);
}

function assertSourceAssets(assets, { status, qaStatus, label }) {
  for (const asset of assets) {
    if (asset.attachmentStatus !== status) {
      throw new Error(`${label} assets must stay ${status}.`);
    }
    if (qaStatus && asset.qaStatus !== qaStatus) {
      throw new Error(`${label} assets must retain ${qaStatus}.`);
    }
  }
}

export function buildStart35FinalMediaManifest({
  v2Images,
  v1Media,
  finalCandidates,
  catalogSlice,
}) {
  if (
    v2Images.state !== 'ready_for_private_storage_not_attached' ||
    v2Images.publicationBlocked !== true
  ) {
    throw new Error('The V2 image generation must stay unattached and publication-blocked.');
  }
  if (v2Images.assets?.length !== originalItemCount) {
    throw new Error(
      `The V2 image generation must describe exactly ${originalItemCount} images for the original items.`,
    );
  }
  if (v2Images.assets.some((asset) => asset.kind !== 'image')) {
    throw new Error('The V2 image generation must contain images only.');
  }
  assertSourceAssets(v2Images.assets, {
    status: 'awaiting_private_storage_url',
    qaStatus: 'candidate_qa_passed',
    label: 'V2 image generation',
  });

  if (
    v1Media.state !== 'ready_for_private_storage_not_attached' ||
    v1Media.publicationBlocked !== true
  ) {
    throw new Error('The V1 media generation must stay unattached and publication-blocked.');
  }

  const supersededImageAssetIds = [...v1Media.assets.filter((asset) => asset.kind === 'image')]
    .map((asset) => asset.assetId)
    .sort();
  const v1AudioAssets = v1Media.assets.filter((asset) => asset.kind !== 'image');
  if (
    v1Media.assets.length !== originalItemCount + audioCount ||
    supersededImageAssetIds.length !== originalItemCount ||
    v1AudioAssets.length !== audioCount
  ) {
    throw new Error(
      `The V1 media generation must describe exactly ${originalItemCount + audioCount} assets (${originalItemCount} images and ${audioCount} audio).`,
    );
  }
  assertSourceAssets(v1Media.assets, {
    status: 'awaiting_private_storage_url',
    qaStatus: 'candidate_qa_passed',
    label: 'V1 media generation',
  });

  if (
    finalCandidates.state !== 'prepared_awaiting_private_upload' ||
    finalCandidates.publicationBlocked !== true ||
    finalCandidates.attachmentAllowed !== false ||
    finalCandidates.uploadPerformed !== false ||
    finalCandidates.urlsIncluded !== false ||
    finalCandidates.privatePackageInRepo !== false ||
    finalCandidates.learnerExposure !== false
  ) {
    throw new Error(
      'The final candidate package must stay default-off, upload-free and publication-blocked.',
    );
  }
  if (finalCandidates.assets?.length !== finalItemCount * kindOrder.length) {
    throw new Error(
      `The final candidate package must describe exactly ${finalItemCount * kindOrder.length} assets.`,
    );
  }
  assertSourceAssets(finalCandidates.assets, {
    status: 'awaiting_private_upload',
    label: 'Final candidate package',
  });
  if (catalogSlice.publicationBlocked !== true || catalogSlice.seedDecision?.seedable !== false) {
    throw new Error('The catalog slice must stay publication-blocked and non-seedable.');
  }
  if (
    JSON.stringify(finalCandidates.recordedTranscriptionExceptions) !==
    JSON.stringify(['start-a1-essen-sentence', 'start-a1-gross-word'])
  ) {
    throw new Error('The final candidate package must retain both transcription exceptions.');
  }

  const originalIds = uniqueSortedIds(v2Images.assets);
  const audioIds = uniqueSortedIds(v1AudioAssets);
  const finalIds = uniqueSortedIds(finalCandidates.assets);
  if (originalIds.length !== originalItemCount || v1AudioAssets.length !== audioCount) {
    throw new Error(
      `The original image and audio contentId set must stay ${originalItemCount} unique items.`,
    );
  }
  if (
    finalIds.length !== finalItemCount ||
    finalCandidates.assets.length !== finalItemCount * kindOrder.length
  ) {
    throw new Error(`The final candidate contentId set must stay ${finalItemCount} unique items.`);
  }

  assertSameIdSet(
    audioIds,
    originalIds,
    'The original image and word/sentence audio contentId sets must agree exactly.',
  );
  assertSameIdSet(
    finalIds,
    catalogSlice.pendingDraftedItemIds,
    'The final candidate contentId set must equal the catalog slice pendingDraftedItemIds set.',
  );

  const canonicalIds = [...new Set([...originalIds, ...finalIds])];
  if (
    canonicalIds.length !== itemCount ||
    originalIds.length + finalIds.length !== itemCount ||
    catalogSlice.draftedItemIds?.length !== itemCount
  ) {
    throw new Error(
      `The final manifest must select exactly ${itemCount} canonical contentIds (${originalItemCount} original plus ${finalItemCount} final).`,
    );
  }
  assertSameIdSet(
    canonicalIds,
    catalogSlice.draftedItemIds,
    'The final manifest contentId set must equal the catalog slice draftedItemIds set.',
  );

  const toManifestAsset = (asset, assetVersion, mimeType) => {
    const expectedMimeType = expectedMimeTypes[asset.kind]?.[assetVersion];
    if (!expectedMimeType || mimeType !== expectedMimeType) {
      throw new Error(
        `${asset.assetId ?? 'source asset'} must stay ${asset.kind} ${assetVersion} as ${expectedMimeType}.`,
      );
    }
    return {
      assetId: asset.assetId,
      contentId: asset.contentId,
      kind: asset.kind,
      assetVersion,
      storageKey: asset.storageKey,
      expectedMimeType,
      attachmentStatus: asset.attachmentStatus,
    };
  };

  const assets = [
    // The original 20 items take the current V2 image; every V1 image is superseded.
    ...v2Images.assets.map((asset) => toManifestAsset(asset, 'v2', asset.localCandidate?.mimeType)),
    ...v1AudioAssets.map((asset) => toManifestAsset(asset, 'v1', asset.localCandidate?.mimeType)),
    ...finalCandidates.assets.map((asset) => toManifestAsset(asset, 'v1', asset.expectedMimeType)),
  ].sort((left, right) => {
    if (left.contentId !== right.contentId) return left.contentId < right.contentId ? -1 : 1;
    return kindOrder.indexOf(left.kind) - kindOrder.indexOf(right.kind);
  });

  if (assets.length !== assetCount) {
    throw new Error(`The final manifest must select exactly ${assetCount} assets.`);
  }
  if (new Set(assets.map((asset) => asset.assetId)).size !== assetCount) {
    throw new Error('The final manifest must not repeat an asset.');
  }

  return {
    batchId: 'learnbox-start-a1-35-final-media-v1',
    state: 'prepared_awaiting_private_upload',
    publicationBlocked: true,
    attachmentAllowed: false,
    uploadPerformed: false,
    urlsIncluded: false,
    privatePackageInRepo: false,
    learnerExposure: false,
    purpose:
      'Default-off final selection record for all 35 starter items and 105 assets: the current V2 image for each original 20-item entry, the unchanged V1 word and sentence audio, and the complete 45-asset final 15-item package. It declares expected kinds and MIME types only: no provider identifier, private locator, relative path, byte count, checksum or delivery URL is copied into the repository, and nothing is uploaded, attached, seeded or exposed.',
    sourceReferences: {
      originalV2Images: 'validation/start-a1-v2-image-attachment-draft.json',
      originalV1Audio: 'validation/start-a1-media-attachment-draft.json',
      finalCandidatePackage: 'validation/start-a1-15-candidate-media-attachment-draft.json',
      catalogSlice: 'validation/start-a1-35-catalog-slice.json',
    },
    selection: {
      itemCount,
      assetCount,
      originalItemCount,
      finalItemCount,
      supersededImagesExcluded: supersededImageAssetIds.length,
      supersededImageAssetIds,
      countsByKind: { image: 35, word_audio: 35, sentence_audio: 35 },
      versionsByKind: {
        image: { v2: 20, v1: 15 },
        word_audio: { v1: 35 },
        sentence_audio: { v1: 35 },
      },
    },
    requiredBeforeUpload: [
      'owner-approved-isolated-private-storage-target',
      'private_package_checksum_match',
    ],
    recordedTranscriptionExceptions: [...finalCandidates.recordedTranscriptionExceptions],
    contentIds: [...canonicalIds].sort(),
    assets,
  };
}

export async function validateStart35FinalMediaManifest({ write = false } = {}) {
  const [v2Images, v1Media, finalCandidates, catalogSlice] = await Promise.all(
    [v2ImagesUrl, v1MediaUrl, finalCandidatesUrl, catalogSliceUrl].map((url) =>
      readFile(url, 'utf8').then(JSON.parse),
    ),
  );
  const manifest = buildStart35FinalMediaManifest({
    v2Images,
    v1Media,
    finalCandidates,
    catalogSlice,
  });
  const serialized = await format(JSON.stringify(manifest), {
    ...(await resolveConfig(manifestUrl.pathname)),
    filepath: manifestUrl.pathname,
  });

  if (write) {
    await writeFile(manifestUrl, serialized);
    console.info(
      'LB-DS-069 final 35-item/105-asset media manifest written; no upload, attachment, seed or flag change was performed.',
    );
  } else if ((await readFile(manifestUrl, 'utf8')) !== serialized) {
    throw new Error(
      'LB-DS-069 final media manifest is stale. Run pnpm build:start-35-final-media-manifest.',
    );
  } else {
    console.info(
      'LB-DS-069 final media manifest is current and remains upload-free and unpublished.',
    );
  }

  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35FinalMediaManifest({ write: process.argv.includes('--write') });
}
