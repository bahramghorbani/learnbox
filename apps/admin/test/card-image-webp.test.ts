import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { reencodeCardImageToWebp } from '../lib/server/card-image-webp.js';

/**
 * Card images are re-encoded to WebP before storage so they take roughly half the bandwidth of
 * the PNG/JPEG an image provider returns, at the same 86-quality encode already used for splash
 * and presentation-slide images. The conversion must be fail-open: a provider quirk can never
 * turn into a failed card generation, so a bad input falls back to the original bytes untouched.
 */
describe('reencodeCardImageToWebp', () => {
  it('re-encodes a real PNG to WebP and shrinks it', async () => {
    const png = await sharp({
      create: { width: 512, height: 512, channels: 3, background: '#6b42df' },
    })
      .png()
      .toBuffer();

    const result = await reencodeCardImageToWebp(png, 'image/png');

    expect(result.contentType).toBe('image/webp');
    expect(result.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(result.bytes.byteLength).toBeLessThan(png.byteLength);
    // The re-encoded bytes decode back to the same dimensions — nothing visual was lost in shape.
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({ width: 512, height: 512, format: 'webp' });
  });

  it('re-encodes a real JPEG to WebP', async () => {
    const jpeg = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#112233' },
    })
      .jpeg()
      .toBuffer();

    const result = await reencodeCardImageToWebp(jpeg, 'image/jpeg');

    expect(result.contentType).toBe('image/webp');
    expect(result.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('passes an already-WebP image through unchanged, without calling sharp again', async () => {
    const webp = await sharp({
      create: { width: 256, height: 256, channels: 3, background: '#ffffff' },
    })
      .webp()
      .toBuffer();

    const result = await reencodeCardImageToWebp(webp, 'image/webp');

    expect(result.contentType).toBe('image/webp');
    expect(result.bytes).toBe(webp);
  });

  it('falls back to the original bytes and content type when the input cannot be decoded', async () => {
    const corrupt = Buffer.from('89504e470d0a1a0a', 'hex'); // PNG magic header only, no pixels
    const result = await reencodeCardImageToWebp(corrupt, 'image/png');

    expect(result).toEqual({ bytes: corrupt, contentType: 'image/png' });
  });

  it('falls back untouched for a content type sharp cannot understand at all', async () => {
    const bytes = Buffer.from('definitely not an image');
    const result = await reencodeCardImageToWebp(bytes, 'image/png');

    expect(result).toEqual({ bytes, contentType: 'image/png' });
  });
});
