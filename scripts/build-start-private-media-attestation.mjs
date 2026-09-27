import { readFile, writeFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const v2Images = process.argv.includes('--v2-images');
const draftFile = new URL(
  v2Images
    ? 'validation/start-a1-v2-image-attachment-draft.json'
    : 'validation/start-a1-media-attachment-draft.json',
  contentRoot,
);
const outputFile = new URL(
  v2Images
    ? 'validation/start-a1-v2-images-private-media-attestation.json'
    : 'validation/start-a1-private-media-attestation.json',
  contentRoot,
);
const draft = JSON.parse(await readFile(draftFile, 'utf8'));
const shouldWrite = process.argv.includes('--write');

if (draft.state !== 'ready_for_private_storage_not_attached' || !draft.publicationBlocked) {
  throw new Error('A blocked private-storage attachment draft is required.');
}

const verificationMethod = 'download-sha256';
const extensionByMimeType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'audio/mpeg': 'mp3' };
const mimeTypeByExtension = {
  jpg: 'image/jpeg',
  png: 'image/png',
  mp3: 'audio/mpeg',
};

function extensionOf(pathname) {
  return pathname.slice(pathname.lastIndexOf('.') + 1);
}

function expectedAsset(asset) {
  const extension = extensionByMimeType[asset.localCandidate.mimeType];
  if (!extension) {
    throw new Error(`Unsupported private-media MIME type ${asset.localCandidate.mimeType}.`);
  }
  return {
    assetId: asset.assetId,
    contentId: asset.contentId,
    kind: asset.kind,
    storageKey: asset.storageKey,
    pathname: `learnbox-start/${asset.storageKey}.${extension}`,
    bytes: asset.localCandidate.bytes,
    sha256: asset.localCandidate.sha256,
    attachmentStatus: 'verified_private_storage_not_attached',
  };
}

const expected = {
  batchId: draft.batchId,
  state: 'private_storage_verified_not_attached',
  publicationBlocked: true,
  storage: {
    provider: 'vercel_blob',
    access: 'private',
    authentication: 'oidc',
    receiptContainsNoUrls: true,
  },
  requiredBeforeAttachment: [
    'server_session_authorization',
    'owner_release_approval',
    'participant_invitation_approval',
  ],
  assets: draft.assets.map(expectedAsset),
};

if (shouldWrite) {
  const receiptPath = process.env.LEARNBOX_PRIVATE_MEDIA_RECEIPT_PATH;
  if (!receiptPath) {
    throw new Error('LEARNBOX_PRIVATE_MEDIA_RECEIPT_PATH باید فقط روی همین دستگاه تعیین شود.');
  }

  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (
    receipt.state !== 'private_upload_complete_not_attached' ||
    !receipt.publicationBlocked ||
    receipt.authentication !== 'oidc' ||
    receipt.verification?.method !== verificationMethod ||
    receipt.batchId !== draft.batchId
  ) {
    throw new Error('رسید بارگذاری خصوصی با مرز انتشار LearnBox سازگار نیست.');
  }

  const receiptById = new Map(receipt.assets.map((asset) => [asset.assetId, asset]));
  if (
    receiptById.size !== expected.assets.length ||
    receipt.assets.length !== expected.assets.length
  ) {
    throw new Error(`رسید بارگذاری خصوصی باید دقیقاً ${expected.assets.length} رسانه را پوشش دهد.`);
  }

  // The receipt is the downloaded-byte verification record: the pathname, MIME
  // type, byte count and SHA-256 of every object as re-read from private storage,
  // plus the verification method. It deliberately carries no storage URL, so this
  // builder never depends on one and never touches the provider or a card.
  for (const asset of expected.assets) {
    const uploaded = receiptById.get(asset.assetId);
    if (
      !uploaded ||
      uploaded.pathname !== asset.pathname ||
      uploaded.mimeType !== mimeTypeByExtension[extensionOf(asset.pathname)] ||
      uploaded.size !== asset.bytes ||
      uploaded.sha256 !== asset.sha256 ||
      uploaded.verifiedBy !== verificationMethod
    ) {
      throw new Error(`رسید خصوصی ${asset.assetId} با اثرانگشت یا مسیر مورد انتظار مطابقت ندارد.`);
    }
  }

  await writeFile(outputFile, `${JSON.stringify(expected, null, 2)}\n`);
  console.info('Private Start media attestation written without storage URLs or card attachment.');
  process.exit(0);
}

const existing = await readFile(outputFile, 'utf8');
const serialized = `${JSON.stringify(expected, null, 2)}\n`;
if (existing !== serialized) {
  throw new Error('Private Start media attestation is stale or incomplete.');
}

console.info('Private Start media attestation is current and remains card-attachment-blocked.');
