import { describe, expect, it, vi } from 'vitest';

import {
  handleWebReviewBatchPost,
  handleWebReviewReconciliationGet,
  type WebReviewDependencies,
} from '../lib/learner-review-web-http';

const subject = '00000000-0000-4000-8000-000000000000';

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

function dependencies(overrides: Partial<WebReviewDependencies> = {}): WebReviewDependencies {
  return {
    submit: vi.fn(async () => [
      {
        status: 'acknowledged' as const,
        clientEventId: 'event-1',
        eventId: 'event-row-1',
        idempotent: false,
        reconciliationCursor: '1',
      },
    ]),
    readReconciliation: vi.fn(async () => ({
      cursor: '0',
      nextCursor: '1',
      hasMore: false,
      events: [
        { clientEventId: 'event-1', eventId: 'event-row-1', appliedAt: '2026-09-20T00:00:00.000Z' },
      ],
    })),
    ...overrides,
  };
}

const validBody = JSON.stringify({
  items: [
    {
      clientEventId: 'event-1',
      contentId: 'start-a1-haus',
      grade: 'remembered',
      occurredAt: '2026-09-20T00:00:00.000Z',
    },
  ],
});

describe('web review HTTP boundary', () => {
  it('uses only the verified cookie subject, requires same-origin JSON and returns no-store outcomes', async () => {
    const deps = dependencies();
    const response = await handleWebReviewBatchPost(
      request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: validBody,
      }),
      deps,
      () => subject,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({
      outcomes: [
        {
          status: 'acknowledged',
          clientEventId: 'event-1',
          eventId: 'event-row-1',
          idempotent: false,
          reconciliationCursor: '1',
        },
      ],
    });
    expect(deps.submit).toHaveBeenCalledWith({
      userId: subject,
      items: [
        {
          clientEventId: 'event-1',
          contentId: 'start-a1-haus',
          grade: 'remembered',
          occurredAt: new Date('2026-09-20T00:00:00.000Z'),
        },
      ],
    });
  });

  it('rejects cross-origin or missing-origin posts before submit even for a verified subject', async () => {
    for (const origin of ['https://attacker.example', undefined]) {
      const deps = dependencies();
      const response = await handleWebReviewBatchPost(
        request('https://learnbox.example/api/learner/reviews', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(origin ? { origin } : {}),
          },
          body: validBody,
        }),
        deps,
        () => subject,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'request_rejected' });
      expect(deps.submit).not.toHaveBeenCalled();
    }
  });

  it('fails closed for a missing subject, invalid body, insecure transport and submit failure', async () => {
    const unauthenticated = await handleWebReviewBatchPost(
      request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: validBody,
      }),
      dependencies(),
      () => null,
    );
    expect(unauthenticated.status).toBe(401);

    const invalid = await handleWebReviewBatchPost(
      request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: JSON.stringify({ items: [{ nope: true }] }),
      }),
      dependencies(),
      () => subject,
    );
    expect(invalid.status).toBe(400);

    const insecure = await handleWebReviewBatchPost(
      request('http://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://learnbox.example' },
        body: validBody,
      }),
      dependencies(),
      () => subject,
      { development: false },
    );
    expect(insecure.status).toBe(400);

    const unavailable = await handleWebReviewBatchPost(
      request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: validBody,
      }),
      dependencies({
        submit: vi.fn(async () => {
          throw new Error('database unavailable');
        }),
      }),
      () => subject,
    );
    expect(unavailable.status).toBe(503);
  });

  it('rejects a client reconciliation cursor because Web reconciliation is a separate read route', async () => {
    const deps = dependencies();
    const response = await handleWebReviewBatchPost(
      request('https://learnbox.example/api/learner/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://learnbox.example' },
        body: JSON.stringify({ ...JSON.parse(validBody), reconciliationCursor: '0' }),
      }),
      deps,
      () => subject,
    );
    expect(response.status).toBe(400);
    expect(deps.submit).not.toHaveBeenCalled();
  });

  it('reads reconciliation only for the verified subject and validates the cursor', async () => {
    const deps = dependencies();
    const response = await handleWebReviewReconciliationGet(
      request('https://learnbox.example/api/learner/reviews/reconciliation?after=0'),
      deps,
      () => subject,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(deps.readReconciliation).toHaveBeenCalledWith({ userId: subject, after: '0' });

    const bad = await handleWebReviewReconciliationGet(
      request('https://learnbox.example/api/learner/reviews/reconciliation?after=1e3'),
      dependencies(),
      () => subject,
    );
    expect(bad.status).toBe(400);
  });
});
