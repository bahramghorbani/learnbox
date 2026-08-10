import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
});
