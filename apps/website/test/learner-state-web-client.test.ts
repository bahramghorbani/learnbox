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
  reconciliationCursor: '0',
};

describe('web learner state client', () => {
  it('accepts a parsed canonical snapshot only from an explicit 200 response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, canonicalBody));
    const result = await fetchWebLearnerState(fetchMock);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.snapshot.plan.reviewCardIds).toEqual(['11111111-1111-4111-8111-111111111111']);
    expect(result.snapshot.schedules[0].dueAt).toBeInstanceOf(Date);
    expect(result.snapshot.reconciliationCursor).toBe('0');
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

  it.each([
    ['missing cardId', (schedule: Record<string, unknown>) => ({ ...schedule, cardId: undefined })],
    ['empty cardId', (schedule: Record<string, unknown>) => ({ ...schedule, cardId: '' })],
    [
      'missing contentId',
      (schedule: Record<string, unknown>) => ({ ...schedule, contentId: undefined }),
    ],
    ['empty contentId', (schedule: Record<string, unknown>) => ({ ...schedule, contentId: '' })],
    [
      'disallowed schedule state',
      (schedule: Record<string, unknown>) => ({ ...schedule, state: 'vaporized' }),
    ],
    [
      'non-finite stabilityDays',
      (schedule: Record<string, unknown>) => ({
        ...schedule,
        stabilityDays: Number.POSITIVE_INFINITY,
      }),
    ],
    [
      'negative stabilityDays',
      (schedule: Record<string, unknown>) => ({ ...schedule, stabilityDays: -1 }),
    ],
    [
      'non-finite lapses',
      (schedule: Record<string, unknown>) => ({ ...schedule, lapses: Number.NaN }),
    ],
    ['negative lapses', (schedule: Record<string, unknown>) => ({ ...schedule, lapses: -2 })],
    [
      'non-finite difficulty',
      (schedule: Record<string, unknown>) => ({ ...schedule, difficulty: Number.NaN }),
    ],
    [
      'invalid dueAt date',
      (schedule: Record<string, unknown>) => ({ ...schedule, dueAt: 'not-a-date' }),
    ],
  ])('rejects a schedule entry with %s', async (_label, mutate) => {
    const body = structuredClone(canonicalBody) as {
      schedules: Array<Record<string, unknown>>;
      plan: Record<string, unknown>;
      reviewEventsCount: unknown;
    };
    body.schedules = [mutate(structuredClone(canonicalBody.schedules[0]))];
    expect((await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)))).status).toBe(
      'unavailable',
    );
  });

  it.each([
    ['disallowed plan mode', (plan: Record<string, unknown>) => ({ ...plan, mode: 'party' })],
    ['missing plan', () => null],
    [
      'non-array reviewCardIds',
      (plan: Record<string, unknown>) => ({ ...plan, reviewCardIds: 'all' }),
    ],
    [
      'non-string reviewCardIds entry',
      (plan: Record<string, unknown>) => ({ ...plan, reviewCardIds: [1] }),
    ],
    ['non-array newCardIds', (plan: Record<string, unknown>) => ({ ...plan, newCardIds: 3 })],
    [
      'non-string newCardIds entry',
      (plan: Record<string, unknown>) => ({ ...plan, newCardIds: [true] }),
    ],
    ['missing plan message', (plan: Record<string, unknown>) => ({ ...plan, message: undefined })],
  ])('rejects a plan with %s', async (_label, mutate) => {
    const body = structuredClone(canonicalBody) as {
      schedules: Array<Record<string, unknown>>;
      plan: Record<string, unknown>;
      reviewEventsCount: unknown;
    };
    body.plan = mutate(structuredClone(canonicalBody.plan)) as Record<string, unknown>;
    expect((await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)))).status).toBe(
      'unavailable',
    );
  });

  it.each([
    ['fractional reviewEventsCount', 1.5],
    ['negative reviewEventsCount', -1],
    ['non-finite reviewEventsCount', Number.POSITIVE_INFINITY],
    ['string reviewEventsCount', '2'],
  ])('rejects %s', async (_label, value) => {
    const body = structuredClone(canonicalBody) as {
      schedules: Array<Record<string, unknown>>;
      plan: Record<string, unknown>;
      reviewEventsCount: unknown;
    };
    body.reviewEventsCount = value;
    expect((await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)))).status).toBe(
      'unavailable',
    );
  });

  it.each([
    ['missing reconciliationCursor', undefined],
    ['number reconciliationCursor', 42],
    ['negative reconciliationCursor', '-1'],
    ['fractional reconciliationCursor', '1.5'],
    ['scientific-notation reconciliationCursor', '1e3'],
    ['non-decimal reconciliationCursor', 'abc'],
  ])('rejects %s and never treats the cursor as a JS number', async (_label, value) => {
    const body = structuredClone(canonicalBody) as Record<string, unknown>;
    if (value === undefined) delete body.reconciliationCursor;
    else body.reconciliationCursor = value;
    expect((await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)))).status).toBe(
      'unavailable',
    );
  });

  it('accepts a large decimal-string cursor beyond Number.MAX_SAFE_INTEGER', async () => {
    const body = structuredClone(canonicalBody) as Record<string, unknown>;
    body.reconciliationCursor = '9007199254740993123456789';
    const result = await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.snapshot.reconciliationCursor).toBe('9007199254740993123456789');
  });

  it('accepts the canonical schedule states and zero reviewEventsCount', async () => {
    const body = structuredClone(canonicalBody);
    body.schedules = (
      ['new', 'learning', 'review', 'relearning', 'mastered', 'suspended', 'archived'] as const
    ).map((state, index) => ({
      ...body.schedules[0],
      cardId: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, '0')}`,
      state,
    }));
    body.plan = { ...body.plan, mode: 'recovery' };
    body.reviewEventsCount = 0;
    const result = await fetchWebLearnerState(vi.fn(async () => jsonResponse(200, body)));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.snapshot.schedules).toHaveLength(7);
    expect(result.snapshot.schedules[6].state).toBe('archived');
    expect(result.snapshot.plan.mode).toBe('recovery');
  });
});
