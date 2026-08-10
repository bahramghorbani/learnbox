import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { normalizeSplashImage } from '../lib/server/splash-image.js';

const validSplash = join(process.cwd(), 'test/fixtures/splash/valid-splash.jpg');

describe('normalizeSplashImage', () => {
  it('decodes a valid vertical image and returns metadata-free WebP bytes', async () => {
    const result = await normalizeSplashImage(await readFile(validSplash));

    expect(result.kind).toBe('normalized');
    if (result.kind !== 'normalized')
      throw new Error(`Expected normalized image, got ${result.code}`);

    expect(result).toMatchObject({
      mediaType: 'image/webp',
      width: 864,
      height: 1821,
    });
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(result.byteSize).toBe(result.bytes.byteLength);
  });

  it.each(['png', 'webp'] as const)('decodes and normalizes a real %s input', async (format) => {
    const pipeline = sharp({
      create: { width: 864, height: 1600, channels: 3, background: '#6b42df' },
    });
    const bytes = await (format === 'png' ? pipeline.png() : pipeline.webp()).toBuffer();

    const result = await normalizeSplashImage(bytes);

    expect(result.kind).toBe('normalized');
    if (result.kind === 'normalized') {
      expect(result).toMatchObject({ mediaType: 'image/webp', width: 864, height: 1600 });
    }
  });

  it('rejects corrupt or disguised bytes using decoder output instead of a filename', async () => {
    await expect(normalizeSplashImage(Buffer.from('not a png despite its name'))).resolves.toEqual({
      kind: 'rejected',
      code: 'invalid_image',
    });
  });

  it('rejects inputs above the decoded upload byte boundary before decoding', async () => {
    await expect(normalizeSplashImage(Buffer.alloc(8 * 1024 * 1024 + 1))).resolves.toEqual({
      kind: 'rejected',
      code: 'file_too_large',
    });
  });

  it('rejects an animated WebP even when each frame has valid dimensions', async () => {
    const twoFrameGif = Buffer.from(
      '47494638396101000100800000000000ffffff21ff0b4e45545343415045322e300301000000' +
        '21f904000a0000002c0000000001000100000202440100' +
        '21f904000a0000002c00000000010001000002024c01003b',
      'hex',
    );
    const animatedWebp = await sharp(twoFrameGif, { animated: true })
      .resize(864, 1600)
      .webp()
      .toBuffer();

    await expect(normalizeSplashImage(animatedWebp)).resolves.toEqual({
      kind: 'rejected',
      code: 'animated_image',
    });
  });

  it('rejects valid images below the minimum dimensions', async () => {
    const bytes = await sharp({
      create: { width: 800, height: 1600, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    await expect(normalizeSplashImage(bytes)).resolves.toEqual({
      kind: 'rejected',
      code: 'dimensions_too_small',
    });
  });

  it('rejects valid images outside the approved portrait ratio', async () => {
    const bytes = await sharp({
      create: { width: 1000, height: 1600, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();

    await expect(normalizeSplashImage(bytes)).resolves.toEqual({
      kind: 'rejected',
      code: 'aspect_ratio_invalid',
    });
  });
});
