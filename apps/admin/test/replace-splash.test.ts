import { describe, expect, it } from 'vitest';

import { replaceSplash } from '../lib/server/replace-splash.js';

const now = new Date('2026-08-10T14:30:00.000Z');
const candidate = {
  bytes: Buffer.from('normalized-webp'),
  checksum: 'a'.repeat(64),
  width: 864,
  height: 1821,
  byteSize: 15,
  mediaType: 'image/webp' as const,
};

describe('replaceSplash', () => {
  it('returns duplicate completion or in-progress state without a second upload', async () => {
    let uploads = 0;
    const storage = {
      async upload() {
        uploads += 1;
      },
      async delete() {},
    };
    const baseStore = {
      async promoteReplacement() {
        throw new Error('must not promote');
      },
      async abandonReplacement() {},
      async queueCleanup() {},
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440009', now },
        {
          storage,
          store: {
            ...baseStore,
            async reserveReplacement() {
              return { status: 'completed' as const, versionId: 'existing-version' };
            },
          },
        },
      ),
    ).resolves.toEqual({ status: 'idempotent', versionId: 'existing-version' });
    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440010', now },
        {
          storage,
          store: {
            ...baseStore,
            async reserveReplacement() {
              return { status: 'in_progress' as const };
            },
          },
        },
      ),
    ).resolves.toEqual({ status: 'in_progress' });
    expect(uploads).toBe(0);
  });

  it('promotes the uploaded candidate before deleting only the superseded object', async () => {
    const events: string[] = [];
    const objects = new Set(['admin/splash/previous.webp']);
    const storage = {
      async upload(objectKey: string) {
        events.push(`upload:${objectKey}`);
        objects.add(objectKey);
      },
      async delete(objectKey: string) {
        events.push(`delete:${objectKey}`);
        objects.delete(objectKey);
      },
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement(input: { objectKey: string; versionId: string }) {
        events.push(`promote:${input.objectKey}`);
        return {
          status: 'promoted' as const,
          versionId: input.versionId,
          previousObjectKey: 'admin/splash/previous.webp',
        };
      },
      async abandonReplacement() {},
      async queueCleanup() {},
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440000', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).resolves.toEqual({ status: 'replaced', versionId: 'version-1' });

    expect(events).toEqual([
      'upload:admin/splash/version-1.webp',
      'promote:admin/splash/version-1.webp',
      'delete:admin/splash/previous.webp',
    ]);
    expect(objects).toEqual(new Set(['admin/splash/version-1.webp']));
  });

  it('abandons the reservation when private upload fails without promoting anything', async () => {
    const abandoned: string[] = [];
    let promoted = false;
    const storage = {
      async upload() {
        throw new Error('provider detail must stay private');
      },
      async delete() {},
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement() {
        promoted = true;
        return { status: 'promoted' as const, versionId: 'version-1' };
      },
      async abandonReplacement(actionId: string) {
        abandoned.push(actionId);
      },
      async queueCleanup() {},
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440001', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).rejects.toMatchObject({
      code: 'storage_unavailable',
      message: 'Splash replacement failed.',
    });

    expect(abandoned).toEqual(['action-1']);
    expect(promoted).toBe(false);
  });

  it('deletes the unreferenced candidate and abandons the reservation after transaction failure', async () => {
    const objects = new Set<string>();
    const abandoned: string[] = [];
    const cleanupJobs: string[] = [];
    const storage = {
      async upload(objectKey: string) {
        objects.add(objectKey);
      },
      async delete(objectKey: string) {
        objects.delete(objectKey);
      },
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement() {
        throw new Error('transaction detail must stay private');
      },
      async abandonReplacement(actionId: string) {
        abandoned.push(actionId);
      },
      async queueCleanup(input: { objectKey: string }) {
        cleanupJobs.push(input.objectKey);
      },
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440002', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).rejects.toMatchObject({ code: 'persistence_unavailable' });

    expect(objects.size).toBe(0);
    expect(abandoned).toEqual(['action-1']);
    expect(cleanupJobs).toEqual([]);
  });

  it('queues the candidate when rollback cleanup cannot delete it', async () => {
    const cleanupJobs: Array<{ objectKey: string; reasonCode: string }> = [];
    let abandoned = false;
    const storage = {
      async upload() {},
      async delete() {
        throw new Error('delete detail must stay private');
      },
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement() {
        throw new Error('transaction detail must stay private');
      },
      async abandonReplacement() {
        abandoned = true;
      },
      async queueCleanup(input: { objectKey: string; reasonCode: string }) {
        cleanupJobs.push(input);
      },
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440003', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).rejects.toMatchObject({ code: 'persistence_unavailable' });

    expect(cleanupJobs).toEqual([
      {
        objectKey: 'admin/splash/version-1.webp',
        reasonCode: 'candidate_after_transaction_failure',
        now,
      },
    ]);
    expect(abandoned).toBe(true);
  });

  it('keeps the promoted result and queues the superseded object when deletion fails', async () => {
    const cleanupJobs: Array<{ objectKey: string; reasonCode: string; now: Date }> = [];
    const storage = {
      async upload() {},
      async delete() {
        throw new Error('delete detail must stay private');
      },
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement() {
        return {
          status: 'promoted' as const,
          versionId: 'version-1',
          previousObjectKey: 'admin/splash/previous.webp',
        };
      },
      async abandonReplacement() {},
      async queueCleanup(input: { objectKey: string; reasonCode: string; now: Date }) {
        cleanupJobs.push(input);
      },
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440004', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).resolves.toEqual({ status: 'replaced', versionId: 'version-1' });

    expect(cleanupJobs).toEqual([
      {
        objectKey: 'admin/splash/previous.webp',
        reasonCode: 'superseded_after_promotion',
        now,
      },
    ]);
  });

  it('abandons the reservation even when candidate cleanup cannot be tracked', async () => {
    let abandoned = false;
    const storage = {
      async upload() {},
      async delete() {
        throw new Error('delete detail must stay private');
      },
    };
    const store = {
      async reserveReplacement() {
        return { status: 'reserved' as const, actionId: 'action-1' };
      },
      async promoteReplacement() {
        throw new Error('transaction detail must stay private');
      },
      async abandonReplacement() {
        abandoned = true;
      },
      async queueCleanup() {
        throw new Error('database detail must stay private');
      },
    };

    await expect(
      replaceSplash(
        { candidate, idempotencyKey: '550e8400-e29b-41d4-a716-446655440005', now },
        { storage, store, createId: () => 'version-1' },
      ),
    ).rejects.toMatchObject({ code: 'cleanup_tracking_failed' });
    expect(abandoned).toBe(true);
  });
});
