import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { assertStart35FinalPrivateMediaAttestation } from './validate-start-35-final-private-media-attestation.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const manifestUrl = new URL('validation/start-a1-35-final-media-manifest.json', contentRoot);
const outputUrl = new URL(
  'validation/start-a1-35-final-private-media-attestation.json',
  contentRoot,
);
const expectedReceipt = {
  batchId: 'learnbox-start-a1-35-final-media-v1',
  state: 'private_upload_complete_not_attached',
  publicationBlocked: true,
  authentication: 'oidc',
  verificationMethod: 'download-sha256',
  verifiedAssetCount: 105,
};

function fail(message) {
  throw new Error(`START_35_FINAL_PRIVATE_MEDIA_BUILD_REJECTED: ${message}`);
}

export function buildStart35FinalPrivateMediaAttestation(manifest, receipt) {
  if (
    receipt.batchId !== expectedReceipt.batchId ||
    receipt.state !== expectedReceipt.state ||
    receipt.publicationBlocked !== true ||
    receipt.authentication !== expectedReceipt.authentication ||
    receipt.verification?.method !== expectedReceipt.verificationMethod ||
    receipt.verification?.verifiedAssetCount !== expectedReceipt.verifiedAssetCount ||
    receipt.verification?.cacheDisabled !== true
  )
    fail('receipt state, identity, or verification boundary is invalid');
  if (!Array.isArray(receipt.assets) || receipt.assets.length !== 105)
    fail('receipt must contain exactly 105 assets');

  const receiptById = new Map(receipt.assets.map((asset) => [asset.assetId, asset]));
  if (receiptById.size !== 105) fail('receipt asset IDs must be unique');
  const assets = manifest.assets.map((source) => {
    const uploaded = receiptById.get(source.assetId);
    if (!uploaded) fail(`receipt is missing ${source.assetId}`);
    for (const key of ['contentId', 'kind', 'storageKey']) {
      if (uploaded[key] !== source[key])
        fail(`${source.assetId} ${key} differs from canonical manifest`);
    }
    if (uploaded.mimeType !== source.expectedMimeType) {
      fail(`${source.assetId} MIME type differs from canonical manifest`);
    }
    if (
      uploaded.verifiedBy !== expectedReceipt.verificationMethod ||
      uploaded.qaStatus !== 'approved'
    ) {
      fail(`${source.assetId} lacks verified approved evidence`);
    }
    return {
      assetId: source.assetId,
      contentId: source.contentId,
      kind: source.kind,
      storageKey: source.storageKey,
      pathname: uploaded.pathname,
      mimeType: uploaded.mimeType,
      bytes: uploaded.size,
      sha256: uploaded.sha256,
      attachmentStatus: 'verified_private_storage_not_attached',
    };
  });
  if (receiptById.size !== manifest.assets.length) fail('receipt has unexpected assets');
  const attestation = {
    batchId: manifest.batchId,
    state: 'private_storage_verified_not_attached',
    publicationBlocked: true,
    requiredBeforeAttachment: [
      'server_session_authorization',
      'owner_release_approval',
      'participant_invitation_approval',
    ],
    assets,
  };
  assertStart35FinalPrivateMediaAttestation(attestation, manifest);
  return attestation;
}

export async function writeStart35FinalPrivateMediaAttestation({
  receiptPath,
  write = false,
} = {}) {
  if (!receiptPath) fail('LEARNBOX_PRIVATE_MEDIA_RECEIPT_PATH is required only on this machine');
  const [manifest, receipt] = await Promise.all([
    readFile(manifestUrl, 'utf8').then(JSON.parse),
    readFile(receiptPath, 'utf8').then(JSON.parse),
  ]);
  const attestation = buildStart35FinalPrivateMediaAttestation(manifest, receipt);
  const serialized = `${JSON.stringify(attestation, null, 2)}\n`;
  if (write) {
    await writeFile(outputUrl, serialized);
    console.info(
      'START_35_FINAL_PRIVATE_MEDIA_ATTESTATION_WRITTEN assets=105 attachment=recorded publication=blocked',
    );
  } else if ((await readFile(outputUrl, 'utf8')) !== serialized) {
    fail('committed final attestation is stale or does not match the verified local receipt');
  } else {
    console.info(
      'START_35_FINAL_PRIVATE_MEDIA_ATTESTATION_CURRENT assets=105 attachment=recorded publication=blocked',
    );
  }
  return attestation;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeStart35FinalPrivateMediaAttestation({
    receiptPath: process.env.LEARNBOX_PRIVATE_MEDIA_RECEIPT_PATH,
    write: process.argv.includes('--write'),
  });
}
