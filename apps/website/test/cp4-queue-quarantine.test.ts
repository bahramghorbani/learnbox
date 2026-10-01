import { describe, expect, it } from 'vitest';
import {
  MAX_REJECTED_ATTEMPTS,
  createMemoryStorage,
  discardQuarantine,
  loadQuarantine,
  loadSyncQueue,
  loadSyncQueueResilient,
  saveSyncQueue,
  type PendingSyncEvent,
} from '@learnbox/learning-engine';

import {
  flushWebReviewQueue,
  quarantineKeyFor,
  type QueuedWebReview,
} from '../lib/learner-review-web-sync';

/**
 * LB-B35 CP4 — resilient pending events (flag LEARNBOX_QUEUE_QUARANTINE).
 *
 * The CP0 suite pins the flag-OFF behaviour (whole-queue reset, unbounded retry). This suite pins what the
 * flag turns on: per-item parsing, quarantine instead of deletion, bounded rejection retries.
 */

const KEY = 'learnbox:review-sync:v1:local-prototype:account:u1';
const QKEY = quarantineKeyFor(KEY);
const NOW = new Date('2026-10-01T09:00:00.000Z');

const event = (id: string): PendingSyncEvent<QueuedWebReview> => ({
  clientEventId: id,
  payload: { cardId: `start-a1-${id}`, grade: 'remembered', reviewedAt: NOW.toISOString() },
  attempts: 0,
  nextAttemptAt: NOW,
});
const seeded = (ids: string[]) => {
  const storage = createMemoryStorage();
  saveSyncQueue(storage, KEY, ids.map(event));
  return storage;
};
const reject =
  (status: 'validation' | 'idempotencyConflict') =>
  async (items: Array<{ clientEventId: string }>) => ({
    status: 'ok' as const,
    outcomes: items.map((i) => ({ clientEventId: i.clientEventId, status }) as never),
  });
const ack = (id: string) =>
  ({
    status: 'acknowledged',
    clientEventId: id,
    eventId: `s-${id}`,
    idempotent: false,
    reconciliationCursor: '1',
  }) as never;

describe('quarantineKeyFor', () => {
  it('derives a per-account key from the per-account queue key', () => {
    expect(QKEY).toBe('learnbox:review-quarantine:v1:local-prototype:account:u1');
    expect(QKEY).not.toBe(KEY);
  });
});

describe('CP4 — one malformed item no longer destroys the queue', () => {
  it('keeps every valid event, quarantines the bad item verbatim, and rewrites the queue', () => {
    const storage = seeded(['a', 'b']);
    const items = JSON.parse(storage.getItem(KEY)!);
    items.splice(1, 0, { clientEventId: 'x', attempts: 0, nextAttemptAt: 'NOPE', payload: {} });
    storage.setItem(KEY, JSON.stringify(items));

    const queue = loadSyncQueueResilient<QueuedWebReview>(storage, KEY, QKEY, NOW);
    expect(queue.map((e) => e.clientEventId)).toEqual(['a', 'b']);
    expect(loadSyncQueue(storage, KEY).map((e) => e.clientEventId)).toEqual(['a', 'b']);
    const parked = loadQuarantine(storage, QKEY);
    expect(parked).toHaveLength(1);
    expect(parked[0].reason).toBe('corrupt-item');
    expect(JSON.parse(parked[0].raw!)).toMatchObject({ clientEventId: 'x', nextAttemptAt: 'NOPE' });
  });

  it('an unparseable queue is copied to quarantine byte-for-byte before the key is reset', () => {
    const storage = createMemoryStorage();
    storage.setItem(KEY, '{broken');
    expect(loadSyncQueueResilient(storage, KEY, QKEY, NOW)).toEqual([]);
    expect(storage.getItem(KEY)).toBeNull();
    expect(loadQuarantine(storage, QKEY)).toEqual([
      { reason: 'corrupt-queue', quarantinedAt: NOW.toISOString(), raw: '{broken' },
    ]);
  });

  it('a non-array JSON value is quarantined, not lost', () => {
    const storage = createMemoryStorage();
    storage.setItem(KEY, '{"a":1}');
    expect(loadSyncQueueResilient(storage, KEY, QKEY, NOW)).toEqual([]);
    expect(loadQuarantine(storage, QKEY)[0]).toMatchObject({
      reason: 'corrupt-queue',
      raw: '{"a":1}',
    });
  });

  it('if quarantine itself cannot be written, the original queue is left untouched', () => {
    const base = createMemoryStorage();
    base.setItem(KEY, '{broken');
    const failing = {
      getItem: base.getItem,
      removeItem: base.removeItem,
      setItem: (key: string, value: string) => {
        if (key === QKEY) throw new Error('QuotaExceededError');
        base.setItem(key, value);
      },
    };
    expect(() => loadSyncQueueResilient(failing, KEY, QKEY, NOW)).toThrow();
    expect(base.getItem(KEY)).toBe('{broken');
  });

  it('a healthy queue is a no-op: nothing written, nothing quarantined', () => {
    const storage = seeded(['a', 'b']);
    const before = storage.getItem(KEY);
    expect(loadSyncQueueResilient(storage, KEY, QKEY, NOW)).toHaveLength(2);
    expect(storage.getItem(KEY)).toBe(before);
    expect(storage.getItem(QKEY)).toBeNull();
  });

  it('flag OFF (no quarantineKey) keeps the v1.2.1 reset exactly', async () => {
    const storage = new Map<string, string>();
    const raw = createMemoryStorage();
    raw.setItem(KEY, '[{"clientEventId":"a","attempts":0,"nextAttemptAt":"NOPE","payload":{}}]');
    void storage;
    const result = await flushWebReviewQueue({
      storage: raw,
      key: KEY,
      now: NOW,
      submit: async () => ({ status: 'unavailable' }),
    });
    expect(result.pendingCount).toBe(0);
    expect(raw.getItem(KEY)).toBeNull();
    expect(raw.getItem(QKEY)).toBeNull(); // nothing quarantined: the legacy defect, deliberately retained off-flag
  });
});

