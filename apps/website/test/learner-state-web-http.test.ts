import { describe, expect, it, vi } from 'vitest';

import {
  handleWebLearnerStateGet,
  type WebLearnerStateDependencies,
} from '../lib/learner-state-web-http';
import type { LearnerStateSnapshot } from '../../api/dist/learner-state/learner-state.service.js';

const snapshot: LearnerStateSnapshot = {
  schedules: [
    {
      cardId: '11111111-1111-4111-8111-111111111111',
      contentId: 'start-a1-haus',
      state: 'review',
      stabilityDays: 4,
      difficulty: 0.4,
      lapses: 0,
      dueAt: new Date('2026-08-08T06:00:00.000Z'),
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

function get(url: string, init: RequestInit = {}): Request {
  return new Request(url, { method: 'GET', ...init });
}

function dependencies(
  overrides: Partial<WebLearnerStateDependencies> = {},
): WebLearnerStateDependencies {
  return {
    readLearnerState: vi.fn(async () => snapshot),
    ...overrides,
  };
}

function readSubject(request: Request): string | null {
  return request.headers.get('x-test-subject');
}

describe('web learner state HTTP boundary', () => {
  it('derives identity only from the verified learner cookie subject and serializes the canonical snapshot', async () => {
    const deps = dependencies();
    const response = await handleWebLearnerStateGet(
      get('https://learnbox.example/api/learner/state', {
        headers: { 'x-test-subject': '00000000-0000-4000-8000-000000000000' },
      }),
      deps,
      readSubject,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.json()).toEqual({
      schedules: [
        {
          cardId: snapshot.schedules[0].cardId,
          contentId: snapshot.schedules[0].contentId,
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
    });
    expect(deps.readLearnerState).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000');
  });

  it('returns 401 invalidToken with no-store when the cookie is missing', async () => {
    const deps = dependencies();
    const response = await handleWebLearnerStateGet(
      get('https://learnbox.example/api/learner/state'),
      deps,
      readSubject,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'invalidToken' });
    expect(deps.readLearnerState).not.toHaveBeenCalled();
  });

  it('rejects a client-supplied Authorization header and client user id', async () => {
    const deps = dependencies();
    const response = await handleWebLearnerStateGet(
      get('https://learnbox.example/api/learner/state', {
        headers: {
          authorization: 'Bearer mobile-or-web-token',
          'x-test-subject': '00000000-0000-4000-8000-000000000000',
        },
      }),
      deps,
      readSubject,
    );
    expect(response.status).toBe(200);
    const readMock = deps.readLearnerState as ReturnType<typeof vi.fn>;
    expect(readMock).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000');
    expect(readMock.mock.calls[0][0]).not.toContain('mobile-or-web-token');
  });

  it('rejects POST and insecure HTTP outside bounded loopback with validation', async () => {
    const deps = dependencies();
    const post = await handleWebLearnerStateGet(
      get('https://learnbox.example/api/learner/state', { method: 'POST' }),
      deps,
      readSubject,
    );
    expect(post.status).toBe(400);
    expect(await post.json()).toEqual({ error: 'validation' });
    const insecure = await handleWebLearnerStateGet(
      get('http://learnbox.example/api/learner/state', {
        headers: { 'x-test-subject': '00000000-0000-4000-8000-000000000000' },
      }),
      deps,
      readSubject,
      { development: false },
    );
    expect(insecure.status).toBe(400);
    expect(await insecure.json()).toEqual({ error: 'validation' });
    expect(deps.readLearnerState).not.toHaveBeenCalled();
  });

  it('allows HTTP only on bounded development loopback', async () => {
    const deps = dependencies();
    const response = await handleWebLearnerStateGet(
      get('http://localhost:3000/api/learner/state', {
        headers: { 'x-test-subject': '00000000-0000-4000-8000-000000000000' },
      }),
      deps,
      readSubject,
      { development: true },
    );
    expect(response.status).toBe(200);
  });

  it('fails closed with typed no-store serverUnavailable on database/service failure', async () => {
    const deps = dependencies({
      readLearnerState: vi.fn(async () => {
        throw new Error('database details must not escape');
      }),
    });
    const response = await handleWebLearnerStateGet(
      get('https://learnbox.example/api/learner/state', {
        headers: { 'x-test-subject': '00000000-0000-4000-8000-000000000000' },
      }),
      deps,
      readSubject,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });
});
