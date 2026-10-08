import { createHash } from 'node:crypto';

import sharp from 'sharp';

/**
 * The one image intake pipeline for owner-supplied Admin images.
 *
 * Every accepted image is decoded, checked and RE-ENCODED to a single format, which is what makes
 * an upload safe: the stored bytes are produced by this pipeline, never passed through from the
 * client, so an uploaded file cannot smuggle a payload, an animation or EXIF metadata into the
 * product. The only thing that differs between surfaces is the shape an image must have, so the
 * shape is a parameter and the pipeline is not duplicated per surface.
 */

export type ImageRejectionCode =
  | 'invalid_image'
  | 'file_too_large'
  | 'animated_image'
  | 'dimensions_too_small'
  | 'aspect_ratio_invalid';

export type ImageShape = {
  maximumInputBytes: number;
  minimumWidth: number;
  minimumHeight: number;
  minimumAspectRatio: number;
  maximumAspectRatio: number;
};

export type ImageNormalization =
  | {
      kind: 'normalized';
      bytes: Buffer;
      checksum: string;
      width: number;
      height: number;
      byteSize: number;
      mediaType: 'image/webp';
    }
  | { kind: 'rejected'; code: ImageRejectionCode };

function rejected(code: ImageRejectionCode): ImageNormalization {
  return { kind: 'rejected', code };
}

export async function normalizeImage(
  bytes: Buffer,
  shape: ImageShape,
): Promise<ImageNormalization> {
  if (bytes.byteLength > shape.maximumInputBytes) return rejected('file_too_large');

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
    if (width < shape.minimumWidth || height < shape.minimumHeight) {
      return rejected('dimensions_too_small');
    }
    const ratio = width / height;
    if (ratio < shape.minimumAspectRatio || ratio > shape.maximumAspectRatio) {
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
