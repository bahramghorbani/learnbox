import { describe, expect, it } from 'vitest';
import { createMemoryStorage, loadSyncQueue } from '@learnbox/learning-engine';

import { flushWebReviewQueue, type QueuedWebReview } from '../lib/learner-review-web-sync';
import type { WebReviewItem } from '../lib/learner-review-web-client';

const key = 'reviews';
const now = new Date('2026-09-20T00:00:00.000Z');
const queued = {
  clientEventId: 'event-1',
  payload: { cardId: 'start-a1-haus', grade: 'remembered' as const, reviewedAt: now.toISOString() },
  attempts: 0,
  nextAttemptAt: now,
};

describe('web review queue sync', () => {
  it('maps legacy cardId to wire contentId and removes only acknowledged events', async () => {
    const storage = createMemoryStorage();
    storage.setItem(key, JSON.stringify([{ ...queued, nextAttemptAt: now.toISOString() }]));
    const submit = async (items: WebReviewItem[]) => {
      expect(items).toEqual([
        {
          contentId: 'start-a1-haus',
          grade: 'remembered',
          occurredAt: now.toISOString(),
          clientEventId: 'event-1',
        },
      ]);
      return {
        status: 'ok' as const,
        outcomes: [
          {
            status: 'acknowledged' as const,
            clientEventId: 'event-1',
            eventId: 'server-1',
            idempotent: true,
            reconciliationCursor: '1',
          },
        ],
      };
    };
    const result = await flushWebReviewQueue({ storage, key, now, submit });
    expect(result).toEqual({ pendingCount: 0, attentionCount: 0, acknowledged: true });
    expect(storage.getItem(key)).toBeNull();
  });

  it('preserves an event queued while the request is in flight', async () => {
    const storage = createMemoryStorage();
    storage.setItem(key, JSON.stringify([{ ...queued, nextAttemptAt: now.toISOString() }]));
    let resolveFirst: ((value: unknown) => void) | undefined;
    const first = flushWebReviewQueue({
      storage,
      key,
      now,
      submit: () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }) as never,
    });
    const later = { ...queued, clientEventId: 'event-2', nextAttemptAt: now };
    storage.setItem(
      key,
      JSON.stringify([
        { ...queued, nextAttemptAt: now.toISOString() },
        { ...later, nextAttemptAt: now.toISOString() },
      ]),
    );
    resolveFirst?.({
      status: 'ok',
      outcomes: [
        {
          status: 'acknowledged',
          clientEventId: 'event-1',
          eventId: 'server-1',
          idempotent: false,
          reconciliationCursor: '1',
        },
      ],
    });
    await first;
    expect(
      loadSyncQueue<QueuedWebReview>(storage, key).map((event) => event.clientEventId),
    ).toEqual(['event-2']);
  });

  it('retains validation outcomes and backs off unavailable due events', async () => {
    const storage = createMemoryStorage();
    storage.setItem(key, JSON.stringify([{ ...queued, nextAttemptAt: now.toISOString() }]));
    const validation = await flushWebReviewQueue({
      storage,
      key,
      now,
      submit: async () => ({
        status: 'ok',
        outcomes: [{ status: 'validation', clientEventId: 'event-1' }],
      }),
    });
    expect(validation).toEqual({ pendingCount: 1, attentionCount: 1, acknowledged: false });

    const unavailable = await flushWebReviewQueue({
      storage,
      key,
      now: new Date('2026-09-20T00:01:00.000Z'),
      submit: async () => ({ status: 'unavailable' }),
    });
    expect(unavailable.pendingCount).toBe(1);
    const stored = loadSyncQueue<QueuedWebReview>(storage, key);
    expect(stored[0].attempts).toBe(2);
    expect(stored[0].nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
