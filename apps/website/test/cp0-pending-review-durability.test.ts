import { loadSyncQueue, saveSyncQueue, type PendingSyncEvent } from '@learnbox/learning-engine';
import { describe, expect, it } from 'vitest';

import { flushWebReviewQueue, type QueuedWebReview } from '../lib/learner-review-web-sync';

/**
 * LB-B35 CP0 — pending-review durability on the web sync path (v1.2.1 behavior).
 *
 * Covers the scenarios the owner listed that are decided by the queue + flush layer:
 * offline -> online, session expiry, refresh/crash (storage survives a re-load), and a rejected
 * event. The logout and resume paths are pinned in cp0-pending-review-safety / cp0-session-resume.
 *
 * "DEFECT" tests assert current behavior that the owner wants changed; they pass today.
 */

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const KEY = 'learnbox:review-sync:v1:local-prototype:account:u1';
const NOW = new Date('2026-10-01T12:00:00.000Z');

function event(id: string, reviewedAt = NOW.toISOString()): PendingSyncEvent<QueuedWebReview> {
  return {
    clientEventId: id,
    attempts: 0,
    nextAttemptAt: new Date(NOW.getTime() - 1000),
    payload: { cardId: 'start-a1-x', grade: 'remembered', reviewedAt },
  };
}

function seeded(ids: string[]) {
  const storage = new MemoryStorage();
  saveSyncQueue(
    storage,
    KEY,
    ids.map((id) => event(id)),
  );
  return storage;
}

const ack = (id: string) =>
  ({
    clientEventId: id,
    status: 'acknowledged' as const,
    eventId: `e-${id}`,
    idempotent: false,
    reconciliationCursor: 'c'.repeat(8),
  }) as never;

describe('CP0 — pending review durability (web queue + flush)', () => {
  it('offline -> online: every answer stays queued while offline and drains when acknowledged', async () => {
    const storage = seeded(['a', 'b', 'c']);
    const offline = await flushWebReviewQueue({
      storage,
      key: KEY,
      now: NOW,
      submit: async () => ({ status: 'unavailable' }),
    });
    expect(offline).toMatchObject({ pendingCount: 3, acknowledged: false });
    expect(loadSyncQueue(storage, KEY).map((e) => e.clientEventId)).toEqual(['a', 'b', 'c']);

    const later = new Date(NOW.getTime() + 10 * 60_000);
    const online = await flushWebReviewQueue({
      storage,
      key: KEY,
      now: later,
      submit: async (items) => ({ status: 'ok', outcomes: items.map((i) => ack(i.clientEventId)) }),
    });
    expect(online).toMatchObject({ pendingCount: 0, acknowledged: true });
    expect(loadSyncQueue(storage, KEY)).toEqual([]);
  });

  it('session expiry (401) keeps every answer and backs off; nothing is dropped or sent twice', async () => {
    const storage = seeded(['a', 'b']);
    let submissions = 0;
    const result = await flushWebReviewQueue({
      storage,
      key: KEY,
      now: NOW,
      submit: async () => {
        submissions += 1;
        return { status: 'unauthorized' };
      },
    });
    expect(result).toMatchObject({ pendingCount: 2, acknowledged: false });
    const queue = loadSyncQueue<QueuedWebReview>(storage, KEY);
    expect(queue.map((e) => e.clientEventId)).toEqual(['a', 'b']);
    expect(queue.every((e) => e.attempts === 1 && e.nextAttemptAt > NOW)).toBe(true);
    // An immediate second flush does not hammer the server: the events are not due yet.
    await flushWebReviewQueue({
      storage,
      key: KEY,
      now: NOW,
      submit: async () => {
        submissions += 1;
        return { status: 'unauthorized' };
      },
    });
    expect(submissions).toBe(1);
  });

  it('refresh / crash / restart: the queue is read back from storage unchanged', () => {
    const storage = seeded(['a', 'b']);
    const before = storage.getItem(KEY);
    // A "new page load" is a new reader over the same device storage.
    expect(loadSyncQueue(storage, KEY).map((e) => e.clientEventId)).toEqual(['a', 'b']);
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('a corrupt queue is deleted wholesale, which silently drops every answer in it', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      KEY,
      '[{"clientEventId":"a","attempts":0,"nextAttemptAt":"NOPE","payload":{}}]',
    );
    expect(loadSyncQueue(storage, KEY)).toEqual([]);
    // DEFECT (data safety): one malformed entry removes the whole key; nothing is quarantined.
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('DEFECT: an event the server rejects (validation) is retried forever and never surfaced or resolved', async () => {
    const storage = seeded(['old']);
    let now = NOW;
    for (let i = 0; i < 5; i += 1) {
      const result = await flushWebReviewQueue({
        storage,
        key: KEY,
        now,
        submit: async (items) => ({
          status: 'ok',
          outcomes: items.map(
            (x) => ({ clientEventId: x.clientEventId, status: 'validation' }) as never,
          ),
        }),
      });
      expect(result).toMatchObject({ pendingCount: 1, attentionCount: 1, acknowledged: false });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    const [stuck] = loadSyncQueue<QueuedWebReview>(storage, KEY);
    // It is still there after 5 rounds, its attempts keep growing, and no terminal state exists.
    expect(stuck.clientEventId).toBe('old');
    expect(stuck.attempts).toBe(5);
    expect(stuck.payload.requiresAttention).toBeUndefined();
  });

  it('partial acknowledgement removes exactly the acknowledged answers', async () => {
    const storage = seeded(['a', 'b', 'c']);
    const result = await flushWebReviewQueue({
      storage,
      key: KEY,
      now: NOW,
      submit: async () => ({
        status: 'ok',
        outcomes: [ack('a'), { clientEventId: 'b', status: 'clockSkew' } as never, ack('c')],
      }),
    });
    expect(result).toMatchObject({ pendingCount: 1, acknowledged: true });
    expect(loadSyncQueue(storage, KEY).map((e) => e.clientEventId)).toEqual(['b']);
  });

  it("the queue key is per account: one account never flushes another account's answers", async () => {
    const storage = new MemoryStorage();
    saveSyncQueue(storage, 'learnbox:review-sync:v1:local-prototype:account:other', [event('x')]);
    const result = await flushWebReviewQueue({
      storage,
      key: KEY,
      now: NOW,
      submit: async () => {
        throw new Error('must not be called: this account has nothing pending');
      },
    });
    expect(result).toMatchObject({ pendingCount: 0, acknowledged: false });
  });
});
