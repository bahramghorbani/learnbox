import { describe, expect, it } from 'vitest';

import { acknowledgeSyncEvents, type PendingSyncEvent } from '../src/index.js';

const event = (clientEventId: string, payload: unknown = { cardId: clientEventId }) =>
  ({
    clientEventId,
    payload,
    attempts: 0,
    nextAttemptAt: new Date('2026-07-26T12:00:00Z'),
  }) satisfies PendingSyncEvent<unknown>;

describe('acknowledgeSyncEvents exact-match removal', () => {
  it('removes only the acknowledged ids and keeps every unacknowledged event', () => {
    const queue = [event('evt-1'), event('evt-2'), event('evt-3')];

    const remaining = acknowledgeSyncEvents(queue, ['evt-1', 'evt-3']);

    expect(remaining.map((item) => item.clientEventId)).toEqual(['evt-2']);
  });

  it('does not acknowledge ids that are not in the queue', () => {
    const queue = [event('evt-1')];

    expect(acknowledgeSyncEvents(queue, ['evt-unknown']).map((item) => item.clientEventId)).toEqual(
      ['evt-1'],
    );
  });

  it('ignores duplicate acknowledgements and removes nothing for an empty set', () => {
    const queue = [event('evt-1')];

    expect(
      acknowledgeSyncEvents(queue, ['evt-1', 'evt-1']).map((item) => item.clientEventId),
    ).toEqual([]);
    expect(acknowledgeSyncEvents(queue, []).map((item) => item.clientEventId)).toEqual(['evt-1']);
  });

  it('keeps the unacknowledged events in their original persisted order', () => {
    const queue = [event('first'), event('second'), event('third')];

    const remaining = acknowledgeSyncEvents(queue, ['second']);

    expect(remaining.map((item) => item.clientEventId)).toEqual(['first', 'third']);
  });
});
