import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../app/api/learner/profile/route';
import { readWebLearnerProfileRuntimeConfig } from '../lib/learner-profile-web-runtime';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('web learner profile route', () => {
  it('fails closed by default with no-store and no cookie mutation', async () => {
    expect(readWebLearnerProfileRuntimeConfig({})).toBeNull();
    const response = await GET(new Request('https://learnbox.example/api/learner/profile'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({ error: 'serverUnavailable' });
  });
});
