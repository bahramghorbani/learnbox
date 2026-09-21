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
