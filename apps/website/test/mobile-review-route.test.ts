import { afterEach, describe, expect, it } from 'vitest';

import { POST } from '../app/api/reviews/mobile/route';
import { readMobileReviewRuntimeConfig } from '../lib/mobile-review-runtime';
import { readLearnerStateRuntimeConfig } from '../../api/dist/learner-state/learner-state-runtime.js';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('mobile review runtime', () => {
  it('fails closed unless the explicit sync flag and complete server config are enabled', () => {
    const complete = {
      MOBILE_REVIEW_SYNC_ENABLED: 'true',
      DATABASE_URL: 'postgresql://learnbox:placeholder@example.test/learnbox?sslmode=require',
      LEARNBOX_MOBILE_SESSION_SECRET: 'session-secret-that-is-at-least-thirty-two-bytes',
    };
    expect(
      readMobileReviewRuntimeConfig({ ...complete, MOBILE_REVIEW_SYNC_ENABLED: 'false' }),
    ).toBeNull();
    expect(readMobileReviewRuntimeConfig({ ...complete, DATABASE_URL: undefined })).toBeNull();
    expect(readMobileReviewRuntimeConfig(complete)).toEqual({
      databaseUrl: complete.DATABASE_URL,
      sessionSecret: complete.LEARNBOX_MOBILE_SESSION_SECRET,
    });
  });
});

describe('disabled mobile review route', () => {
  it('returns generic no-store unavailability and never sets a cookie', async () => {
    process.env.MOBILE_REVIEW_SYNC_ENABLED = 'false';
    const response = await POST(
      new Request('https://learnbox.example/api/reviews/mobile', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });
});

describe('learner state runtime fails closed', () => {
  it('never exposes the learner state read unless its explicit flag and config are complete', () => {
    const complete = {
      LEARNER_STATE_ENABLED: 'true',
      DATABASE_URL: 'postgresql://learnbox:***@example.test/learnbox?sslmode=require',
      LEARNBOX_MOBILE_SESSION_SECRET: 'session-secret-that-is-at-least-thirty-two-bytes',
    };
    expect(
      readLearnerStateRuntimeConfig({ ...complete, LEARNER_STATE_ENABLED: 'false' }),
    ).toBeNull();
    expect(readLearnerStateRuntimeConfig({ ...complete, DATABASE_URL: undefined })).toBeNull();
    expect(
      readLearnerStateRuntimeConfig({ ...complete, LEARNER_STATE_ENABLED: undefined }),
    ).toBeNull();
    expect(readLearnerStateRuntimeConfig(complete)).toEqual({
      databaseUrl: complete.DATABASE_URL,
      sessionSecret: complete.LEARNBOX_MOBILE_SESSION_SECRET,
    });
  });
});