describe('CP4 — rejected events are bounded, visible and never auto-deleted', () => {
  it(`retries ${MAX_REJECTED_ATTEMPTS - 1} times then quarantines a validation-rejected event`, async () => {
    const storage = seeded(['old', 'good']);
    let now = NOW;
    let last = { pendingCount: -1, quarantinedCount: -1 } as {
      pendingCount: number;
      quarantinedCount?: number;
    };
    for (let round = 1; round <= MAX_REJECTED_ATTEMPTS; round += 1) {
      last = await flushWebReviewQueue({
        storage,
        key: KEY,
        quarantineKey: QKEY,
        now,
        submit: async (items) => ({
          status: 'ok',
          outcomes: items.map((i) =>
            i.clientEventId === 'good'
              ? ack('good')
              : ({ clientEventId: i.clientEventId, status: 'validation' } as never),
          ),
        }),
      });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    expect(last).toMatchObject({ pendingCount: 0, quarantinedCount: 1 });
    expect(loadSyncQueue(storage, KEY)).toEqual([]);
    const [parked] = loadQuarantine(storage, QKEY);
    expect(parked.reason).toBe('validation');
    expect(parked.event).toMatchObject({ clientEventId: 'old', attempts: MAX_REJECTED_ATTEMPTS });
    expect(parked.event!.payload).toMatchObject({ cardId: 'start-a1-old', grade: 'remembered' });
  });

  it('an idempotencyConflict is bounded the same way', async () => {
    const storage = seeded(['c']);
    let now = NOW;
    for (let round = 0; round < MAX_REJECTED_ATTEMPTS; round += 1) {
      await flushWebReviewQueue({
        storage,
        key: KEY,
        quarantineKey: QKEY,
        now,
        submit: reject('idempotencyConflict'),
      });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    expect(loadQuarantine(storage, QKEY)[0]).toMatchObject({ reason: 'idempotencyConflict' });
    expect(loadSyncQueue(storage, KEY)).toEqual([]);
  });

  it('clock skew and transient failures are NOT quarantined (they can still succeed)', async () => {
    const storage = seeded(['s']);
    let now = NOW;
    for (let round = 0; round < MAX_REJECTED_ATTEMPTS + 3; round += 1) {
      await flushWebReviewQueue({
        storage,
        key: KEY,
        quarantineKey: QKEY,
        now,
        submit: async (items) => ({
          status: 'ok',
          outcomes: items.map(
            (i) => ({ clientEventId: i.clientEventId, status: 'clockSkew' }) as never,
          ),
        }),
      });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    expect(loadSyncQueue(storage, KEY)).toHaveLength(1);
    expect(storage.getItem(QKEY)).toBeNull();
    for (const status of ['unavailable', 'unauthorized'] as const) {
      await flushWebReviewQueue({
        storage,
        key: KEY,
        quarantineKey: QKEY,
        now: new Date(now.getTime() + 10 * 3_600_000),
        submit: async () => ({ status }),
      });
    }
    expect(storage.getItem(QKEY)).toBeNull();
  });

  it('quarantine leaves the device only through an explicit discard', async () => {
    const storage = seeded(['d']);
    let now = NOW;
    for (let round = 0; round < MAX_REJECTED_ATTEMPTS; round += 1) {
      await flushWebReviewQueue({
        storage,
        key: KEY,
        quarantineKey: QKEY,
        now,
        submit: reject('validation'),
      });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    // Further flushes, reloads and other accounts' flushes never touch it.
    await flushWebReviewQueue({
      storage,
      key: KEY,
      quarantineKey: QKEY,
      now,
      submit: async () => ({ status: 'unavailable' }),
    });
    expect(loadQuarantine(storage, QKEY)).toHaveLength(1);
    discardQuarantine(storage, QKEY);
    expect(loadQuarantine(storage, QKEY)).toEqual([]);
  });

  it('flag OFF still retries a rejected event forever (CP0 pin unchanged)', async () => {
    const storage = seeded(['old']);
    let now = NOW;
    for (let round = 0; round < 7; round += 1) {
      await flushWebReviewQueue({ storage, key: KEY, now, submit: reject('validation') });
      now = new Date(now.getTime() + 6 * 60_000);
    }
    expect(loadSyncQueue(storage, KEY)).toHaveLength(1);
    expect(storage.getItem(QKEY)).toBeNull();
  });
});
