import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

import { buildStart35FinalMediaManifest } from './build-start-35-final-media-manifest.mjs';
import { assertStart35FinalMediaManifest } from './validate-start-35-final-media-manifest.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const manifestName = 'start-a1-35-final-media-manifest.json';
const manifestUrl = new URL(`validation/${manifestName}`, contentRoot);
const load = (name) =>
  readFile(new URL(`validation/${name}`, contentRoot), 'utf8').then(JSON.parse);

const v2Images = await load('start-a1-v2-image-attachment-draft.json');
const v1Media = await load('start-a1-media-attachment-draft.json');
const finalCandidates = await load('start-a1-15-candidate-media-attachment-draft.json');
const catalogSlice = await load('start-a1-35-catalog-slice.json');
const committedSource = await readFile(manifestUrl, 'utf8');
const committed = JSON.parse(committedSource);

function build(overrides = {}) {
  return buildStart35FinalMediaManifest({
    v2Images,
    v1Media,
    finalCandidates,
    catalogSlice,
    ...overrides,
  });
}

const originalIds = [...v2Images.assets.map((asset) => asset.contentId)].sort();
const finalIds = [...new Set(finalCandidates.assets.map((asset) => asset.contentId))].sort();
const supersededIds = [...v1Media.assets.filter((asset) => asset.kind === 'image')]
  .map((asset) => asset.assetId)
  .sort();

test('the committed manifest matches its sources, the formatter and the 35/105 selection', async () => {
  const expected = build();

  assert.deepEqual(committed, expected);
  assert.deepEqual(committed.contentIds, [...originalIds, ...finalIds].sort());
  assert.equal(
    committedSource,
    await format(JSON.stringify(expected), {
      ...(await resolveConfig(manifestUrl.pathname)),
      filepath: manifestUrl.pathname,
    }),
  );
  assert.doesNotThrow(() => assertStart35FinalMediaManifest(committed));
  assert.equal(committed.assets.length, 105);
  assert.equal(committed.contentIds.length, 35);
  assert.equal(committed.selection.itemCount, 35);
  assert.equal(committed.selection.assetCount, 105);
  assert.deepEqual(committed.selection.countsByKind, {
    image: 35,
    word_audio: 35,
    sentence_audio: 35,
  });
});

test('the selection uses exactly one current image, word audio and sentence audio per item', () => {
  for (const contentId of committed.contentIds) {
    const assets = committed.assets.filter((asset) => asset.contentId === contentId);
    assert.deepEqual(
      [...assets.map((asset) => asset.kind)].sort(),
      ['image', 'sentence_audio', 'word_audio'],
      `${contentId} must select exactly three assets`,
    );
  }
  assert.equal(new Set(committed.assets.map((asset) => asset.assetId)).size, 105);
});

test('every original item uses the V2 image and every superseded V1 image stays excluded', () => {
  assert.deepEqual(committed.selection.supersededImageAssetIds, supersededIds);
  assert.equal(supersededIds.length, 20);

  for (const contentId of originalIds) {
    const [image] = committed.assets.filter(
      (asset) => asset.contentId === contentId && asset.kind === 'image',
    );
    assert.equal(image.assetVersion, 'v2');
    assert.equal(image.assetId, `${contentId}-image-v2`);
    assert.equal(image.storageKey, `${contentId}/image/v2`);
    assert.equal(image.expectedMimeType, 'image/png');
    assert.ok(
      !committed.assets.some((asset) => asset.assetId === `${contentId}-image-v1`),
      `${contentId} must not carry its superseded V1 image`,
    );
  }
});

test('every final 15-item asset comes from the prepared candidate package', () => {
  for (const asset of finalCandidates.assets) {
    assert.deepEqual(
      committed.assets.find((candidate) => candidate.assetId === asset.assetId),
      {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        assetVersion: 'v1',
        storageKey: asset.storageKey,
        expectedMimeType: asset.expectedMimeType,
        attachmentStatus: 'awaiting_private_upload',
      },
    );
  }
});

test('word and sentence audio for the original 20 items comes from the V1 audio generation', () => {
  for (const asset of v1Media.assets.filter((candidate) => candidate.kind !== 'image')) {
    assert.deepEqual(
      committed.assets.find((candidate) => candidate.assetId === asset.assetId),
      {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        assetVersion: 'v1',
        storageKey: asset.storageKey,
        expectedMimeType: 'audio/mpeg',
        attachmentStatus: 'awaiting_private_storage_url',
      },
    );
  }
});

test('both recorded transcription exceptions are retained as review inputs', () => {
  assert.deepEqual(committed.recordedTranscriptionExceptions, [
    'start-a1-essen-sentence',
    'start-a1-gross-word',
  ]);
});

test('the manifest stays default-off, upload-free and publication-blocked', () => {
  for (const [key, value] of [
    ['attachmentAllowed', true],
    ['uploadPerformed', true],
    ['urlsIncluded', true],
    ['privatePackageInRepo', true],
    ['learnerExposure', true],
    ['publicationBlocked', false],
    ['state', 'attached'],
    ['state', 'released'],
  ]) {
    const tampered = structuredClone(committed);
    tampered[key] = value;
    assert.throws(
      () => assertStart35FinalMediaManifest(tampered),
      /default-off|upload-free|publication-blocked|attachmentAllowed|uploadPerformed|urlsIncluded|privatePackageInRepo|learnerExposure/i,
      `${key}=${value} must be rejected`,
    );
  }
});

