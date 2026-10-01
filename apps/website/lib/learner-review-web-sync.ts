import {
  type BinaryResponse,
  type ReviewGrade,
  acknowledgeSyncEvents,
  loadSyncQueue,
  loadSyncQueueResilient,
  queueForRetry,
  quarantineRejectedEvent,
  shouldQuarantineRejected,
  retryAfter,
  saveSyncQueue,
  quarantineCount,
  type PendingSyncEvent,
  type SyncQueueStorage,
} from '@learnbox/learning-engine';

import { submitWebReviewBatch, type WebReviewItem } from './learner-review-web-client';

export type QueuedWebReview = {
  cardId: string;
  grade: ReviewGrade;
  /**
   * CP5-B: the learner's binary answer. `grade` stays populated with its lossless shadow grade
   * (known→remembered, unknown→forgot) so the queue is valid under v1.2.1 and under a flag rollback.
   */
  response?: BinaryResponse;
  reviewedAt: string;
  requiresAttention?: boolean;
};

export type WebReviewSyncResult = {
  pendingCount: number;
  attentionCount: number;
  acknowledged: boolean;
  /** Only set with `quarantineKey`: answers parked on this device, never deleted automatically. */
  quarantinedCount?: number;
};

/** The key holding quarantined answers for the queue stored at `queueKey`. */
export const quarantineKeyFor = (queueKey: string) =>
  queueKey.replace('learnbox:review-sync:', 'learnbox:review-quarantine:');

const MAX_BATCH_SIZE = 20;

/**
 * Flushes only due local events. Events leave durable storage only after an
 * explicit acknowledged outcome; permanent item failures remain visible and
 * are never silently retried.
 */
export async function flushWebReviewQueue(input: {
  storage: SyncQueueStorage;
  key: string;
  ownerId?: string;
  /** `LEARNBOX_QUEUE_QUARANTINE` (default off = v1.2.1: whole-queue reset, unbounded retry). */
  quarantineKey?: string;
  /**
   * CP5-B (`NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI`, default off): send queued binary answers as
   * `response`. Off, every answer — including one queued while the flag was on — is sent as its
   * `grade`, which every server version accepts. Legacy four-grade entries are never converted.
   */
  binaryWire?: boolean;
  now?: Date;
  submit?: (items: WebReviewItem[]) => ReturnType<typeof submitWebReviewBatch>;
}): Promise<WebReviewSyncResult> {
  const now = input.now ?? new Date();
  const quarantineKey = input.quarantineKey;
  const readQueue = () =>
    quarantineKey
      ? loadSyncQueueResilient<QueuedWebReview>(input.storage, input.key, quarantineKey, now)
      : loadSyncQueue<QueuedWebReview>(input.storage, input.key);
  const quarantined = () =>
    quarantineKey ? { quarantinedCount: quarantineCount(input.storage, quarantineKey) } : {};
  const queue = readQueue();
  const due = queueForRetry(queue, now).slice(0, MAX_BATCH_SIZE);
  if (due.length === 0)
    return { pendingCount: queue.length, attentionCount: 0, acknowledged: false, ...quarantined() };

  const submit = input.submit ?? ((items) => submitWebReviewBatch(items, fetch, input.ownerId));
  const result = await submit(due.map((event) => toWireItem(event, input.binaryWire === true)));
  const currentQueue = readQueue;
  if (result.status !== 'ok') {
    const deferred = new Set(due.map((event) => event.clientEventId));
    const next = currentQueue().map((event) =>
      deferred.has(event.clientEventId) ? retryAfter(event, now) : event,
    );
    saveSyncQueue(input.storage, input.key, next);
    return { pendingCount: next.length, attentionCount: 0, acknowledged: false, ...quarantined() };
  }

  const outcomesById = new Map(result.outcomes.map((outcome) => [outcome.clientEventId, outcome]));
  const acknowledged = result.outcomes
    .filter((outcome) => outcome.status === 'acknowledged')
    .map((outcome) => outcome.clientEventId);
  const acknowledgedQueue = acknowledgeSyncEvents(currentQueue(), acknowledged);
  const attentionIds = new Set(
    result.outcomes
      .filter(
        (outcome) => outcome.status === 'validation' || outcome.status === 'idempotencyConflict',
      )
      .map((outcome) => outcome.clientEventId),
  );
  const retryIds = new Set(
    due
      .filter(
        (event) =>
          outcomesById.get(event.clientEventId)?.status === 'clockSkew' ||
          attentionIds.has(event.clientEventId),
      )
      .map((event) => event.clientEventId),
  );
  // Bounded rejection handling: a validation / idempotency-conflict event that has used its retries is
  // parked in quarantine (kept, visible, never auto-deleted) instead of retrying forever.
  const parked = new Set<string>();
  if (quarantineKey) {
    for (const event of acknowledgedQueue) {
      const status = outcomesById.get(event.clientEventId)?.status;
      if (
        (status === 'validation' || status === 'idempotencyConflict') &&
        shouldQuarantineRejected(event)
      ) {
        quarantineRejectedEvent(input.storage, quarantineKey, event, status, now);
        parked.add(event.clientEventId);
      }
    }
  }
  const next = acknowledgedQueue
    .filter((event) => !parked.has(event.clientEventId))
    .map((event) => (retryIds.has(event.clientEventId) ? retryAfter(event, now) : event));
  saveSyncQueue(input.storage, input.key, next);
  return {
    ...quarantined(),
    pendingCount: next.length,
    attentionCount: result.outcomes.filter(
      (outcome) => outcome.status === 'validation' || outcome.status === 'idempotencyConflict',
    ).length,
    acknowledged: acknowledged.length > 0,
  };
}

function toWireItem(event: PendingSyncEvent<QueuedWebReview>, binaryWire: boolean): WebReviewItem {
  const base = {
    clientEventId: event.clientEventId,
    contentId: event.payload.cardId,
    occurredAt: event.payload.reviewedAt,
  };
  return binaryWire && event.payload.response
    ? { ...base, response: event.payload.response }
    : { ...base, grade: event.payload.grade };
}
