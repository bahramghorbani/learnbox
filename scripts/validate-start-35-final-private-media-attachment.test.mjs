import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { assertStart35FinalPrivateMediaAttachment } from './validate-start-35-final-private-media-attachment.mjs';
import { readTrackedBlobDigests } from './tracked-git-blob-digests.mjs';

const ASSET_KINDS = ['image', 'word_audio', 'sentence_audio'];
const ASSET_COUNT = 105;
const CONTENT_ID_COUNT = 35;
const ASSETS_PER_KIND = ASSET_COUNT / ASSET_KINDS.length;
const PUBLIC_CONTENT_ID_COUNT = 20;
const PUBLIC_ASSET_COUNT = PUBLIC_CONTENT_ID_COUNT * ASSET_KINDS.length;
const PUBLIC_PATH_COUNT = PUBLIC_ASSET_COUNT + 3;
const RECORD_KIND = 'canonical_repository_private_media_attachment_record';
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const validationRoot = new URL('../content/packs/learnbox-start/validation/', import.meta.url);
const manifestPath =
  'content/packs/learnbox-start/validation/start-a1-35-final-media-manifest.json';
const attestationPath =
  'content/packs/learnbox-start/validation/start-a1-35-final-private-media-attestation.json';

const digest = (index) => (index + 1).toString(16).padStart(64, '0');
const contentIdAt = (index) => `start-a1-item-${Math.floor(index / ASSET_KINDS.length)}`;
const kindAt = (index) => ASSET_KINDS[index % ASSET_KINDS.length];
const mimeTypeFor = (kind) => (kind === 'image' ? 'image/jpeg' : 'audio/mpeg');
const extensionFor = (kind) => (kind === 'image' ? 'jpg' : 'mp3');

const manifest = () => ({
  batchId: 'learnbox-start-a1-35-final-media-v1',
  state: 'prepared_awaiting_private_upload',
  publicationBlocked: true,
  attachmentAllowed: false,
  uploadPerformed: false,
  urlsIncluded: false,
  privatePackageInRepo: false,
  learnerExposure: false,
  selection: { itemCount: CONTENT_ID_COUNT, assetCount: ASSET_COUNT },
  assets: Array.from({ length: ASSET_COUNT }, (_, index) => {
    const contentId = contentIdAt(index);
    const kind = kindAt(index);
    return {
      assetId: `${contentId}-${kind}-v1`,
      contentId,
      kind,
      assetVersion: 'v1',
      storageKey: `${contentId}/${kind}/v1`,
      expectedMimeType: mimeTypeFor(kind),
      attachmentStatus: 'awaiting_private_storage_url',
    };
  }),
});

const attestation = () => {
  const source = manifest();
  return {
    batchId: source.batchId,
    state: 'private_storage_verified_not_attached',
    publicationBlocked: true,
    assets: source.assets.map((asset, index) => ({
      ...asset,
      pathname: `learnbox-start/${asset.storageKey}.${extensionFor(asset.kind)}`,
      mimeType: asset.expectedMimeType,
      bytes: 1000 + index,
      sha256: digest(index),
      attachmentStatus: 'verified_private_storage_not_attached',
    })),
  };
};

const trackedDigests = () => {
  const digests = new Map();
  for (let index = 0; index < PUBLIC_ASSET_COUNT; index += 1) {
    const paths = [`content/packs/learnbox-start/media/${contentIdAt(index)}/${kindAt(index)}.bin`];
    if (kindAt(index) === 'image' && index < 3 * ASSET_KINDS.length) {
      paths.push(`apps/mobile/assets/cards/${contentIdAt(index)}-image.bin`);
    }
    digests.set(digest(index), paths);
  }
  return digests;
};

const sources = () => ({
  manifest: manifest(),
  attestation: attestation(),
  sourceDigests: { manifest: 'a'.repeat(64), attestation: 'c'.repeat(64) },
  trackedDigests: trackedDigests(),
});

