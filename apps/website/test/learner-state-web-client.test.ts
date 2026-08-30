import { describe, expect, it, vi } from 'vitest';

import { fetchWebLearnerState } from '../lib/learner-state-web-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as Response;
}

const canonicalBody = {
  schedules: [
    {
      cardId: '11111111-1111-4111-8111-111111111111',
      contentId: 'start-a1-haus',
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: '2026-08-08T06:00:00.000Z',
    },
  ],
  plan: {
    mode: 'normal',
    reviewCardIds: ['11111111-1111-4111-8111-111111111111'],
    newCardIds: [],
    message: 'daily',
  },
  reviewEventsCount: 2,
};

describe('web learner state client', () => {
  it('accepts a parsed canonical snapshot only from an explicit 200 response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, canonicalBody));
    const result = await fetchWebLearnerState(fetchMock);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.snapshot.plan.reviewCardIds).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(result.snapshot.schedules[0].dueAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/learner/state',
      expect.objectContaining({ method: 'GET' }),
    );
    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit?]>;
    const call = calls[0] ?? [];
    const options = (call[1] ?? {}) as RequestInit;
    expect(options.headers).not.toHaveProperty('authorization');
    expect(call[0]).toBe('/api/learner/state');
    expect(options.method).toBe('GET');
  });

  it('fails closed on network failure, non-200, 401 and malformed bodies', async () => {
    expect(
      (
        await fetchWebLearnerState(
          vi.fn(async () => jsonResponse(503, { error: 'serverUnavailable' })),
        )
      ).status,
    ).toBe('unavailable');
    expect(
      (await fetchWebLearnerState(vi.fn(async () => jsonResponse(401, { error: 'invalidToken' }))))
        .status,
    ).toBe('unauthorized');
    expect(
      (await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, { nope: true })))).status,
    ).toBe('unavailable');
    expect(
      (await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, canonicalBody)))).status,
    ).toBe('ok');
    const networkFailure = vi.fn(async () => {
      throw new Error('network unavailable');
    });
    expect((await fetchWebLearnerState(networkFailure)).status).toBe('unavailable');
  });
});
