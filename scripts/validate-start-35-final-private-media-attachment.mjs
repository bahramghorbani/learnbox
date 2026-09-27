import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readTrackedBlobDigests } from './tracked-git-blob-digests.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const manifestPath =
  'content/packs/learnbox-start/validation/start-a1-35-final-media-manifest.json';
const attestationPath =
  'content/packs/learnbox-start/validation/start-a1-35-final-private-media-attestation.json';
const recordPath =
  'content/packs/learnbox-start/validation/start-a1-35-final-private-media-attachment.json';
const manifestUrl = new URL(`../${manifestPath}`, import.meta.url);
const attestationUrl = new URL(`../${attestationPath}`, import.meta.url);
const recordUrl = new URL(`../${recordPath}`, import.meta.url);

const recordVersion = 1;
const recordKind = 'canonical_repository_private_media_attachment_record';
const recordState = 'private_media_attached';
const attachmentScope = 'repository_evidence_only';
const authorizationBasis = 'owner_authorized_repository_attachment_record';
const authorizationGrants = ['record_repository_attachment_state'];
const authorizationLimits = [
  'admin_outcome_persistence',
  'database_media_rows',
  'provider_operation',
  'learner_delivery_activation',
  'catalog_seed',
  'deployment',
  'publication',
];
const verificationMethod = 'sha256_equality_against_tracked_git_blobs';
const assetKinds = ['image', 'word_audio', 'sentence_audio'];
const assetCount = 105;
const contentIdCount = 35;
const assetsPerKind = assetCount / assetKinds.length;
const sha256Pattern = /^[a-f0-9]{64}$/;
const expectedManifestLifecycle = {
  state: 'prepared_awaiting_private_upload',
  publicationBlocked: true,
  attachmentAllowed: false,
  uploadPerformed: false,
  urlsIncluded: false,
  privatePackageInRepo: false,
  learnerExposure: false,
};
const expectedAttestationLifecycle = {
  state: 'private_storage_verified_not_attached',
  publicationBlocked: true,
};
const recordFields = [
  'recordVersion',
  'recordKind',
  'batchId',
  'state',
  'attachmentScope',
  'publicationBlocked',
  'learnerDeliveryActivated',
  'databaseMediaRowsWritten',
  'providerCallPerformed',
  'authorization',
  'counts',
  'sourceArtifacts',
  'publicExposure',
];
const publicExposureFields = [
  'classification',
  'verificationMethod',
  'allAssetsPrivate',
  'assetsWithPublicByteIdenticalCopy',
  'contentIdsWithPublicByteIdenticalCopy',
  'trackedPathsWithPublicByteIdenticalCopy',
  'assetsWithoutPublicCopy',
  'contentIdsWithoutPublicCopy',
  'assetsWithPublicByteIdenticalCopyByKind',
];

function fail(message) {
  throw new Error(`START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_INVALID: ${message}`);
}

function assertExactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object`);
  const actual = Object.keys(value);
  const missing = fields.filter((field) => !actual.includes(field));
  if (missing.length > 0) fail(`${label} is missing ${missing.join(', ')}`);
  const unexpected = actual.filter((field) => !fields.includes(field));
  if (unexpected.length > 0) fail(`${label} has unexpected fields ${unexpected.join(', ')}`);
}

function assertSameStrings(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    expected.some((value, index) => actual[index] !== value)
  ) {
    fail(`${label} must remain exactly ${expected.join(', ')}`);
  }
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function attachmentContentIdCount(attestation) {
  return new Set(attestation.assets.map((asset) => asset.contentId)).size;
}

/**
 * Counts and byte-identity exposure derived only from the committed manifest, attestation and
 * tracked Git blob digests: no provider call, database row or network read is involved.
 */
export function deriveStart35FinalPrivateMediaExposure(attestation, trackedDigests) {
  if (!(trackedDigests instanceof Map)) fail('tracked Git blob digests are required');
  const matched = attestation.assets.filter((asset) => trackedDigests.has(asset.sha256));
  const paths = new Set();
  for (const asset of matched) {
    const assetPaths = trackedDigests.get(asset.sha256);
    if (!Array.isArray(assetPaths) || assetPaths.length === 0) {
      fail(`${asset.assetId} has an empty tracked blob path list`);
    }
    for (const path of assetPaths) paths.add(path);
  }
  const byKind = Object.fromEntries(
    assetKinds.map((kind) => [kind, matched.filter((asset) => asset.kind === kind).length]),
  );
  const allAssetsPrivate = matched.length === 0;
  const classification = allAssetsPrivate
    ? 'no_public_byte_identical_copies'
    : matched.length === attestation.assets.length
      ? 'all_assets_have_public_byte_identical_copies'
      : 'mixed_public_copies_and_private_only_assets';
  return {
    classification,
    allAssetsPrivate,
    assetsWithPublicByteIdenticalCopy: matched.length,
    contentIdsWithPublicByteIdenticalCopy: new Set(matched.map((asset) => asset.contentId)).size,
    trackedPathsWithPublicByteIdenticalCopy: paths.size,
    assetsWithoutPublicCopy: attestation.assets.length - matched.length,
    contentIdsWithoutPublicCopy:
      attachmentContentIdCount(attestation) - new Set(matched.map((asset) => asset.contentId)).size,
    assetsWithPublicByteIdenticalCopyByKind: byKind,
  };
}

function assertSourceBoundary(manifest, attestation) {
  if (!manifest || typeof manifest !== 'object') fail('the canonical manifest is required');
  if (!attestation || typeof attestation !== 'object')
    fail('the canonical attestation is required');
  if (attestation.batchId !== manifest.batchId) fail('source batch ids must agree');
  for (const [field, expected] of Object.entries(expectedManifestLifecycle)) {
    if (manifest[field] !== expected) fail(`canonical manifest ${field} must remain ${expected}`);
  }
  for (const [field, expected] of Object.entries(expectedAttestationLifecycle)) {
    if (attestation[field] !== expected) {
      fail(`canonical attestation ${field} must remain ${expected}`);
    }
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== assetCount) {
    fail(`the canonical manifest must contain exactly ${assetCount} assets`);
  }
  if (!Array.isArray(attestation.assets) || attestation.assets.length !== assetCount) {
    fail(`the canonical attestation must contain exactly ${assetCount} assets`);
  }

  const canonical = new Map();
  const canonicalDeliveryKeys = new Set();
  for (const asset of manifest.assets) {
    if (canonical.has(asset.assetId)) fail(`duplicate canonical asset id ${asset.assetId}`);
    canonical.set(asset.assetId, asset);
    const deliveryKey = `${asset.contentId}:${asset.kind}`;
    if (canonicalDeliveryKeys.has(deliveryKey))
      fail(`duplicate canonical delivery key ${deliveryKey}`);
    canonicalDeliveryKeys.add(deliveryKey);
  }

  const assetIds = new Set();
  const deliveryKeys = new Set();
  const kinds = new Map();
  const kindsByContentId = new Map();
  for (const asset of attestation.assets) {
    if (assetIds.has(asset.assetId)) fail(`duplicate attested asset id ${asset.assetId}`);
    assetIds.add(asset.assetId);
    const source = canonical.get(asset.assetId);
    if (!source) fail(`unexpected attested asset ${asset.assetId}`);
    for (const field of ['contentId', 'kind', 'storageKey']) {
      if (asset[field] !== source[field]) {
        fail(`${asset.assetId} ${field} does not match the canonical manifest`);
      }
    }
    if (asset.mimeType !== source.expectedMimeType) {
      fail(`${asset.assetId} MIME type does not match the canonical manifest`);
    }
    const deliveryKey = `${asset.contentId}:${asset.kind}`;
    if (deliveryKeys.has(deliveryKey)) fail(`duplicate delivery key ${deliveryKey}`);
    deliveryKeys.add(deliveryKey);
    if (!assetKinds.includes(asset.kind)) fail(`${asset.assetId} has an unsupported kind`);
    if (!sha256Pattern.test(asset.sha256 ?? ''))
      fail(`${asset.assetId} has invalid checksum evidence`);
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0)
      fail(`${asset.assetId} has invalid byte evidence`);
    kinds.set(asset.kind, (kinds.get(asset.kind) ?? 0) + 1);
    const contentKinds = kindsByContentId.get(asset.contentId) ?? new Set();
    contentKinds.add(asset.kind);
    kindsByContentId.set(asset.contentId, contentKinds);
  }
  if (assetIds.size !== assetCount) fail('attested asset ids must be unique');
  if (canonical.size !== assetIds.size)
    fail('attested asset ids must match the canonical manifest');
  if (kindsByContentId.size !== contentIdCount) {
    fail(`the canonical attestation must cover exactly ${contentIdCount} content ids`);
  }
  for (const kind of assetKinds) {
    if ((kinds.get(kind) ?? 0) !== assetsPerKind) {
      fail(`the canonical attestation must contain exactly ${assetsPerKind} ${kind} assets`);
    }
  }
  for (const [contentId, contentKinds] of kindsByContentId) {
    if (assetKinds.some((kind) => !contentKinds.has(kind))) {
      fail(`${contentId} must carry every canonical media kind exactly once`);
    }
  }
}

function assertCounts(record, attestation) {
  assertExactFields(
    record.counts,
    ['itemCount', 'assetCount', 'contentIdCount', 'assetsByKind'],
    'counts',
  );
  assertExactFields(record.counts.assetsByKind, assetKinds, 'counts.assetsByKind');
  const expected = {
    itemCount: attachmentContentIdCount(attestation),
    assetCount: attestation.assets.length,
    contentIdCount: attachmentContentIdCount(attestation),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record.counts[field] !== value) fail(`counts.${field} must remain ${value}`);
  }
  for (const kind of assetKinds) {
    const count = attestation.assets.filter((asset) => asset.kind === kind).length;
    if (record.counts.assetsByKind[kind] !== count)
      fail(`counts.assetsByKind.${kind} must remain ${count}`);
  }
}

function assertSourceArtifacts(record, manifest, attestation, sourceDigests) {
  assertExactFields(record.sourceArtifacts, ['manifest', 'attestation'], 'sourceArtifacts');
  const expectations = [
    ['manifest', manifestPath, manifest.state, sourceDigests?.manifest],
    ['attestation', attestationPath, attestation.state, sourceDigests?.attestation],
  ];
  for (const [name, path, state, digest] of expectations) {
    assertExactFields(
      record.sourceArtifacts[name],
      ['path', 'sha256', 'state'],
      `sourceArtifacts.${name}`,
    );
    if (record.sourceArtifacts[name].path !== path) {
      fail(`sourceArtifacts.${name}.path must remain ${path}`);
    }
    if (record.sourceArtifacts[name].state !== state) {
      fail(`sourceArtifacts.${name}.state must match the immutable source lifecycle`);
    }
    if (!sha256Pattern.test(digest ?? '')) fail(`a valid ${name} source digest is required`);
    if (record.sourceArtifacts[name].sha256 !== digest) {
      fail(`sourceArtifacts.${name}.sha256 drifted from the committed source artifact`);
    }
  }
}

function assertPublicExposure(record, attestation, trackedDigests) {
  assertExactFields(record.publicExposure, publicExposureFields, 'publicExposure');
  assertExactFields(
    record.publicExposure.assetsWithPublicByteIdenticalCopyByKind,
    assetKinds,
    'publicExposure.assetsWithPublicByteIdenticalCopyByKind',
  );
  if (record.publicExposure.verificationMethod !== verificationMethod) {
    fail(`publicExposure.verificationMethod must remain ${verificationMethod}`);
  }
  const derived = deriveStart35FinalPrivateMediaExposure(attestation, trackedDigests);
  const derivedFields = publicExposureFields.filter(
    (field) =>
      field !== 'verificationMethod' && field !== 'assetsWithPublicByteIdenticalCopyByKind',
  );
  for (const field of derivedFields) {
    if (record.publicExposure[field] !== derived[field]) {
      fail(`publicExposure.${field} drifted from the tracked Git blob evidence`);
    }
  }
  for (const kind of assetKinds) {
    if (
      record.publicExposure.assetsWithPublicByteIdenticalCopyByKind[kind] !==
      derived.assetsWithPublicByteIdenticalCopyByKind[kind]
    ) {
      fail(
        `publicExposure.assetsWithPublicByteIdenticalCopyByKind.${kind} drifted from tracked Git blobs`,
      );
    }
  }
  if (derived.assetsWithPublicByteIdenticalCopy === 0)
    fail('at least one byte-identical public copy is required');
  if (derived.assetsWithoutPublicCopy === 0) {
    fail('attachment must not claim that every attested asset is private');
  }
}

export function assertStart35FinalPrivateMediaAttachment(record, options = {}) {
  const { manifest, attestation, sourceDigests, trackedDigests } = options;
  assertSourceBoundary(manifest, attestation);
  assertExactFields(record, recordFields, 'attachment record');
  if (record.recordVersion !== recordVersion) fail(`record version must remain ${recordVersion}`);
  if (record.recordKind !== recordKind) fail(`record kind must remain ${recordKind}`);
  if (record.batchId !== manifest.batchId)
    fail('the record batch must match the canonical manifest');
  if (record.state !== recordState) fail(`state must remain ${recordState}`);
  if (record.attachmentScope !== attachmentScope) {
    fail(`attachment scope must remain limited to ${attachmentScope}`);
  }
  if (record.publicationBlocked !== true) fail('publication must remain blocked');
  if (record.learnerDeliveryActivated !== false) fail('learner delivery must remain deactivated');
  if (record.databaseMediaRowsWritten !== false) fail('no database media row may be written');
  if (record.providerCallPerformed !== false) fail('no provider call may be performed');

  assertExactFields(
    record.authorization,
    ['basis', 'identityIndependentlyVerified', 'authorizes', 'doesNotAuthorize'],
    'authorization',
  );
  if (record.authorization.basis !== authorizationBasis) {
    fail(`authorization basis must remain ${authorizationBasis}`);
  }
  if (record.authorization.identityIndependentlyVerified !== false) {
    fail('owner identity must not be claimed as independently verified');
  }
  assertSameStrings(
    record.authorization.authorizes,
    authorizationGrants,
    'authorization.authorizes',
  );
  assertSameStrings(
    record.authorization.doesNotAuthorize,
    authorizationLimits,
    'authorization.doesNotAuthorize',
  );

  assertCounts(record, attestation);
  assertSourceArtifacts(record, manifest, attestation, sourceDigests);
  assertPublicExposure(record, attestation, trackedDigests);
  return true;
}

export async function validateStart35FinalPrivateMediaAttachment() {
  const [recordText, manifestText, attestationText] = await Promise.all([
    readFile(recordUrl, 'utf8'),
    readFile(manifestUrl, 'utf8'),
    readFile(attestationUrl, 'utf8'),
  ]);
  const attestation = JSON.parse(attestationText);
  const trackedDigests = await readTrackedBlobDigests({
    sizes: attestation.assets.map((asset) => asset.bytes),
    root: repositoryRoot,
  });
  const record = JSON.parse(recordText);
  assertStart35FinalPrivateMediaAttachment(record, {
    manifest: JSON.parse(manifestText),
    attestation,
    sourceDigests: { manifest: sha256(manifestText), attestation: sha256(attestationText) },
    trackedDigests,
  });
  console.info(
    `START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_OK assets=${record.counts.assetCount} state=${record.state} publication_blocked=true public_byte_identical=${record.publicExposure.assetsWithPublicByteIdenticalCopy}`,
  );
  return record;
}

export const start35FinalPrivateMediaAttachmentPaths = {
  manifestPath,
  attestationPath,
  recordPath,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35FinalPrivateMediaAttachment();
}
