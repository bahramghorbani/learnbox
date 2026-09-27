import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  buildStart35FinalPrivateMediaAttachment,
  renderStart35FinalPrivateMediaAttachment,
} from './build-start-35-final-private-media-attachment.mjs';
import { readTrackedBlobDigests } from './tracked-git-blob-digests.mjs';

const ASSET_KINDS = ['image', 'word_audio', 'sentence_audio'];
const ASSET_COUNT = 105;
const CONTENT_ID_COUNT = 35;
const PUBLIC_CONTENT_ID_COUNT = 20;
const PUBLIC_ASSET_COUNT = PUBLIC_CONTENT_ID_COUNT * ASSET_KINDS.length;
const PUBLIC_PATH_COUNT = PUBLIC_ASSET_COUNT + 3;
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const validationRoot = new URL('../content/packs/learnbox-start/validation/', import.meta.url);

const digest = (index) => (index + 1).toString(16).padStart(64, '0');
const contentIdAt = (index) => `start-a1-item-${Math.floor(index / ASSET_KINDS.length)}`;
const kindAt = (index) => ASSET_KINDS[index % ASSET_KINDS.length];

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
      expectedMimeType: kind === 'image' ? 'image/jpeg' : 'audio/mpeg',
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
      pathname: `learnbox-start/${asset.storageKey}.${asset.kind === 'image' ? 'jpg' : 'mp3'}`,
      mimeType: asset.expectedMimeType,
      bytes: 1000 + index,
      sha256: digest(index),
      attachmentStatus: 'verified_private_storage_not_attached',
    })),
  };
};

const trackedDigests = (reverse = false) => {
  const entries = [];
  for (let index = 0; index < PUBLIC_ASSET_COUNT; index += 1) {
    const paths = [`content/packs/learnbox-start/media/${contentIdAt(index)}/${kindAt(index)}.bin`];
    if (kindAt(index) === 'image' && index < 3 * ASSET_KINDS.length) {
      paths.push(`apps/mobile/assets/cards/${contentIdAt(index)}-image.bin`);
    }
    entries.push([digest(index), paths]);
  }
  return new Map(reverse ? entries.reverse() : entries);
};

const sources = (reverse = false) => ({
  manifest: manifest(),
  attestation: attestation(),
  sourceDigests: { manifest: 'a'.repeat(64), attestation: 'c'.repeat(64) },
  trackedDigests: trackedDigests(reverse),
});

test('builds the canonical digest-anchored attachment record without per-asset evidence', () => {
  const value = buildStart35FinalPrivateMediaAttachment(sources());

  assert.equal(value.state, 'private_media_attached');
  assert.equal(value.attachmentScope, 'repository_evidence_only');
  assert.equal(value.publicationBlocked, true);
  assert.equal(value.learnerDeliveryActivated, false);
  assert.equal(value.databaseMediaRowsWritten, false);
  assert.equal(value.providerCallPerformed, false);
  assert.deepEqual(value.counts, {
    itemCount: CONTENT_ID_COUNT,
    assetCount: ASSET_COUNT,
    contentIdCount: CONTENT_ID_COUNT,
    assetsByKind: { image: 35, word_audio: 35, sentence_audio: 35 },
  });
  assert.deepEqual(value.sourceArtifacts, {
    manifest: {
      path: 'content/packs/learnbox-start/validation/start-a1-35-final-media-manifest.json',
      sha256: 'a'.repeat(64),
      state: 'prepared_awaiting_private_upload',
    },
    attestation: {
      path: 'content/packs/learnbox-start/validation/start-a1-35-final-private-media-attestation.json',
      sha256: 'c'.repeat(64),
      state: 'private_storage_verified_not_attached',
    },
  });
  assert.deepEqual(value.publicExposure, {
    classification: 'mixed_public_copies_and_private_only_assets',
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
  });

  const serialized = JSON.stringify(value);
  for (const forbidden of ['pathname', 'storageKey', 'assetId', 'attachmentStatus', 'bytes']) {
    assert.equal(serialized.includes(forbidden), false, `record duplicates ${forbidden}`);
  }
});

