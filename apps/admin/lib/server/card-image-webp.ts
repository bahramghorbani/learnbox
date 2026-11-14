import sharp from 'sharp';

/**
 * Best-effort re-encode of a freshly generated card image to WebP (quality 86), matching the
 * compression already used for splash and presentation-slide images (`image-normalization.ts`).
 *
 * This only changes how the bytes are STORED. It runs before `CardMediaStorage.store`, so nothing
 * downstream changes: acceptance, `evaluateMediaValidity` and the Admin review UI never decode
 * pixels — they only compare recorded attribution (subject, voice, image-standard version) against
 * the card's current content.
 *
 * Re-encoding is strictly additive and fail-open: if the provider's bytes cannot be decoded
 * (corrupt, truncated, an unexpected format, or sharp itself erroring), the original bytes and
 * content type are kept unchanged, so a provider quirk can never turn into a failed generation.
 */
export async function reencodeCardImageToWebp(
  bytes: Buffer,
  contentType: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  if (contentType === 'image/webp') return { bytes, contentType };
  try {
    const webp = await sharp(bytes, {
      animated: false,
      failOn: 'error',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .webp({ effort: 4, quality: 86 })
      .toBuffer();
    if (!webp.length) return { bytes, contentType };
    return { bytes: webp, contentType: 'image/webp' };
  } catch {
    return { bytes, contentType };
  }
}
