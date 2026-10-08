import {
  normalizeImage,
  type ImageNormalization,
  type ImageRejectionCode,
} from './image-normalization';

/**
 * The launch splash is a full-screen portrait image, so it is checked against a tall shape: at
 * least 864×1600 and an aspect ratio between 0.42 and 0.55. The intake pipeline itself is shared
 * with every other owner-supplied Admin image (see image-normalization).
 */
const splashImageShape = {
  maximumInputBytes: 8 * 1024 * 1024,
  minimumWidth: 864,
  minimumHeight: 1600,
  minimumAspectRatio: 0.42,
  maximumAspectRatio: 0.55,
} as const;

export type SplashImageRejectionCode = ImageRejectionCode;
export type SplashImageNormalization = ImageNormalization;

export function normalizeSplashImage(bytes: Buffer): Promise<SplashImageNormalization> {
  return normalizeImage(bytes, splashImageShape);
}