test('is byte-deterministic and independent of tracked digest insertion order', async () => {
  const first = await renderStart35FinalPrivateMediaAttachment(
    buildStart35FinalPrivateMediaAttachment(sources()),
  );
  const second = await renderStart35FinalPrivateMediaAttachment(
    buildStart35FinalPrivateMediaAttachment(sources()),
  );
  const reversed = await renderStart35FinalPrivateMediaAttachment(
    buildStart35FinalPrivateMediaAttachment(sources(true)),
  );
  assert.equal(first, second);
  assert.equal(first, reversed);
});

test('matches the committed record byte for byte', async () => {
  const [committed, manifestText, attestationText] = await Promise.all([
    readFile(new URL('start-a1-35-final-private-media-attachment.json', validationRoot), 'utf8'),
    readFile(new URL('start-a1-35-final-media-manifest.json', validationRoot), 'utf8'),
    readFile(new URL('start-a1-35-final-private-media-attestation.json', validationRoot), 'utf8'),
  ]);
  const sourceAttestation = JSON.parse(attestationText);
  const value = buildStart35FinalPrivateMediaAttachment({
    manifest: JSON.parse(manifestText),
    attestation: sourceAttestation,
    sourceDigests: {
      manifest: createHash('sha256').update(manifestText).digest('hex'),
      attestation: createHash('sha256').update(attestationText).digest('hex'),
    },
    trackedDigests: await readTrackedBlobDigests({
      sizes: sourceAttestation.assets.map((asset) => asset.bytes),
      root: repositoryRoot,
    }),
  });
  assert.equal(await renderStart35FinalPrivateMediaAttachment(value), committed);
});

for (const [name, mutate] of [
  ['a wrong source batch', (value) => (value.attestation.batchId = 'wrong')],
  ['a drifted manifest lifecycle', (value) => (value.manifest.state = 'uploaded')],
  ['a drifted manifest attachment flag', (value) => (value.manifest.attachmentAllowed = true)],
  [
    'a drifted attestation lifecycle',
    (value) => (value.attestation.state = 'private_media_attached'),
  ],
  ['a missing canonical asset', (value) => value.manifest.assets.pop()],
  [
    'an extra canonical asset',
    (value) => value.manifest.assets.push({ ...value.manifest.assets[0] }),
  ],
  ['a missing attested asset', (value) => value.attestation.assets.pop()],
  [
    'a duplicate attested asset id',
    (value) => (value.attestation.assets[1].assetId = value.attestation.assets[0].assetId),
  ],
  [
    'a duplicate delivery key',
    (value) => {
      value.attestation.assets[1].contentId = value.attestation.assets[0].contentId;
      value.attestation.assets[1].kind = value.attestation.assets[0].kind;
    },
  ],
  [
    'a drifted canonical storage key',
    (value) => (value.manifest.assets[0].storageKey = 'other/image/v1'),
  ],
  ['a malformed source digest', (value) => (value.sourceDigests.manifest = 'nope')],
  ['a missing source digest', (value) => delete value.sourceDigests.attestation],
  ['a malformed attested checksum', (value) => (value.attestation.assets[0].sha256 = 'nope')],
  ['a missing tracked digest map', (value) => delete value.trackedDigests],
  ['no tracked public copy at all', (value) => (value.trackedDigests = new Map())],
  [
    'every attested asset exposed publicly',
    (value) => {
      for (let index = 0; index < ASSET_COUNT; index += 1) {
        value.trackedDigests.set(digest(index), ['content/packs/learnbox-start/media/copy.bin']);
      }
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const value = sources();
    mutate(value);
    assert.throws(
      () => buildStart35FinalPrivateMediaAttachment(value),
      /START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_BUILD_REJECTED/,
    );
  });
}
