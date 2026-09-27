import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ReadableStream } from 'node:stream/web';

import {
  assertFinal35SelectionIntegrity,
  assertHumanReviewApprovals,
  assertMediaSignature,
  deriveFinal35Selection,
  destinationPathname,
  detectMediaSignature,
  extensionForMimeType,
  hashPrivateStream,
  loadFinal35Sources,
  loadFinalPackage,
  parseFinalPackageRoot,
  parseMode,
  preflightFinal35Assets,
  privateUploadConcurrency,
  resolveFinal15Source,
  uploadVerifiedSelection,
  verifyStoredPrivateObject,
} from './upload-start-slice-private-media.mjs';

import {
  createBlobCapabilityLoader,
  validateUploadExecutionBoundary,
} from './validate-private-media-upload-boundary.mjs';

const validAttestation = {
  version: 1,
  ownerApproved: true,
  targetPurpose: 'learnbox-private-media-isolated-nonproduction',
  access: 'private',
  dedicatedStore: true,
  dedicatedProject: true,
  productionConnectionAbsent: true,
  previewConnectionAbsent: true,
  sharedKnownStoreRejected: true,
  noExistingObjectsExpected: true,
};

const validBoundary = {
  execute: true,
  ownerApprovedFlag: true,
  attestation: validAttestation,
  resolvedStoreIdentity: 'runtime-isolated-target',
  expectedStoreIdentity: 'runtime-isolated-target',
  knownSharedStoreIdentity: 'known-shared-store',
};

test('dry run does not require an execution attestation', () => {
  assert.equal(validateUploadExecutionBoundary({ execute: false }), false);
});

test('execute rejects a missing owner approval flag', () => {
  assert.throws(
    () => validateUploadExecutionBoundary({ ...validBoundary, ownerApprovedFlag: false }),
    /owner approval flag/i,
  );
});

test('execute rejects a missing attestation', () => {
  assert.throws(
    () => validateUploadExecutionBoundary({ ...validBoundary, attestation: undefined }),
    /attestation.*required/i,
  );
});

test('execute rejects malformed or extra attestation fields', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        attestation: { ...validAttestation, unexpected: true },
      }),
    /exact(?:ly)? .*fields/i,
  );
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        attestation: { ...validAttestation, dedicatedStore: false },
      }),
    /dedicatedStore/i,
  );
});

test('execute rejects missing and mismatched runtime identities', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        expectedStoreIdentity: undefined,
      }),
    /expected store identity/i,
  );
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        resolvedStoreIdentity: 'different-target',
      }),
    /does not match/i,
  );
});

test('execute rejects the known shared target marker', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        resolvedStoreIdentity: 'known-shared-store',
        expectedStoreIdentity: 'known-shared-store',
      }),
    /known shared target/i,
  );
});

test('execute accepts the exact fields independent of JSON key order', () => {
  const reorderedAttestation = Object.fromEntries(Object.entries(validAttestation).reverse());
  assert.equal(
    validateUploadExecutionBoundary({ ...validBoundary, attestation: reorderedAttestation }),
    true,
  );
});

test('execute accepts the exact isolated target boundary', () => {
  assert.equal(validateUploadExecutionBoundary(validBoundary), true);
});

test('uploader validates the boundary before loading Blob capabilities', async () => {
  let loadCalls = 0;
  assert.throws(
    () =>
      createBlobCapabilityLoader(
        { ...validBoundary, resolvedStoreIdentity: 'known-shared-store' },
        async () => {
          loadCalls += 1;
        },
      ),
    /known shared target/i,
  );
  assert.equal(loadCalls, 0);

  const loadBlobCapabilities = createBlobCapabilityLoader(validBoundary, async () => {
    loadCalls += 1;
    return { list() {}, get() {}, put() {} };
  });
  const capabilities = await loadBlobCapabilities();
  assert.deepEqual(Object.keys(capabilities).sort(), ['get', 'list', 'put']);
  assert.equal(loadCalls, 1);
});

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const uploaderPath = fileURLToPath(
  new URL('./upload-start-slice-private-media.mjs', import.meta.url),
);
const validationFile = (name) => fileURLToPath(new URL(`validation/${name}`, contentRoot));

const temporaryRoots = [];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function temporaryDirectory() {
  const root = await mkdtemp(join(tmpdir(), 'lb-final35-'));
  temporaryRoots.push(root);
  return root;
}

