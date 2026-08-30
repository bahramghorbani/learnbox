import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/learner/state/route';
import { readWebLearnerStateRuntimeConfig } from '../lib/learner-state-web-runtime';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

describe('web learner state runtime', () => {
  it('fails closed unless the explicit flag and complete server config are enabled', () => {
    const complete = {
      WEB_LEARNER_STATE_ENABLED: 'true',
      DATABASE_URL: 'postgresql://learnbox:***@example.test/learnbox?sslmode=require',
      LEARNBOX_SESSION_SECRET: 'session-secret-that-is-at-least-thirty-two-bytes',
    };
    expect(
      readWebLearnerStateRuntimeConfig({ ...complete, WEB_LEARNER_STATE_ENABLED: 'false' }),
    ).toBeNull();
    expect(
      readWebLearnerStateRuntimeConfig({ ...complete, WEB_LEARNER_STATE_ENABLED: undefined }),
    ).toBeNull();
    expect(readWebLearnerStateRuntimeConfig({ ...complete, DATABASE_URL: undefined })).toBeNull();
    expect(
      readWebLearnerStateRuntimeConfig({ ...complete, LEARNBOX_SESSION_SECRET: '' }),
    ).toBeNull();
    expect(
      readWebLearnerStateRuntimeConfig({ ...complete, LEARNBOX_SESSION_SECRET: 'too-short' }),
    ).toBeNull();
    expect(readWebLearnerStateRuntimeConfig(complete)).toEqual({
      databaseUrl: complete.DATABASE_URL,
      sessionSecret: complete.LEARNBOX_SESSION_SECRET,
    });
  });
});

describe('disabled web learner state route', () => {
  it('returns generic no-store unavailability for GET without cookies and never sets a cookie', async () => {
    process.env.WEB_LEARNER_STATE_ENABLED = 'false';
    const response = await GET(request('https://learnbox.example/api/learner/state'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });
});
