import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLearnerSession } from '../lib/server-session';

const mocked = vi.hoisted(() => ({ published: vi.fn(), read: vi.fn(), stored: vi.fn() }));
vi.mock('../lib/published-start-card', () => ({
  canLearnerAccessStartContentId: mocked.published,
}));
vi.mock('../lib/published-card-media', () => ({ readPublishedCardMedia: mocked.stored }));
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
      // Each Starter filename is versioned (-v1/-v2) and each Admin object key carries a fresh
      // random UUID, so a given URL's bytes never change once served: safe for the browser to
      // cache for a year. Auth and publication are still re-checked on every request above.
      expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
      expect(await response.text()).toBe('private test fixture');
    },
  );

  it('rejects an unpublished card before reading any file', async () => {
    mocked.published.mockResolvedValue(false);
    expect((await GET(request(), context('image', 'start-a1-unpublished'))).status).toBe(404);
    expect(mocked.read).not.toHaveBeenCalled();
  });

  it('serves an Admin-pack card from its pinned database media after the same access check', async () => {
    mocked.published.mockResolvedValue(true);
    mocked.read.mockRejectedValue(new Error('ENOENT'));
    mocked.stored.mockResolvedValue({ mediaType: 'audio/mpeg', bytes: Buffer.from('mp3') });
    const response = await GET(request(), context('word-audio', 'studium-b1-hoersaal'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(mocked.stored).toHaveBeenCalledWith('studium-b1-hoersaal', 'word_audio');
  });

  it('serves a WebP-stored Admin-pack image with the correct content type', async () => {
    mocked.published.mockResolvedValue(true);
    mocked.read.mockRejectedValue(new Error('ENOENT'));
    mocked.stored.mockResolvedValue({
      mediaType: 'image/webp',
      bytes: Buffer.from('RIFF....WEBP'),
    });
    const response = await GET(request(), context('image', 'studium-b1-hoersaal'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  });

  it('never reads stored media for a learner without access to the pack', async () => {
    mocked.published.mockResolvedValue(false);
    expect((await GET(request(), context('image', 'studium-b1-hoersaal'))).status).toBe(404);
    expect(mocked.stored).not.toHaveBeenCalled();
  });

  it('returns 404 when no file and no pinned media exist', async () => {
    mocked.published.mockResolvedValue(true);
    mocked.read.mockRejectedValue(new Error('ENOENT'));
    mocked.stored.mockResolvedValue(null);
    expect((await GET(request(), context('image', 'studium-b1-hoersaal'))).status).toBe(404);
  });

  it('fails closed if the publication database is unavailable', async () => {
    mocked.published.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request(), context('image'));
    expect(response.status).toBe(503);
    expect(mocked.read).not.toHaveBeenCalled();
  });
});