function runUploader(args) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [uploaderPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, VERCEL_OIDC_TOKEN: '', BLOB_STORE_ID: '' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

// Real signature bytes, so the fixtures exercise the same sniffing path as the
// immutable private package instead of a synthetic stand-in.
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const id3Magic = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const jpegBytes = (tag) => Buffer.concat([jpegMagic, Buffer.from(`jpeg-body:${tag}`)]);
const mp3Bytes = (tag) => Buffer.concat([id3Magic, Buffer.from(`mp3-body:${tag}`)]);
const pngBytes = (tag) => Buffer.concat([pngMagic, Buffer.from(`png-body:${tag}`)]);

// Builds an immutable-package-shaped fixture outside Git. The evidence files
// carry real SHA-256 values that the synthetic ledger anchors, so the loader
// exercises the exact hash-gated resolution path without the real private path.
async function buildFixturePackage({ spoofImageContentId } = {}) {
  const root = await temporaryDirectory();
  await mkdir(join(root, 'images'), { recursive: true });
  await mkdir(join(root, 'audio'), { recursive: true });

  const contentIds = [...new Set(sources.finalCandidates.assets.map((asset) => asset.contentId))];
  const images = [];
  const audio = [];
  const files = new Map();

  for (const contentId of contentIds) {
    const filename = `${contentId}-image-candidate.jpg`;
    const bytes = contentId === spoofImageContentId ? pngBytes(contentId) : jpegBytes(contentId);
    files.set(join(root, 'images', filename), bytes);
    images.push({ contentId, filename, bytes: bytes.byteLength, sha256: sha256(bytes) });

    for (const kind of ['word', 'sentence']) {
      const id = `${contentId}-${kind}`;
      const audioFilename = `${id}-candidate.mp3`;
      const audioBytes = mp3Bytes(id);
      files.set(join(root, 'audio', audioFilename), audioBytes);
      audio.push({
        id,
        kind,
        filename: audioFilename,
        bytes: audioBytes.byteLength,
        sha256: sha256(audioBytes),
      });
    }
  }

  const review = {};
  for (const contentId of contentIds) {
    for (const suffix of ['image', 'word', 'sentence'])
      review[`${contentId}-${suffix}`] = 'approve';
    review[`${contentId}-notes`] = '';
  }

  const generationManifest = { images, audio };
  const transcriptionQa = { task: 'LB-DS-055', exactMatches: 28, total: 30 };
  const humanReview = { task: 'LB-DS-055', review };

  for (const [path, bytes] of files) await writeFile(path, bytes);
  const manifestBuffer = Buffer.from(`${JSON.stringify(generationManifest, null, 2)}\n`);
  const transcriptionBuffer = Buffer.from(`${JSON.stringify(transcriptionQa, null, 2)}\n`);
  const reviewBuffer = Buffer.from(`${JSON.stringify(humanReview, null, 2)}\n`);
  await writeFile(join(root, 'generation-manifest.json'), manifestBuffer);
  await writeFile(join(root, 'audio-transcription-qa.json'), transcriptionBuffer);
  await writeFile(join(root, 'human-review-final.json'), reviewBuffer);

  const ledger = structuredClone(sources.ledger);
  ledger.candidateMedia.evidence = {
    manifestSha256: sha256(manifestBuffer),
    transcriptionQaSha256: sha256(transcriptionBuffer),
    humanReviewSha256: sha256(reviewBuffer),
  };
  return { root, ledger, generationManifest, humanReview, contentIds };
}

// Mirrors the repository content root outside Git. The 60 original files are
// re-generated with bytes that genuinely match their declared MIME type and
// recomputed checksums, so the preflight happy path is reachable without
// touching the repository or the real private package.
async function buildStagedContentRoot() {
  const root = await temporaryDirectory();
  await mkdir(join(root, 'validation'), { recursive: true });
  await mkdir(join(root, 'images'), { recursive: true });
  await mkdir(join(root, 'audio'), { recursive: true });

  const read = (name) => readFile(validationFile(name), 'utf8').then(JSON.parse);
  const v2Draft = await read('start-a1-v2-image-attachment-draft.json');
  const v1Draft = await read('start-a1-media-attachment-draft.json');
  const finalDraft = await read('start-a1-15-candidate-media-attachment-draft.json');
  const catalogSlice = await read('start-a1-35-catalog-slice.json');
  const manifest = await read('start-a1-35-final-media-manifest.json');
  const ledger = await read('start-a1-catalog-35-pending-provenance-ledger.json');

  for (const asset of v2Draft.assets) {
    const bytes = jpegBytes(asset.assetId);
    await writeFile(join(root, asset.localCandidate.relativePath), bytes);
    asset.localCandidate.bytes = bytes.byteLength;
    asset.localCandidate.sha256 = sha256(bytes);
  }
  for (const asset of v1Draft.assets.filter((candidate) => candidate.kind !== 'image')) {
    const bytes = mp3Bytes(asset.assetId);
    await writeFile(join(root, asset.localCandidate.relativePath), bytes);
    asset.localCandidate.bytes = bytes.byteLength;
    asset.localCandidate.sha256 = sha256(bytes);
  }

  const write = (name, value) =>
    writeFile(join(root, 'validation', name), `${JSON.stringify(value, null, 2)}\n`);
  await write('start-a1-v2-image-attachment-draft.json', v2Draft);
  await write('start-a1-media-attachment-draft.json', v1Draft);
  await write('start-a1-15-candidate-media-attachment-draft.json', finalDraft);
  await write('start-a1-35-catalog-slice.json', catalogSlice);
  await write('start-a1-35-final-media-manifest.json', manifest);
  await write('start-a1-catalog-35-pending-provenance-ledger.json', ledger);

  return { root, v2Draft, v1Draft };
}

const sources = await loadFinal35Sources();
const fixturePackage = await buildFixturePackage();
const finalPackage = await loadFinalPackage(fixturePackage.root, fixturePackage.ledger);
const selection = deriveFinal35Selection(sources, finalPackage);

let repoMediaRoot;
let stagedRoot;
let stagedSources;
let stagedSelection;

before(async () => {
  repoMediaRoot = await temporaryDirectory();
  for (const directory of ['images', 'audio']) {
    await mkdir(join(repoMediaRoot, directory), { recursive: true });
  }
  for (const asset of selection) {
    if (asset.sourceGeneration === 'final-15-candidate') continue;
    await cp(
      fileURLToPath(new URL(asset.relativePath, contentRoot)),
      join(repoMediaRoot, asset.relativePath),
    );
  }

  const staged = await buildStagedContentRoot();
  stagedRoot = staged.root;
  stagedSources = await loadFinal35Sources(stagedRoot);
  stagedSelection = deriveFinal35Selection(stagedSources, finalPackage);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test('the final-35 selection is an explicit mode that cannot be combined with the legacy modes', () => {
  assert.equal(parseMode([]), 'original-60');
  assert.equal(parseMode(['--v2-images']), 'v2-images');
  assert.equal(parseMode(['--final-35', '--execute']), 'final-35');
  assert.throws(() => parseMode(['--final-35', '--v2-images']), /exactly one|combine/i);

  assert.equal(extensionForMimeType('image/png'), 'png');
  assert.equal(extensionForMimeType('image/jpeg'), 'jpg');
  assert.equal(extensionForMimeType('audio/mpeg'), 'mp3');
  assert.throws(() => extensionForMimeType('image/webp'), /unsupported/i);
});

test('the final-35 mode requires an explicit absolute private package root', () => {
  assert.equal(parseFinalPackageRoot([]), undefined);
  assert.equal(parseFinalPackageRoot(['--final-35']), undefined);
  assert.equal(
    parseFinalPackageRoot(['--final-package-root', '/tmp/private-package']),
    '/tmp/private-package',
  );

  assert.throws(
    () => parseFinalPackageRoot(['--final-package-root', 'relative/private-package']),
    /absolute/i,
  );
  assert.throws(() => parseFinalPackageRoot(['--final-package-root']), /absolute|required/i);
  assert.throws(
    () => parseFinalPackageRoot(['--final-package-root', '--execute']),
    /absolute|required/i,
  );
});

test('the final-35 mode resolves exactly the committed 105 assets', () => {
  assert.equal(selection.length, 105);
  assert.equal(selection.length, sources.manifest.assets.length);

  const counts = selection.reduce((totals, asset) => {
    totals[asset.kind] = (totals[asset.kind] ?? 0) + 1;
    return totals;
  }, {});
  assert.deepEqual(counts, { image: 35, word_audio: 35, sentence_audio: 35 });

  const generationalCounts = selection.reduce((totals, asset) => {
    totals[asset.sourceGeneration] = (totals[asset.sourceGeneration] ?? 0) + 1;
    return totals;
  }, {});
  assert.deepEqual(generationalCounts, {
    'v2-image': 20,
    'v1-audio': 40,
    'final-15-candidate': 45,
  });

  assert.equal(new Set(selection.map((asset) => asset.assetId)).size, 105);
  assert.equal(new Set(selection.map((asset) => asset.storageKey)).size, 105);
  assert.equal(new Set(selection.map((asset) => asset.contentId)).size, 35);

  const committed = new Map(sources.manifest.assets.map((asset) => [asset.assetId, asset]));
  for (const asset of selection) {
    const record = committed.get(asset.assetId);
    assert.ok(record, `${asset.assetId} must exist in the committed final manifest`);
    assert.equal(asset.storageKey, record.storageKey);
    assert.equal(asset.kind, record.kind);
    assert.equal(asset.contentId, record.contentId);
    assert.equal(asset.expectedMimeType, record.expectedMimeType);
    const directory = asset.kind === 'image' ? 'images' : 'audio';
    if (asset.sourceGeneration === 'final-15-candidate') {
      assert.equal(asset.relativePath, `${directory}/${asset.sourceFilename}`);
    } else {
      assert.equal(
        asset.relativePath,
        `${directory}/${asset.assetId}.${extensionForMimeType(asset.expectedMimeType)}`,
      );
    }
  }
});

test('the final-35 selection keeps every current V2 image and never a superseded V1 image', () => {
  const superseded = new Set(sources.manifest.selection.supersededImageAssetIds);
  assert.equal(superseded.size, 20);

  assert.equal(sources.v2Images.assets.length, 20);
  const selectedImages = new Map(
    selection.filter((asset) => asset.kind === 'image').map((asset) => [asset.contentId, asset]),
  );

  for (const v2Image of sources.v2Images.assets) {
    const asset = selectedImages.get(v2Image.contentId);
    assert.equal(asset.assetId, v2Image.assetId);
    assert.equal(asset.assetVersion, 'v2');
    assert.equal(asset.sourceGeneration, 'v2-image');
    assert.equal(asset.relativePath, v2Image.localCandidate.relativePath);
    assert.equal(asset.expectedBytes, v2Image.localCandidate.bytes);
    assert.equal(asset.expectedSha256, v2Image.localCandidate.sha256);
    assert.ok(!superseded.has(asset.assetId));
  }

  const selectedIds = new Set(selection.map((asset) => asset.assetId));
  const v1ImageIds = sources.v1Media.assets
    .filter((asset) => asset.kind === 'image')
    .map((asset) => asset.assetId);
  assert.equal(v1ImageIds.length, 20);
  for (const assetId of v1ImageIds) {
    assert.ok(superseded.has(assetId));
    assert.ok(!selectedIds.has(assetId), `${assetId} must stay excluded from the final selection`);
  }
});

test('the final-35 selection takes exactly the 40 original V1 audio assets with their checksums', () => {
  const audio = selection.filter((asset) => asset.sourceGeneration === 'v1-audio');
  assert.equal(audio.length, 40);
  assert.equal(audio.filter((asset) => asset.kind === 'word_audio').length, 20);
  assert.equal(audio.filter((asset) => asset.kind === 'sentence_audio').length, 20);

  const v1Sources = new Map(
    sources.v1Media.assets
      .filter((asset) => asset.kind !== 'image')
      .map((asset) => [asset.assetId, asset]),
  );
  assert.equal(v1Sources.size, 40);

  for (const asset of audio) {
    const source = v1Sources.get(asset.assetId);
    assert.ok(source, `${asset.assetId} must come from the original V1 media draft`);
    assert.equal(asset.kind, source.kind);
    assert.equal(asset.expectedMimeType, source.localCandidate.mimeType);
    assert.equal(asset.expectedBytes, source.localCandidate.bytes);
    assert.equal(asset.expectedSha256, source.localCandidate.sha256);
    assert.equal(asset.relativePath, source.localCandidate.relativePath);
  }
});

test('the private package evidence files match the repository provenance ledger', async () => {
  const loaded = await loadFinalPackage(fixturePackage.root, fixturePackage.ledger);
  assert.equal(loaded.root, fixturePackage.root);
  assert.equal(loaded.generationManifest.images.length, 15);
  assert.equal(loaded.generationManifest.audio.length, 30);
  assert.equal(Object.keys(loaded.humanReview.review).length, 60);

  await assert.rejects(
    () => loadFinalPackage(fixturePackage.root, { candidateMedia: { evidence: {} } }),
    /evidence checksum/i,
  );

  const tamperedManifest = structuredClone(fixturePackage.ledger);
  tamperedManifest.candidateMedia.evidence.manifestSha256 = 'f'.repeat(64);
  await assert.rejects(
    () => loadFinalPackage(fixturePackage.root, tamperedManifest),
    /generation-manifest\.json/i,
  );

  const tamperedReview = structuredClone(fixturePackage.ledger);
  tamperedReview.candidateMedia.evidence.humanReviewSha256 = '0'.repeat(64);
  await assert.rejects(
    () => loadFinalPackage(fixturePackage.root, tamperedReview),
    /human-review-final\.json/i,
  );

  await assert.rejects(
    () => loadFinalPackage('relative/private-package', fixturePackage.ledger),
    /absolute/i,
  );
});

test('the private package must record exactly 45 approved human-review media entries', () => {
  assert.equal(
    assertHumanReviewApprovals(fixturePackage.humanReview, fixturePackage.ledger).length,
    45,
  );

  const rejected = structuredClone(fixturePackage.humanReview);
  rejected.review['start-a1-ei-image'] = 'reject';
  assert.throws(
    () => assertHumanReviewApprovals(rejected, fixturePackage.ledger),
    /must approve every media entry/i,
  );

  const missing = structuredClone(fixturePackage.humanReview);
  const droppedKey = Object.keys(missing.review).find((key) => key.endsWith('-sentence'));
  delete missing.review[droppedKey];
  assert.throws(() => assertHumanReviewApprovals(missing, fixturePackage.ledger), /exactly 45/i);

  const wrongLedger = structuredClone(fixturePackage.ledger);
  wrongLedger.candidateMedia.inventory.humanReviewApproved = 44;
  assert.throws(
    () => assertHumanReviewApprovals(fixturePackage.humanReview, wrongLedger),
    /human-review approvals/i,
  );
});

test('the final-35 selection resolves the 45 private-package files from the generation manifest', () => {
  const finalPackageAssets = selection.filter(
    (asset) => asset.sourceGeneration === 'final-15-candidate',
  );
  assert.equal(finalPackageAssets.length, 45);
  assert.equal(finalPackageAssets.filter((asset) => asset.kind === 'image').length, 15);

  const expected = new Map(
    fixturePackage.generationManifest.images.map((entry) => [entry.contentId, entry]),
  );
  for (const asset of finalPackageAssets) {
    assert.match(asset.sourceFilename, /^[\w-]+-candidate\.(?:jpg|mp3)$/);
    assert.ok(asset.expectedBytes > 0);
    assert.equal(asset.expectedSha256.length, 64);
    assert.equal(
      asset.relativePath,
      `${asset.kind === 'image' ? 'images' : 'audio'}/${asset.sourceFilename}`,
    );
    if (asset.kind === 'image') {
      assert.equal(asset.sourceFilename, expected.get(asset.contentId).filename);
      assert.equal(asset.expectedBytes, expected.get(asset.contentId).bytes);
      assert.equal(asset.expectedSha256, expected.get(asset.contentId).sha256);
    }
  }
});

test('the final-15 mapping requires a content and kind match and never falls back to a rejected file', () => {
  const asset = selection.find((entry) => entry.sourceGeneration === 'final-15-candidate');

  const unknownContent = structuredClone(fixturePackage.generationManifest);
  unknownContent.images = unknownContent.images.map((entry) =>
    entry.contentId === asset.contentId ? { ...entry, contentId: 'start-a1-unknown' } : entry,
  );
  assert.throws(() => resolveFinal15Source(asset, unknownContent), /exactly one|no candidate/i);

  const duplicateContent = structuredClone(fixturePackage.generationManifest);
  duplicateContent.images = [
    ...duplicateContent.images,
    { ...unknownContent.images[0], contentId: asset.contentId },
  ];
  assert.throws(() => resolveFinal15Source(asset, duplicateContent), /exactly one/i);

  const rejectedFile = structuredClone(fixturePackage.generationManifest);
  rejectedFile.images = rejectedFile.images.map((entry) =>
    entry.contentId === asset.contentId
      ? { ...entry, filename: `${asset.contentId}-image-rejected-19.jpg` }
      : entry,
  );
  assert.throws(() => resolveFinal15Source(asset, rejectedFile), /rejected/i);

  const escapingFile = structuredClone(fixturePackage.generationManifest);
  escapingFile.images = escapingFile.images.map((entry) =>
    entry.contentId === asset.contentId
      ? { ...entry, filename: `../rejected/${asset.contentId}-image-candidate.jpg` }
      : entry,
  );
  assert.throws(() => resolveFinal15Source(asset, escapingFile), /filename|rejected/i);

  const wrongExtension = structuredClone(fixturePackage.generationManifest);
  wrongExtension.images = wrongExtension.images.map((entry) =>
    entry.contentId === asset.contentId
      ? { ...entry, filename: `${asset.contentId}-image-candidate.png` }
      : entry,
  );
  assert.throws(() => resolveFinal15Source(asset, wrongExtension), /mime/i);

  const audioAsset = selection.find((entry) => entry.kind === 'word_audio');
  const mutatedKind = structuredClone(fixturePackage.generationManifest);
  mutatedKind.audio = mutatedKind.audio.map((entry) =>
    entry.id === `${audioAsset.contentId}-word` ? { ...entry, kind: 'sentence' } : entry,
  );
  assert.throws(() => resolveFinal15Source(audioAsset, mutatedKind), /exactly one|kind/i);
});

test('content signature sniffing recognises PNG, JPEG and MPEG audio only', () => {
  assert.equal(detectMediaSignature(pngBytes('a')), 'image/png');
  assert.equal(detectMediaSignature(jpegBytes('a')), 'image/jpeg');
  assert.equal(detectMediaSignature(Buffer.concat([id3Magic, Buffer.alloc(8)])), 'audio/mpeg');
  assert.equal(detectMediaSignature(Buffer.from([0xff, 0xfb, 0x90, 0x00])), 'audio/mpeg');
  assert.equal(detectMediaSignature(Buffer.from('stub:start-a1-apfel')), undefined);
  assert.equal(detectMediaSignature(Buffer.alloc(0)), undefined);

  assert.equal(
    assertMediaSignature(pngBytes('a'), 'image/png', 'start-a1-apfel-image-v2'),
    'image/png',
  );
  assert.equal(
    assertMediaSignature(jpegBytes('a'), 'image/jpeg', 'start-a1-apfel-image-v2'),
    'image/jpeg',
  );
  assert.throws(
    () => assertMediaSignature(jpegBytes('a'), 'image/png', 'start-a1-apfel-image-v2'),
    /declares image\/png but its content bytes are image\/jpeg/i,
  );
  assert.throws(
    () => assertMediaSignature(pngBytes('a'), 'image/jpeg', 'start-a1-ei-image-v1'),
    /declares image\/jpeg but its content bytes are image\/png/i,
  );
  assert.throws(
    () => assertMediaSignature(pngBytes('a'), 'audio/mpeg', 'start-a1-ei-word-audio-v1'),
    /declares audio\/mpeg but its content bytes are image\/png/i,
  );
  assert.throws(
    () => assertMediaSignature(Buffer.from('stub'), 'audio/mpeg', 'start-a1-ei-word-audio-v1'),
    /unrecognised/i,
  );
});

test('the final-35 selection rejects a manifest that drifted from its selection sources', () => {
  const driftedKey = structuredClone(sources.manifest);
  driftedKey.assets[0].storageKey = 'start-a1-apfel/image/v1';
  assert.throws(() => deriveFinal35Selection({ ...sources, manifest: driftedKey }), /drift|stale/i);

  const driftedKind = structuredClone(sources.manifest);
  driftedKind.assets[0].kind = 'word_audio';
  assert.throws(
    () => deriveFinal35Selection({ ...sources, manifest: driftedKind }),
    /drift|stale/i,
  );

  const reintroducedV1Image = structuredClone(sources.manifest);
  const superseded = sources.manifest.selection.supersededImageAssetIds[0];
  reintroducedV1Image.assets[0] = {
    ...reintroducedV1Image.assets.find((asset) => asset.assetId.endsWith('-image-v2')),
    assetId: superseded,
    storageKey: superseded.replace('-image-v1', '/image/v1'),
    assetVersion: 'v1',
  };
  assert.throws(
    () => deriveFinal35Selection({ ...sources, manifest: reintroducedV1Image }),
    /drift|stale/i,
  );
});

test('the final-35 selection rejects duplicated ids, keys, pathnames and counts', () => {
  assert.equal(assertFinal35SelectionIntegrity(selection), true);

  const duplicateId = [...selection.slice(0, 104), selection[0]];
  assert.throws(() => assertFinal35SelectionIntegrity(duplicateId), /asset id/i);

  const duplicateKey = structuredClone(selection);
  duplicateKey[1].storageKey = duplicateKey[0].storageKey;
  assert.throws(() => assertFinal35SelectionIntegrity(duplicateKey), /storage key/i);

  const duplicatePathname = structuredClone(selection);
  duplicatePathname[1].relativePath = duplicatePathname[0].relativePath;
  assert.throws(() => assertFinal35SelectionIntegrity(duplicatePathname), /path/i);

  const shortSelection = structuredClone(selection).slice(0, 104);
  assert.throws(() => assertFinal35SelectionIntegrity(shortSelection), /105/);

  const unknownKind = structuredClone(selection);
  unknownKind[0].kind = 'video';
  assert.throws(() => assertFinal35SelectionIntegrity(unknownKind), /kind/i);

  const wrongExtension = structuredClone(selection);
  const jpegImage = wrongExtension.find((asset) => asset.expectedMimeType === 'image/jpeg');
  jpegImage.relativePath = jpegImage.relativePath.replace(/\.jpg$/, '.png');
  assert.throws(() => assertFinal35SelectionIntegrity(wrongExtension), /mime|extension/i);
});

test('preflight validates every selected file and returns its destination pathname', async () => {
  const prepared = await preflightFinal35Assets(stagedSelection, {
    contentRoot: stagedRoot,
    packageRoot: fixturePackage.root,
  });
  assert.equal(prepared.length, 105);

  for (const asset of prepared) {
    assert.equal(
      asset.destinationPathname,
      destinationPathname(asset.storageKey, asset.expectedMimeType),
    );
    assert.match(
      asset.destinationPathname,
      /^learnbox-start\/start-a1-[\w-]+\/(?:image|word_audio|sentence_audio)\/v[12]\.(?:png|jpg|mp3)$/,
    );
    assert.equal(asset.sha256.length, 64);
    assert.ok(asset.bytes.byteLength > 0);
    if (asset.expectedBytes !== undefined)
      assert.equal(asset.bytes.byteLength, asset.expectedBytes);
    if (asset.expectedSha256 !== undefined) assert.equal(asset.sha256, asset.expectedSha256);
  }

  assert.equal(prepared.filter((asset) => asset.expectedSha256).length, 105);
});

test('preflight rejects a missing private-package file before any provider-ready asset exists', async () => {
  const root = await temporaryDirectory();
  await cp(fixturePackage.root, root, { recursive: true });
  const missing = stagedSelection.find((asset) => asset.sourceGeneration === 'final-15-candidate');
  await rm(join(root, missing.relativePath));

  await assert.rejects(
    () => preflightFinal35Assets(stagedSelection, { contentRoot: stagedRoot, packageRoot: root }),
    (error) =>
      error instanceof Error &&
      /missing/i.test(error.message) &&
      error.message.includes(missing.assetId),
  );
});

test('preflight rejects a byte-count or checksum mismatch', async () => {
  const shortRoot = await temporaryDirectory();
  await cp(stagedRoot, shortRoot, { recursive: true });
  const audio = stagedSelection.find((asset) => asset.sourceGeneration === 'v1-audio');
  const original = await readFile(join(shortRoot, audio.relativePath));
  await writeFile(
    join(shortRoot, audio.relativePath),
    original.subarray(0, original.byteLength - 1),
  );
  await assert.rejects(
    () =>
      preflightFinal35Assets(stagedSelection, {
        contentRoot: shortRoot,
        packageRoot: fixturePackage.root,
      }),
    (error) =>
      error instanceof Error &&
      /byte/i.test(error.message) &&
      error.message.includes(audio.assetId),
  );

  const tamperedRoot = await temporaryDirectory();
  await cp(stagedRoot, tamperedRoot, { recursive: true });
  const tampered = Buffer.from(original);
  tampered[0] ^= 0xff;
  await writeFile(join(tamperedRoot, audio.relativePath), tampered);
  await assert.rejects(
    () =>
      preflightFinal35Assets(stagedSelection, {
        contentRoot: tamperedRoot,
        packageRoot: fixturePackage.root,
      }),
    (error) =>
      error instanceof Error &&
      /sha256/i.test(error.message) &&
      error.message.includes(audio.assetId),
  );
});

test('preflight fails closed on a private-package MIME magic spoof', async () => {
  const spoofed = await buildFixturePackage({
    spoofImageContentId: sources.finalCandidates.assets[0].contentId,
  });
  const spoofedPackage = await loadFinalPackage(spoofed.root, spoofed.ledger);
  const spoofedSelection = deriveFinal35Selection(stagedSources, spoofedPackage);
  const spoofedAsset = spoofedSelection.find(
    (asset) =>
      asset.sourceGeneration === 'final-15-candidate' && asset.contentId === spoofed.contentIds[0],
  );

  await assert.rejects(
    () =>
      preflightFinal35Assets(spoofedSelection, {
        contentRoot: stagedRoot,
        packageRoot: spoofed.root,
      }),
    (error) =>
      error instanceof Error &&
      /declares image\/jpeg but its content bytes are image\/png/i.test(error.message) &&
      error.message.includes(spoofedAsset.assetId),
  );
});

test('preflight accepts the real repository selection as exactly 105 JPEG-real assets', async () => {
  const prepared = await preflightFinal35Assets(selection, {
    contentRoot: repoMediaRoot,
    packageRoot: fixturePackage.root,
  });
  assert.equal(prepared.length, 105);

  const v2Images = prepared.filter((asset) => asset.sourceGeneration === 'v2-image');
  assert.equal(v2Images.length, 20);
  for (const asset of v2Images) {
    // The corrected source truth: declared JPEG, stored as .jpg, real JPEG bytes.
    assert.equal(asset.expectedMimeType, 'image/jpeg');
    assert.match(asset.relativePath, /^images\/start-a1-[\w-]+-image-v2\.jpg$/);
    assert.match(asset.destinationPathname, /\/image\/v2\.jpg$/);
    assert.equal(detectMediaSignature(asset.bytes), 'image/jpeg');
  }
});

test('the final-35 mode refuses to run without an external private package root', async () => {
  const { code, output } = await runUploader(['--final-35']);
  assert.equal(code, 1);
  assert.match(output, /final-package-root/i);
  assert.doesNotMatch(output, /OIDC|attestation|@vercel\/blob/i);
  assert.doesNotMatch(output, /Uploaded private candidate|receipt written/i);
});

test('the final-35 dry run validates the external package before any provider capability load', async () => {
  const { code, output } = await runUploader([
    '--final-35',
    '--final-package-root',
    fixturePackage.root,
  ]);
  assert.equal(code, 1);
  assert.match(output, /evidence checksum/i);
  assert.doesNotMatch(output, /OIDC|attestation|@vercel\/blob/i);
  assert.doesNotMatch(output, /Uploaded private candidate|receipt written/i);
});

// ---------------------------------------------------------------------------
// Post-upload verification and resume semantics
// ---------------------------------------------------------------------------

const receiptAssetKeys = [
  'assetId',
  'contentId',
  'etag',
  'kind',
  'mimeType',
  'pathname',
  'qaStatus',
  'resumed',
  'sha256',
  'size',
  'storageKey',
  'verifiedBy',
].sort();

function fakeAsset(index) {
  const assetId = `fake-asset-${index}`;
  const bytes = mp3Bytes(assetId);
  return {
    assetId,
    contentId: `fake-item-${index}`,
    kind: 'word_audio',
    storageKey: `fake/${assetId}/word_audio/v1`,
    mimeType: 'audio/mpeg',
    bytes,
    sha256: sha256(bytes),
    destinationPathname: `learnbox-start/fake/${assetId}.mp3`,
  };
}

const fakeAssets = (count) => Array.from({ length: count }, (_, index) => fakeAsset(index));

// Small chunks on purpose: a buffering implementation would still pass a
// single-chunk stream, so verification is exercised the way the SDK delivers it.
function chunkedStream(bytes, chunkSize = 7) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + chunkSize)));
      offset += chunkSize;
    },
  });
}