test('the manifest carries no provider identifier, URL, private locator, byte count or checksum', () => {
  for (const key of [
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
  ]) {
    const tampered = structuredClone(committed);
    tampered.assets[0][key] = key === 'bytes' || key === 'size' ? 2048 : 'private-value';
    assert.throws(
      () => assertStart35FinalMediaManifest(tampered),
      new RegExp(`forbidden field ${key}`),
      `${key} must be rejected`,
    );
  }
});

test('an attached, uploaded or otherwise complete asset status is rejected', () => {
  for (const status of [
    'attached',
    'uploaded',
    'upload_complete',
    'verified_private_storage_not_attached',
    'release_approved',
  ]) {
    const tampered = structuredClone(committed);
    tampered.assets[0].attachmentStatus = status;
    assert.throws(
      () => assertStart35FinalMediaManifest(tampered),
      /awaiting_/,
      `status ${status} must be rejected`,
    );
  }
});

test('a superseded V1 image reintroduced into the manifest fails closed', () => {
  const tampered = structuredClone(committed);
  const target = tampered.assets.find(
    (asset) => asset.kind === 'image' && asset.assetVersion === 'v2',
  );
  target.assetId = target.assetId.replace('-image-v2', '-image-v1');
  target.assetVersion = 'v1';
  target.storageKey = target.storageKey.replace('/image/v2', '/image/v1');

  assert.throws(() => assertStart35FinalMediaManifest(tampered), /superseded|V1 image/i);
});

test('source cardinality drift fails closed', () => {
  const fewerImages = structuredClone(v2Images);
  fewerImages.assets = fewerImages.assets.slice(1);
  assert.throws(() => build({ v2Images: fewerImages }), /20/);

  const extraImages = structuredClone(v2Images);
  extraImages.assets = [...extraImages.assets, structuredClone(extraImages.assets[0])];
  assert.throws(() => build({ v2Images: extraImages }), /20/);

  const fewerFinal = structuredClone(finalCandidates);
  fewerFinal.assets = fewerFinal.assets.slice(1);
  assert.throws(() => build({ finalCandidates: fewerFinal }), /45/);

  const fewerAudio = structuredClone(v1Media);
  fewerAudio.assets = fewerAudio.assets.filter(
    (asset) => asset.assetId !== 'start-a1-haus-word-audio-v1',
  );
  assert.throws(() => build({ v1Media: fewerAudio }), /audio|60/);
});

test('source set drift fails closed', () => {
  const swappedImage = structuredClone(v2Images);
  swappedImage.assets[0].contentId = 'start-a1-not-a-starter-item';
  assert.throws(() => build({ v2Images: swappedImage }), /set|canonical|audio/i);

  const alienFinal = structuredClone(finalCandidates);
  alienFinal.assets[0].contentId = 'start-a1-not-a-candidate';
  assert.throws(() => build({ finalCandidates: alienFinal }), /set|catalog|slice/i);

  const driftedSlice = structuredClone(catalogSlice);
  driftedSlice.pendingDraftedItemIds = driftedSlice.pendingDraftedItemIds.slice(1);
  assert.throws(() => build({ catalogSlice: driftedSlice }), /15|set|catalog|slice/i);
});

test('source lifecycle, candidate QA and publication gates fail closed', () => {
  const attachedV2 = structuredClone(v2Images);
  attachedV2.assets[0].attachmentStatus = 'attached';
  assert.throws(() => build({ v2Images: attachedV2 }), /awaiting_private_storage_url/);

  const failedV1Qa = structuredClone(v1Media);
  failedV1Qa.assets[0].qaStatus = 'candidate_qa_failed';
  assert.throws(() => build({ v1Media: failedV1Qa }), /candidate_qa_passed/);

  const exposedFinal = structuredClone(finalCandidates);
  exposedFinal.learnerExposure = true;
  assert.throws(() => build({ finalCandidates: exposedFinal }), /default-off|upload-free/);

  const uploadedFinalAsset = structuredClone(finalCandidates);
  uploadedFinalAsset.assets[0].attachmentStatus = 'uploaded';
  assert.throws(() => build({ finalCandidates: uploadedFinalAsset }), /awaiting_private_upload/);

  const seedableCatalog = structuredClone(catalogSlice);
  seedableCatalog.seedDecision.seedable = true;
  assert.throws(() => build({ catalogSlice: seedableCatalog }), /non-seedable/);

  const releasedV1 = structuredClone(v1Media);
  releasedV1.state = 'attached';
  assert.throws(() => build({ v1Media: releasedV1 }), /unattached|publication-blocked/);
});

test('regeneration is deterministic and independent of source ordering', () => {
  const shuffled = (source) => {
    const clone = structuredClone(source);
    clone.assets = [...clone.assets].reverse();
    return clone;
  };

  const first = build();
  const second = build();
  const reordered = build({
    v2Images: shuffled(v2Images),
    v1Media: shuffled(v1Media),
    finalCandidates: shuffled(finalCandidates),
  });

  assert.deepEqual(second, first);
  assert.deepEqual(reordered, first);
});
