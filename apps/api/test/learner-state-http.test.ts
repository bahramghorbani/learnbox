import { describe, expect, it } from 'vitest';

import { handleLearnerStateGet } from '../src/learner-state/learner-state-http.js';
import type { LearnerStateHttpDependencies } from '../src/learner-state/learner-state-http.js';

const userId = '2efaf676-84e4-45b1-8a13-50735a8df2c8';

const dependencies: LearnerStateHttpDependencies = {
  verifyAccessToken(token: string) {
    return token === 'valid-token'
      ? { status: 'valid', claims: { sub: userId } }
      : { status: 'invalid' };
  },
  async readLearnerState() {
    return {
      schedules: [
        {
          cardId: '170b8a2a-7fa7-4e26-94ba-37e3a7fb65da',
          contentId: 'content-a',
          state: 'review',
          stabilityDays: 2,
          difficulty: 4.9,
          lapses: 0,
          dueAt: new Date('2026-07-25T12:00:00Z'),
        },
      ],
      plan: {
        mode: 'normal',
        reviewCardIds: ['170b8a2a-7fa7-4e26-94ba-37e3a7fb65da'],
        newCardIds: [],
        message: 'امروز یک قدم کوچک و پیوسته کافی است.',
      },
      reviewEventsCount: 3,
      reconciliationCursor: '42',
    };
  },
};

describe('GET learner state boundary (contract M1-D 12.3)', () => {
  it('requires a Bearer token and rejects anything else', async () => {
    const response = await handleLearnerStateGet(
      new Request('https://learnbox.example/api/learner/state', { method: 'GET' }),
      dependencies,
      { development: false },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalidToken' });
  });

  it('rejects a request without HTTPS outside bounded loopback', async () => {
    const response = await handleLearnerStateGet(
      new Request('http://learnbox.example/api/learner/state', {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      }),
      dependencies,
      { development: false },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'validation' });
  });

  it('returns the server-authoritative schedule snapshot with no-store caching', async () => {
    const response = await handleLearnerStateGet(
      new Request('https://learnbox.example/api/learner/state', {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      }),
      dependencies,
      { development: false },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    const body = await response.json();
    expect(body).toEqual({
      schedules: [
        {
          cardId: '170b8a2a-7fa7-4e26-94ba-37e3a7fb65da',
          contentId: 'content-a',
          state: 'review',
          stabilityDays: 2,
          difficulty: 4.9,
          lapses: 0,
          dueAt: '2026-07-25T12:00:00.000Z',
        },
      ],
      plan: {
        mode: 'normal',
        reviewCardIds: ['170b8a2a-7fa7-4e26-94ba-37e3a7fb65da'],
        newCardIds: [],
        message: 'امروز یک قدم کوچک و پیوسته کافی است.',
      },
      reviewEventsCount: 3,
      reconciliationCursor: '42',
    });
  });

  it('propagates a server fault as typed serverUnavailable', async () => {
    const failing: LearnerStateHttpDependencies = {
      ...dependencies,
      async readLearnerState() {
        throw new Error('database connection reset');
      },
    };
    const response = await handleLearnerStateGet(
      new Request('https://learnbox.example/api/learner/state', {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      }),
      failing,
      { development: false },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });

  it('rejects a non-GET method', async () => {
    const response = await handleLearnerStateGet(
      new Request('https://learnbox.example/api/learner/state', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
      }),
      dependencies,
      { development: false },
    );
    expect(response.status).toBe(400);
  });
});
