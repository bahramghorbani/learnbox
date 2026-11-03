import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cardMediaFilePath,
  createCardMediaStorage,
  createFileCardMediaStorage,
  readVerifiedCardMediaFile,
  writeCardMediaFile,
} from '../lib/server/card-media-storage.js';

/**
 * Card media in files (migration 0061). The database keeps key + size + checksum with bytes NULL;
 * every read must prove the file against that record, and no key may escape the media root.
 */
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const KEY = 'admin/card-media/de-a1-tuer/word_audio/0b3a8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.mp3';

type Row = { object_key: string; checksum: string; byte_size: number; bytes: Buffer | null };

function fakePool(options: { failInsert?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const sql: string[] = [];
  return {
    rows,
    sql,
    async query(text: string, parameters: readonly unknown[] = []) {
      sql.push(text);
      if (text.startsWith('INSERT INTO card_media_objects')) {
        if (options.failInsert) throw new Error('insert failed');
        const [objectKey, , byteSize, checksum, bytes] = parameters as [
          string,
          string,
          number,
          string,
          Buffer | undefined,
        ];
        rows.set(objectKey, {
          object_key: objectKey,
          checksum,
          byte_size: byteSize,
          bytes: text.includes('NULL)') ? null : (bytes ?? null),
        });
        return { rows: [] };
      }
      if (text.startsWith('SELECT checksum, byte_size, bytes')) {
        const row = rows.get(String(parameters[0]));
        return { rows: row ? [row as unknown as Record<string, unknown>] : [] };
      }
      if (text.startsWith('DELETE FROM card_media_objects')) {
        rows.delete(String(parameters[0]));
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'card-media-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('file-backed card media storage', () => {
  it('writes the file, records NULL bytes in the database, and reads back verified bytes', async () => {
    const pool = fakePool();
    const storage = createFileCardMediaStorage(pool, root);
    const bytes = Buffer.from('ID3-audio-bytes');
    const stored = await storage.store('de-a1-tuer', 'word_audio', 'audio/mpeg', bytes);

    const row = pool.rows.get(stored.objectKey);
    expect(row?.bytes).toBeNull();
    expect(row?.checksum).toBe(sha(bytes));
    expect(row?.byte_size).toBe(bytes.length);
    expect(pool.sql.some((q) => q.includes('$5'))).toBe(false); // bytes never sent to the database
    expect(await readFile(path.join(root, stored.objectKey))).toEqual(bytes);
    expect((await stat(path.join(root, stored.objectKey))).mode & 0o777).toBe(0o640);
    expect(await storage.read(stored.objectKey)).toEqual(bytes);
  });

  it('refuses to serve a file that no longer matches its database record', async () => {
    const pool = fakePool();
    const storage = createFileCardMediaStorage(pool, root);
    const stored = await storage.store('de-a1-tuer', 'image', 'image/png', Buffer.from('png-1'));
    await writeFile(path.join(root, stored.objectKey), Buffer.from('png-2'));
    await expect(storage.read(stored.objectKey)).rejects.toThrow();
  });

  it('fails loudly when the file is missing', async () => {
    const pool = fakePool();
    const storage = createFileCardMediaStorage(pool, root);
    const stored = await storage.store('de-a1-tuer', 'image', 'image/png', Buffer.from('png'));
    await rm(path.join(root, stored.objectKey));
    await expect(storage.read(stored.objectKey)).rejects.toThrow();
  });

  it('still serves legacy rows whose bytes are in the database', async () => {
    const pool = fakePool();
    const legacy = Buffer.from('legacy');
    pool.rows.set(KEY, { object_key: KEY, checksum: sha(legacy), byte_size: 6, bytes: legacy });
    const storage = createFileCardMediaStorage(pool, root);
    expect(await storage.read(KEY)).toEqual(legacy);
  });

  it('removes the written file when the database insert fails', async () => {
    const storage = createFileCardMediaStorage(fakePool({ failInsert: true }), root);
    const bytes = Buffer.from('mp3');
    await expect(
      storage.storeWithin(fakePool({ failInsert: true }), KEY, 'audio/mpeg', bytes, sha(bytes)),
    ).rejects.toThrow('insert failed');
    await expect(stat(path.join(root, KEY))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never overwrites an existing file with different bytes, and accepts an identical retry', async () => {
    const one = Buffer.from('one');
    await writeCardMediaFile(root, KEY, one, sha(one));
    await expect(writeCardMediaFile(root, KEY, one, sha(one))).resolves.toBeUndefined();
    const two = Buffer.from('two');
    await expect(writeCardMediaFile(root, KEY, two, sha(two))).rejects.toThrow();
    expect(await readFile(path.join(root, KEY))).toEqual(one);
  });

  it('refuses bytes whose checksum is wrong before writing anything', async () => {
    await expect(
      writeCardMediaFile(root, KEY, Buffer.from('x'), sha(Buffer.from('y'))),
    ).rejects.toThrow();
    await expect(stat(path.join(root, KEY))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    '../../etc/passwd',
    'admin/card-media/../../../etc/passwd',
    '/etc/passwd',
    'admin/card-media/x/image/not-a-uuid.png',
    'admin/card-media/x/video/0b3a8f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.mp4',
    'admin/splash/home.webp',
  ])('rejects key %s that is not a card media key', async (key) => {
    expect(() => cardMediaFilePath(root, key)).toThrow();
    await expect(readVerifiedCardMediaFile(root, key, sha(Buffer.from('')), 0)).rejects.toThrow();
  });

  it('uses file storage only when LEARNBOX_CARD_MEDIA_DIR is set', async () => {
    const bytes = Buffer.from('mp3');
    const filePool = fakePool();
    await createCardMediaStorage(filePool, { LEARNBOX_CARD_MEDIA_DIR: root }).storeWithin(
      filePool,
      KEY,
      'audio/mpeg',
      bytes,
      sha(bytes),
    );
    expect(filePool.rows.get(KEY)?.bytes).toBeNull();

    const dbPool = fakePool();
    await createCardMediaStorage(dbPool, {}).storeWithin(
      dbPool,
      KEY,
      'audio/mpeg',
      bytes,
      sha(bytes),
    );
    expect(dbPool.rows.get(KEY)?.bytes).toEqual(bytes);
  });
});
