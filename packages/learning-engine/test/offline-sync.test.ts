import { describe, expect, it } from 'vitest';

import { acknowledgeSyncEvents, queueForRetry, retryAfter } from '../src/index.js';

const now = new Date('2026-07-26T12:00:00Z');
const event = (clientEventId: string, nextAttemptAt = now) => ({
  clientEventId,
  payload: { cardId: clientEventId },
  attempts: 0,
  nextAttemptAt,
});

describe('offline sync queue', () => {
  it('only returns due events in a deterministic order', () => {
    expect(
      queueForRetry(
        [event('later', new Date('2026-07-26T12:01:00Z')), event('b'), event('a')],
        now,
      ).map((item) => item.clientEventId),
    ).toEqual(['a', 'b']);
  });

  it('removes events only after their matching acknowledgement', () => {
    expect(
      acknowledgeSyncEvents([event('one'), event('two')], ['two']).map(
        (item) => item.clientEventId,
      ),
    ).toEqual(['one']);
  });

  it('uses bounded exponential backoff after a failed delivery', () => {
    const retried = retryAfter(event('one'), now);
    expect(retried.attempts).toBe(1);
    expect(retried.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
