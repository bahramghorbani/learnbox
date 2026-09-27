export interface PendingSyncEvent<T> {
  clientEventId: string;
  payload: T;
  attempts: number;
  nextAttemptAt: Date;
}

/** Keeps the local queue deterministic and never removes an event before an acknowledgement. */
export function queueForRetry<T>(pending: PendingSyncEvent<T>[], now: Date): PendingSyncEvent<T>[] {
  return pending
    .filter((event) => event.nextAttemptAt <= now)
    .sort(
      (a, b) =>
        a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() ||
        a.clientEventId.localeCompare(b.clientEventId),
    );
}

export function acknowledgeSyncEvents<T>(
  pending: PendingSyncEvent<T>[],
  acknowledgedClientEventIds: Iterable<string>,
): PendingSyncEvent<T>[] {
  const acknowledged = new Set(acknowledgedClientEventIds);
  return pending.filter((event) => !acknowledged.has(event.clientEventId));
}

export function retryAfter<T>(event: PendingSyncEvent<T>, now: Date): PendingSyncEvent<T> {
  const attempts = event.attempts + 1;
  const delayMs = Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts, 8));
  return { ...event, attempts, nextAttemptAt: new Date(now.getTime() + delayMs) };
}
