import { describe, expect, it, vi } from 'vitest';

import {
  handleWebLearnerProfileGet,
  type WebLearnerProfileDependencies,
} from '../lib/learner-profile-web-http';

const subject = '2efaf676-84e4-45b1-8a13-50735a8df2c8';

function dependencies(): WebLearnerProfileDependencies {
  return { readLearnerProfile: vi.fn(async () => ({ maskedPhone: '0912***4567' })) };
}

describe('web learner profile HTTP boundary', () => {
  it('uses only cookie-derived subject and serializes only maskedPhone', async () => {
    const deps = dependencies();
    const response = await handleWebLearnerProfileGet(
      new Request('https://learnbox.example/api/learner/profile', {
        headers: { authorization: 'Bearer ignored' },
      }),
      deps,
      () => subject,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ maskedPhone: '0912***4567' });
    expect(deps.readLearnerProfile).toHaveBeenCalledWith(subject);
  });

  it('withholds identity for missing learner and server failure', async () => {
    const missing = await handleWebLearnerProfileGet(
      new Request('https://learnbox.example/api/learner/profile'),
      { readLearnerProfile: vi.fn(async () => null) },
      () => subject,
    );
    const failed = await handleWebLearnerProfileGet(
      new Request('https://learnbox.example/api/learner/profile'),
      {
        readLearnerProfile: vi.fn(async () => {
          throw new Error('db');
        }),
      },
      () => subject,
    );

    expect([missing.status, failed.status]).toEqual([401, 503]);
    expect(await missing.json()).toEqual({ error: 'identityUnavailable' });
    expect(await failed.json()).toEqual({ error: 'serverUnavailable' });
  });
});
