import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildStart35FinalMediaManifest } from './build-start-35-final-media-manifest.mjs';

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
const kindCounts = { image: 35, word_audio: 35, sentence_audio: 35 };
const kindDirectory = {
  image: 'image',
  word_audio: 'word_audio',
  sentence_audio: 'sentence_audio',
};
const currentImageVersion = 'v2';
const supersededImageVersion = 'v1';
const expectedImageVersions = { v2: 20, v1: 15 };
const defaultOffFlags = {
  publicationBlocked: true,
  attachmentAllowed: false,
  uploadPerformed: false,
  urlsIncluded: false,
  privatePackageInRepo: false,
  learnerExposure: false,
};
const allowedStatuses = new Set(['awaiting_private_storage_url', 'awaiting_private_upload']);
// A selection record must never carry provider identifiers, private locations,
// copied private metadata or any release-approval claim.
const forbiddenFields = [
  'url',
  'href',
  'pathname',
  'path',
  'relativePath',
  'file',
  'sha256',
  'checksum',
  'hash',
  'bytes',
  'size',
  'provider',
  'providerId',
  'objectUrl',
  'locator',
  'releaseApproval',
  'approvedForRelease',
];

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

export function assertStart35FinalMediaManifest(manifest) {
  if (manifest.state !== 'prepared_awaiting_private_upload') {
    throw new Error(
      'The final manifest must stay default-off and upload-free: state must be prepared_awaiting_private_upload.',
    );
  }
  const flagsIntact = Object.entries(defaultOffFlags).every(
    ([key, value]) => manifest[key] === value,
  );
  if (!flagsIntact) {
    throw new Error(
      'The final manifest must stay default-off, upload-free and publication-blocked (publicationBlocked=true, attachmentAllowed=false, uploadPerformed=false, urlsIncluded=false, privatePackageInRepo=false, learnerExposure=false).',
    );
  }

  const keys = new Set(collectKeys(manifest));
  for (const field of forbiddenFields) {
    if (keys.has(field)) {
      throw new Error(`The final manifest must not contain the forbidden field ${field}.`);
    }
  }

  if (
    JSON.stringify(manifest.recordedTranscriptionExceptions) !==
    JSON.stringify(['start-a1-essen-sentence', 'start-a1-gross-word'])
  ) {
    throw new Error('The final manifest must retain both recorded transcription exceptions.');
  }

  if (!Array.isArray(manifest.contentIds) || manifest.contentIds.length !== itemCount) {
    throw new Error(`The final manifest must select exactly ${itemCount} canonical contentIds.`);
  }
  if (new Set(manifest.contentIds).size !== itemCount) {
    throw new Error('The final manifest contentIds must be unique.');
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length !== assetCount) {
    throw new Error(`The final manifest must select exactly ${assetCount} assets.`);
  }
  if (new Set(manifest.assets.map((asset) => asset.assetId)).size !== assetCount) {
    throw new Error('The final manifest must not repeat an asset.');
  }

  const selected = new Set(manifest.contentIds);
  for (const asset of manifest.assets) {
    if (!selected.has(asset.contentId)) {
      throw new Error(`${asset.assetId} names a contentId outside the canonical selection.`);
    }
    if (!(asset.kind in kindDirectory)) {
      throw new Error(`${asset.assetId} has an unexpected asset kind ${asset.kind}.`);
    }
    if (asset.assetVersion !== 'v1' && asset.assetVersion !== 'v2') {
      throw new Error(`${asset.assetId} has an unexpected asset version.`);
    }
    if (
      asset.storageKey !== `${asset.contentId}/${kindDirectory[asset.kind]}/${asset.assetVersion}`
    ) {
      throw new Error(`${asset.assetId} has an unexpected storage key.`);
    }
    if (!allowedStatuses.has(asset.attachmentStatus)) {
      throw new Error(
        `${asset.assetId} must record an awaiting_ status, not ${asset.attachmentStatus}.`,
      );
    }
  }

  const assetsOf = (contentId, kind) =>
    manifest.assets.filter((asset) => asset.contentId === contentId && asset.kind === kind);

  for (const contentId of manifest.contentIds) {
    for (const kind of Object.keys(kindCounts)) {
      const assets = assetsOf(contentId, kind);
      if (assets.length !== 1) {
        throw new Error(`${contentId} must select exactly one ${kind} asset.`);
      }
    }
  }

  for (const [kind, expectedCount] of Object.entries(kindCounts)) {
    const assets = manifest.assets.filter((asset) => asset.kind === kind);
    if (assets.length !== expectedCount) {
      throw new Error(`The final manifest must select exactly ${expectedCount} ${kind} assets.`);
    }
    if (kind !== 'image' && assets.some((asset) => asset.assetVersion !== 'v1')) {
      throw new Error(`Every ${kind} asset must stay on the unchanged V1 generation.`);
    }
  }

  const imageVersions = manifest.assets
    .filter((asset) => asset.kind === 'image')
    .reduce((counts, asset) => {
      counts[asset.assetVersion] = (counts[asset.assetVersion] ?? 0) + 1;
      return counts;
    }, {});
  if (
    imageVersions[currentImageVersion] !== expectedImageVersions.v2 ||
    imageVersions[supersededImageVersion] !== expectedImageVersions.v1
  ) {
    throw new Error(
      'The selection must keep 20 current V2 images and 15 final-package V1 images; a superseded V1 image may not replace a current V2 image.',
    );
  }

  const supersededImageAssetIds = manifest.selection?.supersededImageAssetIds;
  if (
    !Array.isArray(supersededImageAssetIds) ||
    supersededImageAssetIds.length !== expectedImageVersions.v2
  ) {
    throw new Error(
      `The final manifest must record exactly ${expectedImageVersions.v2} superseded V1 image asset ids.`,
    );
  }
  const assetIds = new Set(manifest.assets.map((asset) => asset.assetId));
  for (const superseded of supersededImageAssetIds) {
    if (assetIds.has(superseded)) {
      throw new Error(
        `The superseded V1 image ${superseded} must stay excluded from the final manifest.`,
      );
    }
  }

  const countsByKind = manifest.assets.reduce((counts, asset) => {
    counts[asset.kind] = (counts[asset.kind] ?? 0) + 1;
    return counts;
  }, {});
  if (JSON.stringify(countsByKind) !== JSON.stringify(kindCounts)) {
    throw new Error('The final manifest kind counts must stay 35 images and 70 audio assets.');
  }
  if (JSON.stringify(manifest.selection?.countsByKind) !== JSON.stringify(kindCounts)) {
    throw new Error('The recorded selection counts must match the selected assets.');
  }
}

