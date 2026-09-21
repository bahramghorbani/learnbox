import {
  acknowledgeSyncEvents,
  loadSyncQueue,
  queueForRetry,
  retryAfter,
  saveSyncQueue,
  type PendingSyncEvent,
  type SyncQueueStorage,
} from '@learnbox/learning-engine';

import { submitWebReviewBatch, type WebReviewItem } from './learner-review-web-client';

export type QueuedWebReview = {
  cardId: string;
  grade: 'forgot' | 'hard' | 'remembered' | 'mastered';
  reviewedAt: string;
  requiresAttention?: boolean;
};

export type WebReviewSyncResult = {
  pendingCount: number;
  attentionCount: number;
  acknowledged: boolean;
};

const MAX_BATCH_SIZE = 20;

/**
 * Flushes only due local events. Events leave durable storage only after an
 * explicit acknowledged outcome; permanent item failures remain visible and
 * are never silently retried.
 */
export async function flushWebReviewQueue(input: {
  storage: SyncQueueStorage;
  key: string;
  now?: Date;
  submit?: (items: WebReviewItem[]) => ReturnType<typeof submitWebReviewBatch>;
}): Promise<WebReviewSyncResult> {
  const now = input.now ?? new Date();
  const queue = loadSyncQueue<QueuedWebReview>(input.storage, input.key);
  const due = queueForRetry(queue, now).slice(0, MAX_BATCH_SIZE);
  if (due.length === 0)
    return { pendingCount: queue.length, attentionCount: 0, acknowledged: false };

  const submit = input.submit ?? ((items) => submitWebReviewBatch(items));
  const result = await submit(due.map(toWireItem));
  const currentQueue = () => loadSyncQueue<QueuedWebReview>(input.storage, input.key);
  if (result.status !== 'ok') {
    const deferred = new Set(due.map((event) => event.clientEventId));
    const next = currentQueue().map((event) =>
      deferred.has(event.clientEventId) ? retryAfter(event, now) : event,
    );
    saveSyncQueue(input.storage, input.key, next);
    return { pendingCount: next.length, attentionCount: 0, acknowledged: false };
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
  const next = acknowledgedQueue.map((event) =>
    retryIds.has(event.clientEventId) ? retryAfter(event, now) : event,
  );
  saveSyncQueue(input.storage, input.key, next);
  return {
    pendingCount: next.length,
    attentionCount: result.outcomes.filter(
      (outcome) => outcome.status === 'validation' || outcome.status === 'idempotencyConflict',
    ).length,
    acknowledged: acknowledged.length > 0,
  };
}

function toWireItem(event: PendingSyncEvent<QueuedWebReview>): WebReviewItem {
  return {
    clientEventId: event.clientEventId,
    contentId: event.payload.cardId,
    grade: event.payload.grade,
    occurredAt: event.payload.reviewedAt,
  };
}
