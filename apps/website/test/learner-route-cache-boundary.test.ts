import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as today } from '../app/api/learner/today/route';
import { GET as words } from '../app/api/learner/words/route';
import { GET as profileStats } from '../app/api/learner/profile/stats/route';
import { PATCH as profileUpdate } from '../app/api/learner/profile/update/route';

const ORIGIN = 'https://preview.learnbox.test';

const request = () =>
  new Request(`${ORIGIN}/api/learner`, {
    headers: { cookie: 'learnbox_alpha_session=invalid' },
  });

// LB-B29: a mutation must first pass the shared guard, so the PATCH case is a well-formed
// same-origin JSON request that carries an invalid session — that is the path under test.
const mutationRequest = () =>
  new Request(`${ORIGIN}/api/learner/profile/update`, {
    method: 'PATCH',
    headers: {
      cookie: 'learnbox_alpha_session=invalid',
      'content-type': 'application/json',
      origin: ORIGIN,
    },
    body: '{}',
  });

afterEach(() => vi.unstubAllEnvs());

describe('learner data cache boundary', () => {
  it.each([
    ['Today', today, request],
    ['Words', words, request],
    ['Profile stats', profileStats, request],
    ['Profile update', profileUpdate, mutationRequest],
  ])(
    '%s denies an invalid session without a public cache policy',
    async (_name, handler, build) => {
      vi.stubEnv('LEARNBOX_SESSION_SECRET', 'staging-cache-boundary-secret-at-least-32-bytes');
      vi.stubEnv('LEARNBOX_PUBLIC_APP_ORIGIN', ORIGIN);
      const response = await handler(build());
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(response.headers.get('cache-control')).not.toContain('public');
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    },
  );
});

describe('learner data cache boundary — guard rejection (LB-B29)', () => {
  it('a rejected mutation is also never publicly cacheable', async () => {
    vi.stubEnv('LEARNBOX_PUBLIC_APP_ORIGIN', ORIGIN);
    const response = await profileUpdate(
      new Request(`${ORIGIN}/api/learner/profile/update`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cache-control')).not.toContain('public');
  });
});