const record = () => ({
  recordVersion: 1,
  recordKind: RECORD_KIND,
  batchId: 'learnbox-start-a1-35-final-media-v1',
  state: 'private_media_attached',
  attachmentScope: 'repository_evidence_only',
  publicationBlocked: true,
  learnerDeliveryActivated: false,
  databaseMediaRowsWritten: false,
  providerCallPerformed: false,
  authorization: {
    basis: 'owner_authorized_repository_attachment_record',
    identityIndependentlyVerified: false,
    authorizes: ['record_repository_attachment_state'],
    doesNotAuthorize: [
      'admin_outcome_persistence',
      'database_media_rows',
      'provider_operation',
      'learner_delivery_activation',
      'catalog_seed',
      'deployment',
      'publication',
    ],
  },
  counts: {
    itemCount: CONTENT_ID_COUNT,
    assetCount: ASSET_COUNT,
    contentIdCount: CONTENT_ID_COUNT,
    assetsByKind: {
      image: ASSETS_PER_KIND,
      word_audio: ASSETS_PER_KIND,
      sentence_audio: ASSETS_PER_KIND,
    },
  },
  sourceArtifacts: {
    manifest: {
      path: manifestPath,
      sha256: 'a'.repeat(64),
      state: 'prepared_awaiting_private_upload',
    },
    attestation: {
      path: attestationPath,
      sha256: 'c'.repeat(64),
      state: 'private_storage_verified_not_attached',
    },
  },
  publicExposure: {
    classification: 'mixed_public_legacy_copies_and_private_only_assets',
    verificationMethod: 'sha256_equality_against_tracked_git_blobs',
    allAssetsPrivate: false,
    assetsWithPublicByteIdenticalCopy: PUBLIC_ASSET_COUNT,
    contentIdsWithPublicByteIdenticalCopy: PUBLIC_CONTENT_ID_COUNT,
    trackedPathsWithPublicByteIdenticalCopy: PUBLIC_PATH_COUNT,
    assetsWithoutPublicCopy: ASSET_COUNT - PUBLIC_ASSET_COUNT,
    contentIdsWithoutPublicCopy: CONTENT_ID_COUNT - PUBLIC_CONTENT_ID_COUNT,
    assetsWithPublicByteIdenticalCopyByKind: {
      image: PUBLIC_CONTENT_ID_COUNT,
      word_audio: PUBLIC_CONTENT_ID_COUNT,
      sentence_audio: PUBLIC_CONTENT_ID_COUNT,
    },
  },
});

test('accepts the exact canonical private-media attachment record', () => {
  assert.equal(assertStart35FinalPrivateMediaAttachment(record(), sources()), true);
});

for (const [name, mutate] of [
  ['a versioned record schema', (value) => (value.recordVersion = 2)],
  ['an unknown record kind', (value) => (value.recordKind = 'private_media_attachment')],
  ['a wrong batch', (value) => (value.batchId = 'wrong')],
  ['a pre-attachment state', (value) => (value.state = 'private_storage_verified_not_attached')],
  ['a published state', (value) => (value.state = 'published')],
  ['a widened attachment scope', (value) => (value.attachmentScope = 'provider_and_database')],
  ['unblocked publication', (value) => (value.publicationBlocked = false)],
  ['activated learner delivery', (value) => (value.learnerDeliveryActivated = true)],
  ['written database media rows', (value) => (value.databaseMediaRowsWritten = true)],
  ['a performed provider call', (value) => (value.providerCallPerformed = true)],
  ['a missing release gate', (value) => delete value.providerCallPerformed],
  ['an extra top-level claim', (value) => (value.deploymentPerformed = true)],
  ['a nested deployment claim', (value) => (value.authorization.deploymentPerformed = true)],
  ['an extra authorization field', (value) => (value.authorization.ownerApproved = true)],
  ['drifted canonical counts', (value) => (value.counts.assetCount = 104)],
  ['drifted per-kind counts', (value) => (value.counts.assetsByKind.image = 34)],
  ['an extra counts field', (value) => (value.counts.publicAssetCount = PUBLIC_ASSET_COUNT)],
  ['drifted source digests', (value) => (value.sourceArtifacts.manifest.sha256 = 'b'.repeat(64))],
  ['a wrong source path', (value) => (value.sourceArtifacts.attestation.path = 'other.json')],
  [
    'a drifted recorded manifest lifecycle',
    (value) => (value.sourceArtifacts.manifest.state = 'upload_complete'),
  ],
  [
    'a drifted recorded attestation lifecycle',
    (value) => (value.sourceArtifacts.attestation.state = 'private_media_attached'),
  ],
  ['a stripped exposure block', (value) => delete value.publicExposure],
  [
    'drifted public asset count',
    (value) => (value.publicExposure.assetsWithPublicByteIdenticalCopy = 61),
  ],
  [
    'drifted public content-id count',
    (value) => (value.publicExposure.contentIdsWithPublicByteIdenticalCopy = 19),
  ],
  [
    'drifted public tracked-path count',
    (value) => (value.publicExposure.trackedPathsWithPublicByteIdenticalCopy = 60),
  ],
  [
    'drifted private-only asset count',
    (value) => (value.publicExposure.assetsWithoutPublicCopy = 44),
  ],
  [
    'drifted private-only content-id count',
    (value) => (value.publicExposure.contentIdsWithoutPublicCopy = 16),
  ],
  [
    'drifted per-kind public counts',
    (value) => (value.publicExposure.assetsWithPublicByteIdenticalCopyByKind.image = 21),
  ],
  ['an all-private overclaim', (value) => (value.publicExposure.allAssetsPrivate = true)],
  [
    'an unpublished exposure classification',
    (value) => (value.publicExposure.classification = 'private_only'),
  ],
  [
    'a provider-dependent verification method',
    (value) => (value.publicExposure.verificationMethod = 'provider_download_sha256'),
  ],
  [
    'duplicated per-asset evidence',
    (value) => (value.assets = [{ assetId: 'start-a1-item-0-image-v1' }]),
  ],
  [
    'a duplicated media pathname',
    (value) => (value.sourceArtifacts.attestation.pathname = 'learnbox-start/x/image/v1.jpg'),
  ],
  ['a duplicated asset checksum', (value) => (value.authorization.assetSha256 = 'd'.repeat(64))],
  [
    'a provider locator value',
    (value) => value.authorization.doesNotAuthorize.push('https://blob.vercel-storage.com/private'),
  ],
  [
    'a duplicated media locator value',
    (value) =>
      value.authorization.doesNotAuthorize.push('learnbox-start/start-a1-item-0/image/v1.jpg'),
  ],
]) {
  test(`rejects ${name}`, () => {
    const value = record();
    mutate(value);
    assert.throws(
      () => assertStart35FinalPrivateMediaAttachment(value, sources()),
      /START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_INVALID/,
    );
  });
}

