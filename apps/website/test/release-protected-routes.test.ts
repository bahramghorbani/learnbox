import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as cards } from '../app/api/learner/cards/route';
import { GET as banners } from '../app/api/banners/route';
import { GET as bannerImage } from '../app/api/banners/[id]/image/route';
import { GET as debugWords } from '../app/api/debug/words/route';
import { GET as legacyInvite } from '../app/api/owner-issue-invite/route';
import { GET as storePacks } from '../app/api/store/packs/route';
import { GET as storeMyPacks } from '../app/api/store/my-packs/route';
import { POST as storeActivate } from '../app/api/store/activate/route';
import { POST as purchaseInitiate } from '../app/api/store/purchase/initiate/route';
import { GET as purchaseStatus } from '../app/api/store/purchase/status/route';
import { GET as purchaseCallback } from '../app/api/store/purchase/callback/route';
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

  it('denies Admin-uploaded slider image bytes to an anonymous caller (M4.3)', async () => {
    const response = await bannerImage(request(), {
      params: Promise.resolve({ id: 'banner_a1b2c3d4' }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).not.toContain('image');
  });

  it('cannot expose a card via historical debug routes or mint an invite anonymously', async () => {
    expect((await debugWords()).status).toBe(404);
    expect((await legacyInvite()).status).toBe(404);
    expect((await resetProgress()).status).toBe(404);
  });

  // M2.3 made activate real. It is authenticated and same-origin, not absent: a cross-site post is
  // rejected before authentication, and a same-origin anonymous post still gets nothing.
  it('denies free pack activation to anonymous and cross-origin callers', async () => {
    const crossSite = await storeActivate(
      new Request('https://app.learnboxapp.com/api/store/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ packId: 'learnbox_start_a1_essentials' }),
      }),
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: 'request_rejected' });

    vi.stubEnv('LEARNBOX_PUBLIC_APP_ORIGIN', 'https://app.learnboxapp.com');
    const anonymous = await storeActivate(
      new Request('https://app.learnboxapp.com/api/store/activate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://app.learnboxapp.com',
        },
        body: JSON.stringify({ packId: 'learnbox_start_a1_essentials' }),
      }),
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('cache-control')).toContain('no-store');
    expect(await anonymous.json()).toEqual({ error: 'unauthorized' });
  });

  // M2.4 added the paid flow. Starting a purchase is authenticated AND same-origin: a cross-site
  // post is refused before authentication, and an anonymous same-origin post gets nothing.
  it('denies paid purchase initiation to anonymous and cross-origin callers', async () => {
    const crossSite = await purchaseInitiate(
      new Request('https://app.learnboxapp.com/api/store/purchase/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ packId: 'paid-pack' }),
      }),
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: 'request_rejected' });

    vi.stubEnv('LEARNBOX_PUBLIC_APP_ORIGIN', 'https://app.learnboxapp.com');
    const anonymous = await purchaseInitiate(
      new Request('https://app.learnboxapp.com/api/store/purchase/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://app.learnboxapp.com' },
        body: JSON.stringify({ packId: 'paid-pack' }),
      }),
    );
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ error: 'unauthorized' });
  });

  it('denies a payment receipt without a learner cookie', async () => {
    const response = await purchaseStatus(
      new Request('https://app.learnboxapp.com/api/store/purchase/status?id=x'),
    );
    expect(response.status).toBe(401);
    // No receipt data may reach an anonymous caller, not even an empty shell.
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  // The gateway callback is deliberately unauthenticated — the provider redirects the learner's
  // browser to it. What matters is that it grants nothing and leaks nothing when payment is not
  // configured: it must redirect, never return a payload.
  it('never returns a payload from the unconfigured payment callback', async () => {
    const response = await purchaseCallback(
      new Request('https://app.learnboxapp.com/api/store/purchase/callback?Authority=A1&Status=OK'),
    );
    expect(response.status).toBe(303);
    expect(await response.text()).toBe('');
    expect(response.headers.get('location')).toContain('purchase=unavailable');
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
