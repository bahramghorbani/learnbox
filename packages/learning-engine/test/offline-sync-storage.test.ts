import { describe, expect, it } from 'vitest';

import { loadSyncQueue, saveSyncQueue, type SyncQueueStorage } from '../src/index.js';

class MemoryStorage implements SyncQueueStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('offline sync storage', () => {
  it('round-trips retry metadata and ISO dates through device storage', () => {
    const storage = new MemoryStorage();
    saveSyncQueue(storage, 'review-sync', [
      {
        clientEventId: 'event-1',
        payload: { cardId: 'card-1' },
        attempts: 2,
        nextAttemptAt: new Date('2026-07-26T12:00:00.000Z'),
      },
    ]);

    expect(loadSyncQueue<{ cardId: string }>(storage, 'review-sync')).toEqual([
      {
        clientEventId: 'event-1',
        payload: { cardId: 'card-1' },
        attempts: 2,
        nextAttemptAt: new Date('2026-07-26T12:00:00.000Z'),
      },
    ]);
  });

  it('fails closed for malformed persisted data and removes the corrupted queue', () => {
    const storage = new MemoryStorage();
    storage.setItem('review-sync', '{broken');
    expect(loadSyncQueue(storage, 'review-sync')).toEqual([]);
    expect(storage.getItem('review-sync')).toBeNull();

    storage.setItem(
      'review-sync',
      JSON.stringify([
        {
          clientEventId: 'valid-event',
          payload: { cardId: 'card-1' },
          attempts: 0,
          nextAttemptAt: '2026-07-26T12:00:00.000Z',
        },
        {
          clientEventId: '',
          payload: { cardId: 'card-2' },
          attempts: -1,
          nextAttemptAt: 'not-a-date',
        },
      ]),
    );
    expect(loadSyncQueue(storage, 'review-sync')).toEqual([]);
    expect(storage.getItem('review-sync')).toBeNull();

    saveSyncQueue(storage, 'review-sync', []);
    expect(storage.getItem('review-sync')).toBeNull();
  });
});
