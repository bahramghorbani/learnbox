import { describe, expect, it, vi } from 'vitest';

import {
  fetchWebReviewReconciliation,
  submitWebReviewBatch,
} from '../lib/learner-review-web-client';

const item = {
  clientEventId: 'event-1',
  contentId: 'start-a1-haus',
  grade: 'remembered' as const,
  occurredAt: '2026-09-20T00:00:00.000Z',
};

function json(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

describe('web review client', () => {
  it('submits same-origin cookie requests without Authorization and accepts only exact outcomes', async () => {
    const fetchMock = vi.fn(async () =>
      json(200, {
        outcomes: [
          {
            status: 'acknowledged',
            clientEventId: 'event-1',
            eventId: 'event-row-1',
            idempotent: false,
            reconciliationCursor: '1',
          },
        ],
      }),
    );
    expect((await submitWebReviewBatch([item], fetchMock)).status).toBe('ok');
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const init = calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).not.toHaveProperty('authorization');

    expect(
      (
        await submitWebReviewBatch(
          [item],
          vi.fn(async () => json(200, { outcomes: [], extra: true })),
        )
      ).status,
    ).toBe('unavailable');
  });

  it('treats network failure and unauthenticated responses as typed non-success', async () => {
    expect(
      (
        await submitWebReviewBatch(
          [item],
          vi.fn(async () => {
            throw new Error('offline');
          }),
        )
      ).status,
    ).toBe('unavailable');
    expect(
      (
        await submitWebReviewBatch(
          [item],
          vi.fn(async () => json(401, {})),
        )
      ).status,
    ).toBe('unauthorized');
    expect((await fetchWebReviewReconciliation('01')).status).toBe('unavailable');
  });
});

describe('CP7: the client distinguishes a deterministic 422 from a transient failure', () => {
  it('maps 422 to the terminal "rejected" status, not "unavailable"', async () => {
    const fetchMock = vi.fn(async () => json(422, { error: 'schedulerRejected' }));
    const result = await submitWebReviewBatch([item], fetchMock);
    expect(result.status).toBe('rejected');
  });

  it('still maps 503 and other non-200 to the retryable "unavailable"', async () => {
    for (const status of [500, 502, 503, 504]) {
      const fetchMock = vi.fn(async () => json(status, { error: 'serverUnavailable' }));
      expect((await submitWebReviewBatch([item], fetchMock)).status).toBe('unavailable');
    }
  });

  it('NEGATIVE PROOF: 422 and 503 must not collapse to the same status', async () => {
    const rejected = await submitWebReviewBatch(
      [item],
      vi.fn(async () => json(422, {})),
    );
    const unavailable = await submitWebReviewBatch(
      [item],
      vi.fn(async () => json(503, {})),
    );
    expect(rejected.status).not.toBe(unavailable.status);
  });
});
