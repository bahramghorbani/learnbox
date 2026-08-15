import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as localPreviewMedia } from '../app/api/local-preview-media/[contentId]/[kind]/route';

// Issue #59: word audio must be the exact displayed German phrase, including
// the article (e.g. `das Haus`). The local-preview route must serve the V2
// clips (regenerated with the article), not the rejected V1 bare-lemma clips.
// The route is development-only (fail-closed elsewhere), so these tests set
// NODE_ENV via vi.stubEnv and restore it with vi.unstubAllEnvs.
afterEach(() => {
  vi.unstubAllEnvs();
});

async function fetchClip(kind: string) {
  return localPreviewMedia(new Request('http://localhost/'), {
    params: Promise.resolve({ contentId: 'start-a1-haus', kind }),
  });
}

describe('local-preview-media audio (Issue #59)', () => {
  it('serves the v2 word-audio clip for a bundled Start card', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await fetchClip('word-audio');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');

    const bytes = new Uint8Array(await response.arrayBuffer());
    // MP3 header: first three bytes are "ID3" (or 0xFF 0xFB for a bare frame).
    const isMp3 =
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    expect(isMp3).toBe(true);
  });

  it('serves the v2 sentence-audio clip for a bundled Start card', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await fetchClip('sentence-audio');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
  });

  it('still serves the image v1 for a bundled Start card', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await fetchClip('image');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('fails closed outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await fetchClip('word-audio');

    expect(response.status).toBe(404);
  });
});
