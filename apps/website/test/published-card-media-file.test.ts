import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readPublishedCardMediaFile } from '../lib/published-card-media';

/** Migration 0061: learner media read from files must match the published record exactly. */
const KEY = 'admin/card-media/de-a1-tuer/image/0b3a8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png';
const bytes = Buffer.from('png-bytes');
const checksum = createHash('sha256').update(bytes).digest('hex');

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'learner-media-'));
  await mkdir(path.dirname(path.join(root, KEY)), { recursive: true });
  await writeFile(path.join(root, KEY), bytes);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('published card media file reader', () => {
  it('returns bytes that match the published size and checksum', async () => {
    await expect(readPublishedCardMediaFile(root, KEY, checksum, bytes.length)).resolves.toEqual(
      bytes,
    );
  });

  it('refuses a file whose content changed', async () => {
    await writeFile(path.join(root, KEY), Buffer.from('png-bytez'));
    await expect(readPublishedCardMediaFile(root, KEY, checksum, bytes.length)).rejects.toThrow();
  });

  it('refuses a missing file', async () => {
    await rm(path.join(root, KEY));
    await expect(readPublishedCardMediaFile(root, KEY, checksum, bytes.length)).rejects.toThrow();
  });

  it.each(['../../etc/passwd', '/etc/passwd', 'admin/splash/home.webp'])(
    'refuses key %s outside the card media shape',
    async (key) => {
      await expect(readPublishedCardMediaFile(root, key, checksum, 1)).rejects.toThrow(
        'invalid media key',
      );
    },
  );
});
