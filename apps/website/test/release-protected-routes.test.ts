import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as cards } from '../app/api/learner/cards/route';
import { GET as banners } from '../app/api/banners/route';
import { GET as debugWords } from '../app/api/debug/words/route';
import { GET as legacyInvite } from '../app/api/owner-issue-invite/route';
import { GET as storePacks } from '../app/api/store/packs/route';
import { GET as storeMyPacks } from '../app/api/store/my-packs/route';
import { POST as storeActivate } from '../app/api/store/activate/route';
import { POST as resetProgress } from '../app/api/learner/reset-progress/route';
import { GET as localMedia } from '../app/api/local-preview-media/[contentId]/[kind]/route';
import { GET as contentMedia } from '../app/api/content-media/[contentId]/[kind]/route';
import { createLearnerSession } from '../lib/server-session';

const request = () => new Request('https://app.learnboxapp.com/');
const mediaContext = { params: Promise.resolve({ contentId: 'start-a1-haus', kind: 'image' }) };

afterEach(() => vi.unstubAllEnvs());

describe('release private-content boundary', () => {
  it('denies published card faces and banners before any DB access without a learner cookie', async () => {
    expect((await cards(request())).status).toBe(401);
    expect((await banners(request())).status).toBe(401);
  });

  it('cannot expose a card via historical debug routes or mint an invite anonymously', async () => {
    expect((await debugWords()).status).toBe(404);
    expect((await legacyInvite()).status).toBe(404);
    expect((await storeActivate()).status).toBe(404);
    expect((await resetProgress()).status).toBe(404);
  });

  // M2.2 made the two Store read endpoints real. They are authenticated, not absent: anonymous
  // callers must still get a non-success response and zero payload.
  it('denies the real Store read endpoints without a learner cookie', async () => {
    for (const route of [storePacks, storeMyPacks]) {
      const response = await route(request());
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('reports a missing database as unavailable rather than public on the Store endpoints', async () => {
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'release-boundary-secret-at-least-32-bytes');
    vi.stubEnv('DATABASE_URL', '');
    const valid = new Request('https://app.learnboxapp.com/', {
      headers: { cookie: `learnbox_alpha_session=${createLearnerSession('learner-id')}` },
    });
    for (const route of [storePacks, storeMyPacks]) {
      expect((await route(valid)).status).toBe(503);
    }
  });

  it.each(['image', 'word-audio', 'sentence-audio'])('%s media denies no session', async (kind) => {
    const context = { params: Promise.resolve({ contentId: 'start-a1-haus', kind }) };
    expect((await contentMedia(request(), context)).status).toBe(401);
    vi.stubEnv('NODE_ENV', 'development');
    expect((await localMedia(request(), context)).status).toBe(401);
  });

  it('denies an invalid cookie without touching the content store', async () => {
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'release-boundary-secret-at-least-32-bytes');
    const bad = new Request('https://app.learnboxapp.com/', {
      headers: { cookie: 'learnbox_alpha_session=invalid' },
    });
    expect((await cards(bad)).status).toBe(401);
    expect((await contentMedia(bad, mediaContext)).status).toBe(401);
  });

  it('authenticates the exact signed learner session; missing DB fails unavailable, not public', async () => {
    vi.stubEnv('LEARNBOX_SESSION_SECRET', 'release-boundary-secret-at-least-32-bytes');
    vi.stubEnv('DATABASE_URL', '');
    const valid = new Request('https://app.learnboxapp.com/', {
      headers: { cookie: `learnbox_alpha_session=${createLearnerSession('learner-id')}` },
    });
    const response = await cards(valid);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
