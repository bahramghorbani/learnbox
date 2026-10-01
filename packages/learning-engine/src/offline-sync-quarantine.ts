import type { PendingSyncEvent } from './offline-sync.js';
import type { SyncQueueStorage } from './offline-sync-storage.js';

/**
 * Resilient pending-event handling (LB-B35 CP4, flag `LEARNBOX_QUEUE_QUARANTINE`, default off).
 *
 * `loadSyncQueue` (v1.2.1) deletes the WHOLE queue when any one item is malformed, and a rejected event is
 * retried forever. This module keeps every valid event, parks anything it cannot trust in a separate
 * quarantine key INSTEAD of deleting it, and stops retrying a rejected event after a bounded number of
 * attempts. Nothing here ever deletes learner data without an explicit call to `discardQuarantine`.
 */

export const MAX_REJECTED_ATTEMPTS = 5;

export type QuarantineReason =
  'corrupt-item' | 'corrupt-queue' | 'validation' | 'idempotencyConflict';

export interface QuarantineEntry {
  reason: QuarantineReason;
  quarantinedAt: string;
  /** The parsed event for a rejected answer. */
  event?: { clientEventId: string; payload: unknown; attempts: number; nextAttemptAt: string };
  /** The untouched original text for anything that could not be parsed as an event. */
  raw?: string;
}

type PersistedEvent = {
  clientEventId: string;
  payload: unknown;
  attempts: number;
  nextAttemptAt: string;
};

export function loadQuarantine(storage: SyncQueueStorage, key: string): QuarantineEntry[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const decoded: unknown = JSON.parse(raw);
    return Array.isArray(decoded) ? (decoded as QuarantineEntry[]) : [];
  } catch {
    return [];
  }
}

export function quarantineCount(storage: SyncQueueStorage, key: string): number {
  return loadQuarantine(storage, key).length;
}

/** The ONLY way quarantined answers leave the device, and it is an explicit learner decision. */
export function discardQuarantine(storage: SyncQueueStorage, key: string): void {
  storage.removeItem(key);
}

function append(storage: SyncQueueStorage, key: string, entries: QuarantineEntry[]): void {
  if (entries.length === 0) return;
  storage.setItem(key, JSON.stringify([...loadQuarantine(storage, key), ...entries]));
}

function isEventShape(value: unknown): value is PersistedEvent {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.clientEventId === 'string' &&
    c.clientEventId.trim().length > 0 &&
    typeof c.attempts === 'number' &&
    Number.isSafeInteger(c.attempts) &&
    c.attempts >= 0 &&
    typeof c.nextAttemptAt === 'string' &&
    !Number.isNaN(new Date(c.nextAttemptAt).getTime()) &&
    new Date(c.nextAttemptAt).toISOString() === c.nextAttemptAt &&
    'payload' in c
  );
}

/**
 * Parses the queue item by item. Valid events are returned and kept. Invalid items, or a queue that is not
 * parseable at all, are copied into quarantine BEFORE the queue is rewritten, so a failed quarantine write
 * leaves the original text exactly as it was.
 */
export function loadSyncQueueResilient<T>(
  storage: SyncQueueStorage,
  key: string,
  quarantineKey: string,
  now: Date = new Date(),
): PendingSyncEvent<T>[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const at = now.toISOString();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    append(storage, quarantineKey, [{ reason: 'corrupt-queue', quarantinedAt: at, raw }]);
    storage.removeItem(key);
    return [];
  }
  if (!Array.isArray(decoded)) {
    append(storage, quarantineKey, [{ reason: 'corrupt-queue', quarantinedAt: at, raw }]);
    storage.removeItem(key);
    return [];
  }

  const valid: PendingSyncEvent<T>[] = [];
  const bad: QuarantineEntry[] = [];
  for (const item of decoded) {
    if (isEventShape(item)) {
      valid.push({
        ...item,
        payload: item.payload as T,
        nextAttemptAt: new Date(item.nextAttemptAt),
      });
    } else {
      bad.push({
        reason: 'corrupt-item',
        quarantinedAt: at,
        raw: JSON.stringify(item) ?? String(item),
      });
    }
  }
  if (bad.length > 0) {
    append(storage, quarantineKey, bad); // throws before any rewrite if storage refuses
    if (valid.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(
        key,
        JSON.stringify(valid.map((e) => ({ ...e, nextAttemptAt: e.nextAttemptAt.toISOString() }))),
      );
    }
  }
  return valid;
}

/** True once a rejected event has used its bounded retries. */
export function shouldQuarantineRejected(event: { attempts: number }): boolean {
  return event.attempts + 1 >= MAX_REJECTED_ATTEMPTS;
}

export function quarantineRejectedEvent<T>(
  storage: SyncQueueStorage,
  quarantineKey: string,
  event: PendingSyncEvent<T>,
  reason: 'validation' | 'idempotencyConflict',
  now: Date,
): void {
  append(storage, quarantineKey, [
    {
      reason,
      quarantinedAt: now.toISOString(),
      event: {
        clientEventId: event.clientEventId,
        payload: event.payload,
        attempts: event.attempts + 1,
        nextAttemptAt: event.nextAttemptAt.toISOString(),
      },
    },
  ]);
}