for (const [name, mutate] of [
  ['a drifted source manifest lifecycle', (value) => (value.manifest.uploadPerformed = true)],
  ['a drifted source manifest exposure flag', (value) => (value.manifest.learnerExposure = true)],
  [
    'a drifted source attestation lifecycle',
    (value) => (value.attestation.state = 'private_upload_complete_not_attached'),
  ],
  ['a wrong source batch', (value) => (value.attestation.batchId = 'wrong')],
  [
    'a drifted canonical storage key',
    (value) => (value.manifest.assets[0].storageKey = 'other/v1'),
  ],
  [
    'a drifted canonical MIME type',
    (value) => (value.manifest.assets[0].expectedMimeType = 'image/png'),
  ],
  ['a missing canonical asset', (value) => value.manifest.assets.pop()],
  [
    'an extra canonical asset',
    (value) => value.manifest.assets.push({ ...value.manifest.assets[0] }),
  ],
  [
    'a duplicate attested asset id',
    (value) => (value.attestation.assets[1].assetId = value.attestation.assets[0].assetId),
  ],
  ['a missing attested asset', (value) => value.attestation.assets.pop()],
  [
    'a duplicate delivery key',
    (value) => {
      value.attestation.assets[1].contentId = value.attestation.assets[0].contentId;
      value.attestation.assets[1].kind = value.attestation.assets[0].kind;
    },
  ],
  [
    'malformed attested checksum evidence',
    (value) => (value.attestation.assets[0].sha256 = 'nope'),
  ],
  ['drifted source artifact digests', (value) => (value.sourceDigests.manifest = 'b'.repeat(64))],
  [
    'a removed tracked public copy',
    (value) => value.trackedDigests.delete(digest(PUBLIC_ASSET_COUNT - 1)),
  ],
  [
    'an added tracked public copy',
    (value) => value.trackedDigests.set(digest(ASSET_COUNT - 1), ['content/packs/other.bin']),
  ],
]) {
  test(`rejects ${name}`, () => {
    const value = sources();
    mutate(value);
    assert.throws(
      () => assertStart35FinalPrivateMediaAttachment(record(), value),
      /START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_INVALID/,
    );
  });
}

test('accepts the committed record and recomputes the verified exposure truth', async () => {
  const [recordText, manifestText, attestationText] = await Promise.all([
    readFile(new URL('start-a1-35-final-private-media-attachment.json', validationRoot), 'utf8'),
    readFile(new URL('start-a1-35-final-media-manifest.json', validationRoot), 'utf8'),
    readFile(new URL('start-a1-35-final-private-media-attestation.json', validationRoot), 'utf8'),
  ]);
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  const committed = JSON.parse(recordText);
  const sourceAttestation = JSON.parse(attestationText);
  const tracked = await readTrackedBlobDigests({
    sizes: sourceAttestation.assets.map((asset) => asset.bytes),
    root: repositoryRoot,
  });

  assert.equal(
    assertStart35FinalPrivateMediaAttachment(committed, {
      manifest: JSON.parse(manifestText),
      attestation: sourceAttestation,
      sourceDigests: {
        manifest: sha256(manifestText),
        attestation: sha256(attestationText),
      },
      trackedDigests: tracked,
    }),
    true,
  );
  assert.equal(committed.state, 'private_media_attached');
  assert.deepEqual(committed.publicExposure, {
    classification: 'mixed_public_legacy_copies_and_private_only_assets',
    verificationMethod: 'sha256_equality_against_tracked_git_blobs',
    allAssetsPrivate: false,
    assetsWithPublicByteIdenticalCopy: 60,
    contentIdsWithPublicByteIdenticalCopy: 20,
    trackedPathsWithPublicByteIdenticalCopy: 63,
    assetsWithoutPublicCopy: 45,
    contentIdsWithoutPublicCopy: 15,
    assetsWithPublicByteIdenticalCopyByKind: { image: 20, word_audio: 20, sentence_audio: 20 },
  });
});