function fakePrivateStore({ objects = new Map(), failPutAt, failPutMessage } = {}) {
  const state = {
    get: 0,
    put: 0,
    list: 0,
    maxInFlight: 0,
    inFlight: 0,
    getOptions: [],
    putOptions: [],
  };
  const track = async (operation) => {
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    try {
      return await operation();
    } finally {
      state.inFlight -= 1;
    }
  };

  const capabilities = {
    async list() {
      state.list += 1;
      return {
        hasMore: false,
        blobs: [...objects.keys()].sort().map((pathname) => ({
          pathname,
          size: objects.get(pathname).byteLength,
        })),
      };
    },
    async put(pathname, bytes, options) {
      state.put += 1;
      state.putOptions.push(options);
      return track(async () => {
        if (state.put === failPutAt) throw new Error(failPutMessage ?? `put failed: ${pathname}`);
        objects.set(pathname, Buffer.from(bytes));
        return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}` };
      });
    },
    async get(pathname, options) {
      state.get += 1;
      state.getOptions.push(options);
      return track(async () => {
        const bytes = objects.get(pathname);
        if (!bytes) return null;
        const etag = `"etag-${sha256(bytes).slice(0, 12)}"`;
        return {
          statusCode: 200,
          stream: chunkedStream(bytes),
          headers: new Headers({ etag }),
          blob: { pathname, etag, size: bytes.byteLength },
        };
      });
    },
  };

  return { capabilities, objects, state };
}

const runOptions = (store, prepared) => ({
  prepared,
  batchId: 'fake-batch',
  mode: 'oidc',
  authentication: { oidcToken: 'fake-oidc-token', storeId: 'fake-store-id' },
  capabilities: store.capabilities,
});

test('private objects are downloaded with cache disabled and stream-hashed', async () => {
  const asset = fakeAsset(0);
  const store = fakePrivateStore({
    objects: new Map([[asset.destinationPathname, Buffer.from(asset.bytes)]]),
  });

  const verified = await verifyStoredPrivateObject(
    asset,
    store.capabilities.get,
    runOptions(store, [asset]).authentication,
  );
  assert.equal(verified.size, asset.bytes.byteLength);
  assert.equal(verified.sha256, asset.sha256);
  assert.match(verified.etag, /^"etag-/);
  assert.equal(store.state.getOptions[0].access, 'private');
  assert.equal(store.state.getOptions[0].useCache, false);
});

test('a same-length tampered object fails verification', async () => {
  const asset = fakeAsset(0);
  const tampered = Buffer.from(asset.bytes);
  tampered[tampered.byteLength - 1] ^= 0xff;
  assert.equal(tampered.byteLength, asset.bytes.byteLength);

  const store = fakePrivateStore({
    objects: new Map([[asset.destinationPathname, tampered]]),
  });
  await assert.rejects(
    () => verifyStoredPrivateObject(asset, store.capabilities.get, {}),
    /sha256/i,
  );
});

test('a truncated, missing or streamless object fails verification', async () => {
  const asset = fakeAsset(0);
  const truncated = fakePrivateStore({
    objects: new Map([[asset.destinationPathname, asset.bytes.subarray(1)]]),
  });
  await assert.rejects(
    () => verifyStoredPrivateObject(asset, truncated.capabilities.get, {}),
    /bytes/i,
  );

  const empty = fakePrivateStore();
  await assert.rejects(
    () => verifyStoredPrivateObject(asset, empty.capabilities.get, {}),
    /download/i,
  );

  await assert.rejects(
    () =>
      verifyStoredPrivateObject(
        asset,
        async () => ({ statusCode: 304, stream: null, headers: new Headers(), blob: {} }),
        {},
      ),
    /download/i,
  );
});

test('stream hashing reads an unbuffered async iterable and never buffers the object', async () => {
  const bytes = Buffer.from('streamed-private-media-bytes');
  let chunksRead = 0;
  const stream = {
    async *[Symbol.asyncIterator]() {
      for (let offset = 0; offset < bytes.byteLength; offset += 5) {
        chunksRead += 1;
        yield new Uint8Array(bytes.subarray(offset, offset + 5));
      }
    },
  };

  const hashed = await hashPrivateStream(stream);
  assert.equal(hashed.sha256, sha256(bytes));
  assert.equal(hashed.byteLength, bytes.byteLength);
  assert.equal(chunksRead, Math.ceil(bytes.byteLength / 5));
});

test('a rerun hashes every object the store already holds before any success claim', async () => {
  const prepared = fakeAssets(105);
  const store = fakePrivateStore({
    objects: new Map(
      prepared.map((asset) => [asset.destinationPathname, Buffer.from(asset.bytes)]),
    ),
  });

  const receipt = await uploadVerifiedSelection(runOptions(store, prepared));
  assert.equal(store.state.put, 0);
  assert.equal(store.state.get, prepared.length);
  assert.equal(receipt.assets.length, prepared.length);
  assert.equal(receipt.assets.filter((asset) => asset.resumed).length, prepared.length);
  for (const asset of receipt.assets) {
    assert.equal(asset.verifiedBy, 'download-sha256');
    assert.equal(asset.size, fakeAsset(Number(asset.assetId.split('-').pop())).bytes.byteLength);
  }
});

test('a completed selection is verified with bounded concurrency and a URL-free receipt', async () => {
  const prepared = fakeAssets(105);
  const store = fakePrivateStore();

  const receipt = await uploadVerifiedSelection(runOptions(store, prepared));
  const serialized = JSON.stringify(receipt);

  assert.equal(store.state.put, prepared.length);
  assert.equal(store.state.get, prepared.length);
  assert.ok(store.state.maxInFlight <= privateUploadConcurrency, 'concurrency must stay bounded');
  assert.ok(store.state.maxInFlight > 1, 'verification must not be forced serial');
  assert.equal(privateUploadConcurrency, 4);
  assert.equal(
    store.state.getOptions.every((options) => options.useCache === false),
    true,
  );

  assert.equal(receipt.state, 'private_upload_complete_not_attached');
  assert.equal(receipt.publicationBlocked, true);
  assert.equal(receipt.authentication, 'oidc');
  assert.equal(receipt.batchId, 'fake-batch');
  assert.deepEqual(receipt.verification, {
    method: 'download-sha256',
    verifiedAssetCount: 105,
    cacheDisabled: true,
  });

  assert.equal(receipt.assets.length, 105);
  for (const [index, asset] of receipt.assets.entries()) {
    const local = fakeAsset(index);
    assert.deepEqual(Object.keys(asset).sort(), receiptAssetKeys);
    assert.equal(asset.pathname, local.destinationPathname);
    assert.equal(asset.size, local.bytes.byteLength);
    assert.equal(asset.sha256, local.sha256);
    assert.equal(asset.verifiedBy, 'download-sha256');
    assert.equal(asset.resumed, false);
    assert.equal(typeof asset.etag, 'string');
  }
  assert.doesNotMatch(serialized, /https?:\/\/|blob\.vercel-storage|downloadUrl|"url"/i);
});

test('a partial put failure produces no receipt and the rerun re-hashes what it left behind', async () => {
  const prepared = fakeAssets(8);
  const objects = new Map();
  const failing = fakePrivateStore({ objects, failPutAt: 5 });
  await assert.rejects(() => uploadVerifiedSelection(runOptions(failing, prepared)), /put failed/);

  // In-flight workers from the aborted run finish their own writes; settle them
  // before the rerun lists the store.
  await new Promise((resolve) => setTimeout(resolve, 25));
  const partial = objects.size;
  assert.ok(partial >= 1 && partial < prepared.length, `partial store held ${partial} objects`);

  const resumed = fakePrivateStore({ objects });
  const receipt = await uploadVerifiedSelection(runOptions(resumed, prepared));
  assert.equal(resumed.state.get, prepared.length, 'every stored object must be download-hashed');
  assert.equal(resumed.state.put, prepared.length - partial);
  assert.equal(receipt.assets.length, prepared.length);
  assert.equal(receipt.assets.filter((asset) => asset.resumed).length, partial);
});

test('a put conflict is fatal instead of being matched to a success', async () => {
  const [asset] = fakeAssets(1);
  const objects = new Map([[asset.destinationPathname, Buffer.from(asset.bytes)]]);
  const racing = fakePrivateStore({
    objects: new Map(),
    failPutAt: 1,
    failPutMessage: 'Vercel Blob: A blob with the given pathname already exists.',
  });

  // The put raced a concurrent writer: the list was still empty, so this must fail
  // rather than claim the object was verified.
  await assert.rejects(
    () => uploadVerifiedSelection(runOptions(racing, [asset])),
    /already exists/i,
  );

  const rerun = fakePrivateStore({ objects });
  const receipt = await uploadVerifiedSelection(runOptions(rerun, [asset]));
  assert.equal(rerun.state.put, 0);
  assert.equal(rerun.state.get, 1);
  assert.equal(receipt.assets[0].resumed, true);
  assert.equal(receipt.assets[0].sha256, asset.sha256);
});

test('objects outside this selection fail closed in the dedicated store', async () => {
  const prepared = fakeAssets(4);
  const objects = new Map(
    prepared.map((asset) => [asset.destinationPathname, Buffer.from(asset.bytes)]),
  );
  objects.set('learnbox-start/legacy/image/v1.png', Buffer.from('foreign-object'));

  const store = fakePrivateStore({ objects });
  await assert.rejects(
    () => uploadVerifiedSelection(runOptions(store, prepared)),
    /outside this selection/i,
  );
  assert.equal(store.state.put, 0, 'a foreign object must stop the run before any write');
  assert.equal(store.state.get, 0);
});

test('a stored object with the right pathname but wrong bytes fails the run', async () => {
  const prepared = fakeAssets(2);
  const tampered = Buffer.from(prepared[1].bytes);
  tampered[0] = 0x00;
  tampered[1] = tampered[1] === 0x00 ? 0x01 : tampered[1];

  const objects = new Map([
    [prepared[0].destinationPathname, Buffer.from(prepared[0].bytes)],
    [prepared[1].destinationPathname, tampered],
  ]);
  await assert.rejects(
    () => uploadVerifiedSelection(runOptions(fakePrivateStore({ objects }), prepared)),
    /sha256/i,
  );
});

// ---------------------------------------------------------------------------
// Attestation write mode against the receipt contract
// ---------------------------------------------------------------------------

const attestationPath = validationFile('start-a1-v2-images-private-media-attestation.json');
const attestationBuilderPath = fileURLToPath(
  new URL('./build-start-private-media-attestation.mjs', import.meta.url),
);

// The LB-DS-073 receipt contract: one record per verified object describing the
// downloaded pathname, MIME type, byte count, checksum and verification method.
// It carries no URL at all, so the attestation builder must not depend on one.
function downloadedShaReceipt(draft, mutateReceipt = () => {}) {
  return {
    batchId: draft.batchId,
    state: 'private_upload_complete_not_attached',
    publicationBlocked: true,
    authentication: 'oidc',
    verification: {
      method: 'download-sha256',
      verifiedAssetCount: draft.assets.length,
      cacheDisabled: true,
    },
    assets: draft.assets.map((asset) => {
      const record = {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        storageKey: asset.storageKey,
        pathname: destinationPathname(asset.storageKey, asset.localCandidate.mimeType),
        mimeType: asset.localCandidate.mimeType,
        size: asset.localCandidate.bytes,
        sha256: asset.localCandidate.sha256,
        etag: `"etag-${asset.localCandidate.sha256.slice(0, 12)}"`,
        verifiedBy: 'download-sha256',
        qaStatus: 'approved',
        resumed: false,
      };
      mutateReceipt(record);
      return record;
    }),
  };
}

const readV2Draft = () =>
  readFile(validationFile('start-a1-v2-image-attachment-draft.json'), 'utf8').then(JSON.parse);

async function writeReceipt(receipt) {
  const path = join(await temporaryDirectory(), 'receipt.json');
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return path;
}

function runAttestationBuilder(receiptPath) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [attestationBuilderPath, '--v2-images', '--write'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        VERCEL_OIDC_TOKEN: '',
        BLOB_STORE_ID: '',
        LEARNBOX_PRIVATE_MEDIA_RECEIPT_PATH: receiptPath ?? '',
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

test('attestation write mode accepts the URL-free downloaded-SHA receipt', async () => {
  const receipt = downloadedShaReceipt(await readV2Draft());
  assert.doesNotMatch(JSON.stringify(receipt), /https?:\/\/|"url"|blob\.vercel-storage/i);

  const before = await readFile(attestationPath, 'utf8');
  const { code, output } = await runAttestationBuilder(await writeReceipt(receipt));
  assert.equal(code, 0, output);
  assert.doesNotMatch(output, /OIDC|@vercel\/blob|Uploaded private candidate|receipt written/i);

  const written = await readFile(attestationPath, 'utf8');
  try {
    assert.equal(written, before, 'write mode must reproduce the committed attestation exactly');
    const attestation = JSON.parse(written);
    assert.equal(attestation.state, 'private_storage_verified_not_attached');
    assert.equal(attestation.publicationBlocked, true);
    assert.equal(attestation.storage.receiptContainsNoUrls, true);
    assert.deepEqual(attestation.requiredBeforeAttachment, [
      'server_session_authorization',
      'owner_release_approval',
      'participant_invitation_approval',
    ]);
    assert.equal(attestation.assets.length, 20);
    for (const asset of attestation.assets) {
      const uploaded = receipt.assets.find((entry) => entry.assetId === asset.assetId);
      assert.equal(asset.pathname, `learnbox-start/${asset.storageKey}.jpg`);
      assert.equal(asset.bytes, uploaded.size);
      assert.equal(asset.sha256, uploaded.sha256);
      assert.equal(asset.attachmentStatus, 'verified_private_storage_not_attached');
    }
    assert.doesNotMatch(written, /https?:\/\/|"url"|"attached"|learnerExposure/);
  } finally {
    await writeFile(attestationPath, before);
  }
});

test('attestation write mode rejects a legacy URL-only receipt', async () => {
  const urlOnly = downloadedShaReceipt(await readV2Draft(), (record) => {
    record.url = `https://store.private.blob.vercel-storage.com/${record.pathname}`;
    delete record.verifiedBy;
    delete record.size;
    delete record.sha256;
  });

  const before = await readFile(attestationPath, 'utf8');
  const { code, output } = await runAttestationBuilder(await writeReceipt(urlOnly));
  assert.notEqual(code, 0, 'a URL-only receipt must never produce a verified attestation');
  assert.doesNotMatch(output, /Uploaded private candidate|attestation written/i);
  assert.equal(await readFile(attestationPath, 'utf8'), before);
});

test('attestation write mode rejects a receipt whose download verification does not match', async () => {
  const v2Draft = await readV2Draft();
  const cases = [
    ['a missing verification method', (record) => delete record.verifiedBy],
    ['an unverified size', (record) => delete record.size],
    ['a mismatched checksum', (record) => (record.sha256 = 'f'.repeat(64))],
    ['a stale pathname', (record) => (record.pathname = record.pathname.replace(/\.jpg$/, '.png'))],
    ['a PNG MIME type', (record) => (record.mimeType = 'image/png')],
  ];

  const before = await readFile(attestationPath, 'utf8');
  for (const [label, mutate] of cases) {
    const receipt = downloadedShaReceipt(v2Draft);
    mutate(receipt.assets[0]);
    const { code } = await runAttestationBuilder(await writeReceipt(receipt));
    assert.notEqual(code, 0, `${label} must be rejected`);
  }
  assert.equal(await readFile(attestationPath, 'utf8'), before);
});