export async function validateStart35FinalMediaManifest() {
  const [v2Images, v1Media, finalCandidates, catalogSlice] = await Promise.all(
    [v2ImagesUrl, v1MediaUrl, finalCandidatesUrl, catalogSliceUrl].map((url) =>
      readFile(url, 'utf8').then(JSON.parse),
    ),
  );
  const expected = buildStart35FinalMediaManifest({
    v2Images,
    v1Media,
    finalCandidates,
    catalogSlice,
  });
  const committed = JSON.parse(await readFile(manifestUrl, 'utf8'));
  if (JSON.stringify(committed, null, 2) !== JSON.stringify(expected, null, 2)) {
    throw new Error(
      'The LB-DS-069 final media manifest is stale or drifted from its sources. Run pnpm build:start-35-final-media-manifest.',
    );
  }
  assertStart35FinalMediaManifest(committed);

  // Independent source-to-manifest checks: cardinality, set equality and the
  // superseded-image exclusion are re-derived here, not trusted from the file.
  const superseded = v1Media.assets
    .filter((asset) => asset.kind === 'image')
    .map((asset) => asset.assetId)
    .sort();
  if (
    JSON.stringify(superseded) !==
    JSON.stringify([...committed.selection.supersededImageAssetIds].sort())
  ) {
    throw new Error('Every V1 image must be recorded as superseded and excluded.');
  }

  const counts = committed.assets.reduce((totals, asset) => {
    totals[asset.kind] = (totals[asset.kind] ?? 0) + 1;
    return totals;
  }, {});

  console.info(
    `START_35_FINAL_MEDIA_MANIFEST_OK items=${committed.contentIds.length} assets=${committed.assets.length} images=${counts.image} word_audio=${counts.word_audio} sentence_audio=${counts.sentence_audio} superseded_images_excluded=${superseded.length} state=${committed.state} uploaded=0`,
  );
  return committed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35FinalMediaManifest();
}
