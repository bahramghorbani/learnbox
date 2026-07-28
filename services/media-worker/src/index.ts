export type MediaAssetKind = 'image' | 'word_audio' | 'sentence_audio';

export interface PlannedMediaReceipt {
  assetId: string;
  contentId: string;
  kind: MediaAssetKind;
  storageKey: string;
}

export interface ReceivedMediaAsset extends PlannedMediaReceipt {
  url: string;
  mimeType: string;
  sha256: string;
  qaStatus: 'approved' | 'rejected' | 'pending';
}

export interface MediaReceiptValidation {
  readyForAttachment: boolean;
  issues: string[];
}

const sha256 = /^[a-f0-9]{64}$/;
const mimeTypes: Readonly<Record<MediaAssetKind, readonly string[]>> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  word_audio: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  sentence_audio: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
};

/**
 * Checks a received asset manifest against the non-executable production plan. Passing this check
 * merely makes an asset eligible for a separate attachment and editorial release decision.
 */
export function validateMediaReceipt(
  plannedAssets: ReadonlyArray<PlannedMediaReceipt>,
  receivedAssets: ReadonlyArray<ReceivedMediaAsset>,
): MediaReceiptValidation {
  const issues: string[] = [];
  const plannedById = new Map(plannedAssets.map((asset) => [asset.assetId, asset]));
  const receivedIds = new Set<string>();

  if (receivedAssets.length !== plannedAssets.length) {
    issues.push('تعداد رسانه‌های دریافت‌شده با برنامهٔ تأییدشده برابر نیست.');
  }

  for (const asset of receivedAssets) {
    if (receivedIds.has(asset.assetId)) {
      issues.push(`رسانهٔ ${asset.assetId} بیش از یک‌بار تحویل شده است.`);
      continue;
    }
    receivedIds.add(asset.assetId);
    const planned = plannedById.get(asset.assetId);
    if (!planned) {
      issues.push(`رسانهٔ ${asset.assetId} در برنامهٔ تولید وجود ندارد.`);
      continue;
    }
    if (
      asset.contentId !== planned.contentId ||
      asset.kind !== planned.kind ||
      asset.storageKey !== planned.storageKey
    ) {
      issues.push(`شناسه یا مسیر نسخهٔ رسانهٔ ${asset.assetId} با برنامه مطابقت ندارد.`);
    }
    if (!asset.url.startsWith('https://')) {
      issues.push(`نشانی رسانهٔ ${asset.assetId} باید HTTPS باشد.`);
    }
    if (!mimeTypes[asset.kind].includes(asset.mimeType)) {
      issues.push(`فرمت رسانهٔ ${asset.assetId} برای نوع آن معتبر نیست.`);
    }
    if (!sha256.test(asset.sha256)) {
      issues.push(`هش SHA-256 رسانهٔ ${asset.assetId} معتبر نیست.`);
    }
    if (asset.qaStatus !== 'approved') {
      issues.push(`QA رسانهٔ ${asset.assetId} هنوز تأیید نشده است.`);
    }
  }

  for (const asset of plannedAssets) {
    if (!receivedIds.has(asset.assetId)) {
      issues.push(`رسانهٔ برنامه‌ریزی‌شدهٔ ${asset.assetId} دریافت نشده است.`);
    }
  }
  return { readyForAttachment: issues.length === 0, issues };
}
