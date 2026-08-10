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

function expectedAsset(asset) {
  const extension = asset.localCandidate.mimeType === 'image/png' ? 'png' : 'mp3';
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

  for (const asset of expected.assets) {
    const uploaded = receiptById.get(asset.assetId);
    if (
      !uploaded ||
      uploaded.pathname !== asset.pathname ||
      uploaded.sha256 !== asset.sha256 ||
      uploaded.mimeType !== (asset.kind === 'image' ? 'image/png' : 'audio/mpeg') ||
      !/^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//.test(uploaded.url)
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
