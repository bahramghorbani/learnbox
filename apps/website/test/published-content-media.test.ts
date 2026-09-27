import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLearnerSession } from '../lib/server-session';

const mocked = vi.hoisted(() => ({ published: vi.fn(), read: vi.fn() }));
vi.mock('../lib/published-start-card', () => ({ isPublishedStartContentId: mocked.published }));
vi.mock('node:fs/promises', () => ({ readFile: mocked.read }));
import { GET } from '../app/api/content-media/[contentId]/[kind]/route';

const original = process.env.LEARNBOX_SESSION_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.LEARNBOX_SESSION_SECRET;
  else process.env.LEARNBOX_SESSION_SECRET = original;
  vi.resetAllMocks();
});

function request() {
  process.env.LEARNBOX_SESSION_SECRET = 'test-only-secret-longer-than-thirty-two-characters';
  const token = createLearnerSession('release_fixture');
  return new Request('https://example.invalid/api/content-media/start-a1-haus/image', {
    headers: { cookie: `learnbox_alpha_session=${token}` },
  });
}
function context(kind: string, contentId = 'start-a1-haus') {
  return { params: Promise.resolve({ contentId, kind }) };
}

describe('published content media authorization', () => {
  it.each(['image', 'word-audio', 'sentence-audio'])(
    'serves %s only with a signed session and published card',
    async (kind) => {
      mocked.published.mockResolvedValue(true);
      mocked.read.mockResolvedValue(Buffer.from('private test fixture'));
      const response = await GET(request(), context(kind));
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toBe('private test fixture');
    },
  );

  it('rejects an unpublished card before reading any file', async () => {
    mocked.published.mockResolvedValue(false);
    expect((await GET(request(), context('image', 'start-a1-unpublished'))).status).toBe(404);
    expect(mocked.read).not.toHaveBeenCalled();
  });

  it('fails closed if the publication database is unavailable', async () => {
    mocked.published.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request(), context('image'));
    expect(response.status).toBe(503);
    expect(mocked.read).not.toHaveBeenCalled();
  });
});
