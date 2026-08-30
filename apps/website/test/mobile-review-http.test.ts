import { describe, expect, it, vi } from 'vitest';

import { handleMobileReviewPost } from '../lib/mobile-review-http';
import type { MobileReviewHttpDependencies } from '../lib/mobile-review-http';

const validItem = {
  contentId: 'card-house',
  grade: 'remembered',
  occurredAt: '2026-08-24T12:00:00.000Z',
  clientEventId: 'evt-1',
};

function request(body: unknown, init: RequestInit = {}) {
  return new Request('https://learnbox.example/api/reviews/mobile', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      ...init.headers,
    },
    body: JSON.stringify(body),
    ...init,
  });
}

function dependencies(): {
  verifyAccessToken: ReturnType<typeof vi.fn<MobileReviewHttpDependencies['verifyAccessToken']>>;
  submit: ReturnType<typeof vi.fn<MobileReviewHttpDependencies['submit']>>;
} {
  return {
    verifyAccessToken: vi.fn(() => ({ status: 'valid' as const, claims: { sub: 'learner-1' } })),
    submit: vi.fn(async () => [
      {
        status: 'acknowledged' as const,
        clientEventId: 'evt-1',
        eventId: 'event-1',
        idempotent: false,
        reconciliationCursor: '1',
      },
    ]),
  };
}

describe('mobile review HTTP boundary', () => {
  it('derives learner identity from the verified bearer token and preserves ordered outcomes', async () => {
    const deps = dependencies();
    const response = await handleMobileReviewPost(request({ items: [validItem] }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcomes: [
        {
          status: 'acknowledged',
          clientEventId: 'evt-1',
          eventId: 'event-1',
          idempotent: false,
          reconciliationCursor: '1',
        },
      ],
    });
    expect(deps.submit).toHaveBeenCalledWith({
      userId: 'learner-1',
      items: [{ ...validItem, occurredAt: new Date(validItem.occurredAt) }],
    });
  });

  it('rejects client user IDs and any extra top-level fields', async () => {
    const deps = dependencies();
    expect(
      (await handleMobileReviewPost(request({ userId: 'attacker', items: [validItem] }), deps))
        .status,
    ).toBe(400);
    expect(
      (await handleMobileReviewPost(request({ items: [validItem], userId: 'attacker' }), deps))
        .status,
    ).toBe(400);
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it('rejects invalid token, insecure transport, wrong content type and batches over 20', async () => {
    const deps = dependencies();
    deps.verifyAccessToken.mockImplementation(() => ({ status: 'invalid' }));
    expect((await handleMobileReviewPost(request({ items: [validItem] }), deps)).status).toBe(401);
    deps.verifyAccessToken.mockReset();
    deps.verifyAccessToken.mockImplementation(() => ({
      status: 'valid',
      claims: { sub: 'learner-1' },
    }));
    expect(
      (
        await handleMobileReviewPost(
          new Request('http://learnbox.example/api/reviews/mobile', {
            method: 'POST',
            headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
            body: JSON.stringify({ items: [validItem] }),
          }),
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleMobileReviewPost(
          request(
            { items: [validItem] },
            { headers: { authorization: 'Bearer valid-token', 'content-type': 'text/plain' } },
          ),
          deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleMobileReviewPost(
          request({
            items: Array.from({ length: 21 }, (_, index) => ({
              ...validItem,
              clientEventId: `evt-${index}`,
            })),
          }),
          deps,
        )
      ).status,
    ).toBe(400);
  });

  it('fails closed with generic no-store errors for malformed item data and service faults', async () => {
    const deps = dependencies();
    for (const body of [
      { items: [{ ...validItem, grade: 'again' }] },
      { items: [{ ...validItem, occurredAt: 'not-a-date' }] },
      { items: [{ ...validItem, clientEventId: '' }] },
      { items: [{ ...validItem, extra: true }] },
    ]) {
      const response = await handleMobileReviewPost(request(body), deps);
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'validation' });
    }
    deps.submit.mockRejectedValueOnce(new Error('database details must not escape'));
    const response = await handleMobileReviewPost(request({ items: [validItem] }), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });
});
