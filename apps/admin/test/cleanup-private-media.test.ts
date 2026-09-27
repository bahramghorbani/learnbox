import { describe, expect, it } from 'vitest';

import { cleanupPrivateMedia } from '../lib/server/cleanup-private-media.js';

const now = new Date('2026-08-10T14:30:00.000Z');

describe('cleanupPrivateMedia', () => {
  it('deletes a claimed opaque object and marks its job complete', async () => {
    const deleted: string[] = [];
    const completed: string[] = [];
    const store = {
      async claimCleanupJobs() {
        return [
          {
            id: 'job-1',
            objectKey: 'admin/splash/orphan.webp',
            attemptCount: 1,
          },
        ];
      },
      async completeCleanup(id: string) {
        completed.push(id);
      },
      async rescheduleCleanup() {},
      async exhaustCleanup() {},
    };
    const storage = {
      async delete(objectKey: string) {
        deleted.push(objectKey);
      },
    };

    await expect(cleanupPrivateMedia({ now }, { storage, store })).resolves.toEqual({
      completed: 1,
      exhausted: 0,
      rescheduled: 0,
    });
    expect(deleted).toEqual(['admin/splash/orphan.webp']);
    expect(completed).toEqual(['job-1']);
  });

  it('reschedules a failed delete with bounded backoff and a safe error code', async () => {
    const rescheduled: unknown[] = [];
    const store = {
      async claimCleanupJobs() {
        return [
          {
            id: 'job-1',
            objectKey: 'admin/splash/orphan.webp',
            attemptCount: 2,
          },
        ];
      },
      async completeCleanup() {},
      async rescheduleCleanup(input: unknown) {
        rescheduled.push(input);
      },
      async exhaustCleanup() {},
    };
    const storage = {
      async delete() {
        throw new Error('provider detail must stay private');
      },
    };

    await expect(cleanupPrivateMedia({ now }, { storage, store })).resolves.toEqual({
      completed: 0,
      exhausted: 0,
      rescheduled: 1,
    });
    expect(rescheduled).toEqual([
      {
        id: 'job-1',
        attemptCount: 2,
        nextAttemptAt: new Date('2026-08-10T14:40:00.000Z'),
        lastErrorCode: 'delete_failed',
      },
    ]);
    expect(JSON.stringify(rescheduled)).not.toContain('provider detail');
  });

  it('stops retrying after the fifth failed attempt', async () => {
    const exhausted: unknown[] = [];
    let rescheduled = false;
    const store = {
      async claimCleanupJobs() {
        return [
          {
            id: 'job-1',
            objectKey: 'admin/splash/orphan.webp',
            attemptCount: 5,
          },
        ];
      },
      async completeCleanup() {},
      async rescheduleCleanup() {
        rescheduled = true;
      },
      async exhaustCleanup(input: unknown) {
        exhausted.push(input);
      },
    };
    const storage = {
      async delete() {
        throw new Error('provider detail must stay private');
      },
    };

    await expect(cleanupPrivateMedia({ now }, { storage, store })).resolves.toEqual({
      completed: 0,
      exhausted: 1,
      rescheduled: 0,
    });
    expect(exhausted).toEqual([
      {
        id: 'job-1',
        attemptCount: 5,
        completedAt: now,
        lastErrorCode: 'delete_failed_exhausted',
      },
    ]);
    expect(rescheduled).toBe(false);
  });
});
