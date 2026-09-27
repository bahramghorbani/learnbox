import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as today } from '../app/api/learner/today/route';
import { GET as words } from '../app/api/learner/words/route';
import { GET as profileStats } from '../app/api/learner/profile/stats/route';
import { PATCH as profileUpdate } from '../app/api/learner/profile/update/route';

const request = () =>
  new Request('https://preview.learnbox.test/api/learner', {
    headers: { cookie: 'learnbox_alpha_session=invalid' },
  });

afterEach(() => vi.unstubAllEnvs());

describe('learner data cache boundary', () => {
  it.each([
    ['Today', today],
    ['Words', words],
    ['Profile stats', profileStats],
    ['Profile update', profileUpdate],
  ])('%s denies an invalid session without a public cache policy', async (_name, handler) => {
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'staging-cache-boundary-secret-at-least-32-bytes');
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('cache-control')).not.toContain('public');
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
});
