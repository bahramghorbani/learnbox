import type { PendingSyncEvent } from './offline-sync.js';

export interface SyncQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PersistedSyncEvent<T> = Omit<PendingSyncEvent<T>, 'nextAttemptAt'> & {
  nextAttemptAt: string;
};

/** A small, device-storage adapter. Callers own the storage key and the payload schema. */
export function loadSyncQueue<T>(storage: SyncQueueStorage, key: string): PendingSyncEvent<T>[] {
  const raw = storage.getItem(key);
  if (!raw) return [];

  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return discardCorruptQueue(storage, key);

    const restored = decoded.map((item): PendingSyncEvent<T> | null => {
      if (!isPersistedSyncEvent(item)) return null;
      const nextAttemptAt = new Date(item.nextAttemptAt);
      if (
        Number.isNaN(nextAttemptAt.getTime()) ||
        nextAttemptAt.toISOString() !== item.nextAttemptAt
      ) {
        return null;
      }
      return { ...item, payload: item.payload as T, nextAttemptAt };
    });

    return restored.some((event) => event === null)
      ? discardCorruptQueue(storage, key)
      : (restored as PendingSyncEvent<T>[]);
  } catch {
    return discardCorruptQueue(storage, key);
  }
}

export function saveSyncQueue<T>(
  storage: SyncQueueStorage,
  key: string,
  queue: PendingSyncEvent<T>[],
): void {
  if (queue.length === 0) {
    storage.removeItem(key);
    return;
  }

  const persisted: PersistedSyncEvent<T>[] = queue.map((event) => ({
    ...event,
    nextAttemptAt: event.nextAttemptAt.toISOString(),
  }));
  storage.setItem(key, JSON.stringify(persisted));
}

function isPersistedSyncEvent(value: unknown): value is PersistedSyncEvent<unknown> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.clientEventId === 'string' &&
    candidate.clientEventId.trim().length > 0 &&
    typeof candidate.attempts === 'number' &&
    Number.isSafeInteger(candidate.attempts) &&
    candidate.attempts >= 0 &&
    typeof candidate.nextAttemptAt === 'string' &&
    'payload' in candidate
  );
}

function discardCorruptQueue(storage: SyncQueueStorage, key: string): [] {
  storage.removeItem(key);
  return [];
}
