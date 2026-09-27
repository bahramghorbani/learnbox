import { createHash } from 'node:crypto';

import sharp from 'sharp';

const maximumInputBytes = 8 * 1024 * 1024;
const minimumWidth = 864;
const minimumHeight = 1600;
const minimumAspectRatio = 0.42;
const maximumAspectRatio = 0.55;

type SplashImageRejectionCode =
  | 'invalid_image'
  | 'file_too_large'
  | 'animated_image'
  | 'dimensions_too_small'
  | 'aspect_ratio_invalid';

export type SplashImageNormalization =
  | {
      kind: 'normalized';
      bytes: Buffer;
      checksum: string;
      width: number;
      height: number;
      byteSize: number;
      mediaType: 'image/webp';
    }
  | { kind: 'rejected'; code: SplashImageRejectionCode };

function rejected(code: SplashImageRejectionCode): SplashImageNormalization {
  return { kind: 'rejected', code };
}

export async function normalizeSplashImage(bytes: Buffer): Promise<SplashImageNormalization> {
  if (bytes.byteLength > maximumInputBytes) return rejected('file_too_large');

  try {
    const source = sharp(bytes, { animated: false, failOn: 'error', limitInputPixels: 40_000_000 });
    const metadata = await source.metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
      return rejected('invalid_image');
    }
    if (metadata.pages && metadata.pages > 1) return rejected('animated_image');

    const normalized = await source
      .rotate()
      .webp({ effort: 4, quality: 86 })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = normalized.info;
    if (!width || !height) return rejected('invalid_image');
    if (width < minimumWidth || height < minimumHeight) return rejected('dimensions_too_small');
    const ratio = width / height;
    if (ratio < minimumAspectRatio || ratio > maximumAspectRatio) {
      return rejected('aspect_ratio_invalid');
    }

    return {
      kind: 'normalized',
      bytes: normalized.data,
      checksum: createHash('sha256').update(normalized.data).digest('hex'),
      width,
      height,
      byteSize: normalized.data.byteLength,
      mediaType: 'image/webp',
    };
  } catch {
    return rejected('invalid_image');
  }
}
