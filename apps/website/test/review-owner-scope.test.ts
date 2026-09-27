import { afterEach, expect, it } from 'vitest';
import { createLearnerSession } from '../lib/server-session';
import { POST } from '../app/api/learner/reviews/route';

const original = process.env.LEARNBOX_SESSION_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.LEARNBOX_SESSION_SECRET;
  else process.env.LEARNBOX_SESSION_SECRET = original;
});

it('rejects a review batch scoped to a different signed-in owner before DB access', async () => {
  process.env.LEARNBOX_SESSION_SECRET = 'test-only-review-scope-secret-long-enough';
  const cookie = createLearnerSession('account_a');
  const request = new Request('https://example.invalid/api/learner/reviews', {
    method: 'POST',
    headers: { cookie: `learnbox_alpha_session=${cookie}`, 'x-learnbox-review-owner': 'account_b' },
    body: JSON.stringify({ items: [] }),
  });
  const response = await POST(request);
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
