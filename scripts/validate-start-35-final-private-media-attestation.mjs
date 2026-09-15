import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const manifestUrl = new URL('validation/start-a1-35-final-media-manifest.json', contentRoot);
const attestationUrl = new URL(
  'validation/start-a1-35-final-private-media-attestation.json',
  contentRoot,
);

const expectedManifestBoundary = {
  state: 'prepared_awaiting_private_upload',
  publicationBlocked: true,
  attachmentAllowed: false,
  uploadPerformed: false,
  urlsIncluded: false,
  privatePackageInRepo: false,
  learnerExposure: false,
};

const expectedKindMime = {
  image: new Set(['image/jpeg']),
  word_audio: new Set(['audio/mpeg']),
  sentence_audio: new Set(['audio/mpeg']),
};
const extensionMime = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
};

function fail(message) {
  throw new Error(`START_35_FINAL_PRIVATE_MEDIA_ATTESTATION_INVALID: ${message}`);
}

export function assertStart35FinalPrivateMediaAttestation(attestation, manifest) {
  for (const [key, value] of Object.entries(expectedManifestBoundary)) {
    if (manifest[key] !== value) fail(`canonical manifest ${key} must remain ${value}`);
  }
  if (attestation.batchId !== manifest.batchId)
    fail('batch id must match the canonical final manifest');
  if (attestation.state !== 'private_storage_verified_not_attached')
    fail('state must remain not attached');
  if (attestation.publicationBlocked !== true) fail('publication must remain blocked');
  if (!Array.isArray(attestation.assets) || attestation.assets.length !== 105)
    fail('must contain exactly 105 assets');

  const expected = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));
  if (expected.size !== 105) fail('canonical manifest must contain exactly 105 unique assets');
  const seen = new Set();
  const seenDeliveryKeys = new Set();
  for (const asset of attestation.assets) {
    if (!asset || typeof asset !== 'object') fail('asset must be an object');
    if (seen.has(asset.assetId)) fail(`duplicate asset id ${asset.assetId}`);
    seen.add(asset.assetId);
    const source = expected.get(asset.assetId);
    if (!source) fail(`unexpected asset ${asset.assetId}`);
    for (const key of ['contentId', 'kind', 'storageKey']) {
      if (asset[key] !== source[key])
        fail(`${asset.assetId} ${key} does not match canonical manifest`);
    }
    const deliveryKey = `${asset.contentId}:${asset.kind}`;
    if (seenDeliveryKeys.has(deliveryKey)) fail(`duplicate delivery key ${deliveryKey}`);
    seenDeliveryKeys.add(deliveryKey);
    if (asset.mimeType !== source.expectedMimeType) {
      fail(`${asset.assetId} MIME type does not match canonical manifest`);
    }
    if (asset.attachmentStatus !== 'verified_private_storage_not_attached') {
      fail(`${asset.assetId} has an invalid attachment status`);
    }
    if (
      !Number.isInteger(asset.bytes) ||
      asset.bytes <= 0 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '')
    ) {
      fail(`${asset.assetId} has invalid byte or checksum evidence`);
    }
    if (!expectedKindMime[asset.kind]?.has(asset.mimeType))
      fail(`${asset.assetId} has an invalid MIME type`);
    const extension = /\.([a-z0-9]+)$/.exec(asset.pathname ?? '')?.[1];
    if (!extension || extensionMime[extension] !== asset.mimeType)
      fail(`${asset.assetId} pathname and MIME type disagree`);
    if (asset.pathname !== `learnbox-start/${asset.storageKey}.${extension}`) {
      fail(`${asset.assetId} pathname does not derive from its storage key`);
    }
  }
  if (seen.size !== expected.size) fail('missing canonical assets');
  return true;
}

export async function validateStart35FinalPrivateMediaAttestation() {
  const [attestation, manifest] = await Promise.all([
    readFile(attestationUrl, 'utf8').then(JSON.parse),
    readFile(manifestUrl, 'utf8').then(JSON.parse),
  ]);
  assertStart35FinalPrivateMediaAttestation(attestation, manifest);
  console.info(
    'START_35_FINAL_PRIVATE_MEDIA_ATTESTATION_OK assets=105 state=private_storage_verified_not_attached publication_blocked=true',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35FinalPrivateMediaAttestation();
}
