import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 4 / Milestone 4.3 — the HTTP contract of the two learner slider routes.
 *
 * The delivery RULE and the real image bytes are proven against a real Postgres driven by the real
 * Admin store in `m4.3-learner-slider-db.test.ts`. What is proven here is the envelope around it,
 * which no database can show: the status codes, the cache and content-type headers, that
 * authentication happens before the database is touched at all, that the slide id travels as a
 * bound parameter rather than inside SQL, and that an unavailable database degrades into an empty
 * slider instead of an error on the learner's home screen.
 *
 * `pg` is mocked on purpose — the claim under test is the route, not the query.
 */

const query = vi.fn();
const end = vi.fn(async () => undefined);
const poolConstructor = vi.fn();

vi.mock('pg', () => ({
  Pool: class {
    constructor(config: unknown) {
      poolConstructor(config);
    }
    query = query;
    end = end;
    on = vi.fn();
  },
}));

import { createLearnerSession } from '../lib/server-session';
import { GET as slides } from '../app/api/banners/route';
import { GET as slideImage } from '../app/api/banners/[id]/image/route';
import { learnerSlideImageSql, learnerSlidesSql } from '../lib/learner-slider';

const secret = 'test-secret-long-enough-for-hmac-operations-ok';
const imageBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x07, 0x08, 0x09]);

function request(options: { authenticated?: boolean; path?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.authenticated !== false) {
    headers.cookie = `learnbox_alpha_session=${createLearnerSession('learner-one')}`;
  }
  return new Request(`https://app.learnboxapp.com${options.path ?? '/api/banners'}`, { headers });
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  query.mockReset();
  end.mockClear();
  poolConstructor.mockClear();
  vi.stubEnv('LEARNBOX_SESSION_SECRET', secret);
  vi.stubEnv('DATABASE_URL', 'postgresql://learner:pw@db.example.com/learnbox');
  vi.stubEnv('NODE_ENV', 'test');
  // Keep the image route's shared pool out of the next test's assertions.
  delete (globalThis as { learnboxSliderImagePool?: unknown }).learnboxSliderImagePool;
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { learnboxSliderImagePool?: unknown }).learnboxSliderImagePool;
});

describe('M4.3 — GET /api/banners', () => {
  it('denies an anonymous caller before any database access', async () => {
    const response = await slides(request({ authenticated: false }));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(poolConstructor).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('runs the canonical learner rule and answers with the delivered slides only', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'banner_a1b2c3d4',
          title: 'فروشگاه',
          description: 'بسته‌های تازه',
          background_color: '#102030',
          link_type: 'screen',
          link_url: 'store',
          has_image: true,
        },
      ],
    });

    const response = await slides(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(query).toHaveBeenCalledWith(learnerSlidesSql);
    expect(await response.json()).toEqual({
      slides: [
        {
          id: 'banner_a1b2c3d4',
          title: 'فروشگاه',
          description: 'بسته‌های تازه',
          backgroundColor: '#102030',
          destination: { kind: 'screen', screen: 'store' },
          hasImage: true,
        },
      ],
    });
  });

  it('never lets image bytes or internal columns ride along in the payload', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'banner_a1b2c3d4',
          title: 'با تصویر',
          description: null,
          background_color: null,
          link_type: 'screen',
          link_url: 'today',
          has_image: true,
          // A future query, or a careless `SELECT *`, could hand these to the mapper.
          image_data: imageBytes,
          image_url: 'https://cdn.example.com/legacy.png',
          link_target: 'internal-note',
          is_active: true,
          sort_order: 3,
          starts_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const body = await (await slides(request())).text();
    expect(body).not.toContain('cdn.example.com');
    expect(body).not.toContain('internal-note');
    expect(body).not.toContain('image_data');
    expect(body).not.toContain('sort_order');
    expect(body).not.toContain('starts_at');
  });

  it('keeps Today working when the slider cannot be read', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    const response = await slides(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slides: [] });
    expect(end).toHaveBeenCalled();
  });

  it('answers with an empty slider when no database is configured', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const response = await slides(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slides: [] });
    expect(poolConstructor).not.toHaveBeenCalled();
  });
});

describe('M4.3 — GET /api/banners/:id/image', () => {
  const path = '/api/banners/banner_a1b2c3d4/image';

  it('denies an anonymous caller a byte, before any database access', async () => {
    const response = await slideImage(
      request({ authenticated: false, path }),
      context('banner_a1b2c3d4'),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).not.toContain('image');
    expect(poolConstructor).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('delivers the stored bytes to an authenticated learner as private, no-store WebP', async () => {
    query.mockResolvedValue({ rows: [{ image_data: imageBytes }] });

    const response = await slideImage(request({ path }), context('banner_a1b2c3d4'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(Buffer.compare(Buffer.from(await response.arrayBuffer()), imageBytes)).toBe(0);
  });

  it('asks for the image with the same delivery rule as the slide, with a bound id', async () => {
    query.mockResolvedValue({ rows: [{ image_data: imageBytes }] });
    await slideImage(request({ path }), context('banner_a1b2c3d4'));
    expect(query).toHaveBeenCalledWith(learnerSlideImageSql, ['banner_a1b2c3d4']);
    expect(learnerSlideImageSql).toContain('is_active = true');
    expect(learnerSlideImageSql).toContain('$1');
  });

  it('refuses an id shaped like anything other than a slide id', async () => {
    for (const id of ["banner' OR 1=1 --", '../../etc/passwd', 'a', '%20', 'x'.repeat(65)]) {
      const response = await slideImage(request({ path }), context(id));
      expect(response.status).toBe(404);
    }
    // The only queries a rejected id may produce are the session checks `authenticateLearner`
    // runs; the image itself is never looked up.
    expect(query).not.toHaveBeenCalledWith(learnerSlideImageSql, expect.anything());
  });

  it('denies a learner an operator has suspended, as every other learner route does', async () => {
    // `authenticateLearner` consults the revocation/suspension store (M3.1) on every request.
    query.mockResolvedValue({ rows: [{ blocked: true }] });
    const response = await slideImage(request({ path }), context('banner_a1b2c3d4'));
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalledWith(learnerSlideImageSql, expect.anything());
  });

  it('is a plain 404 when the slide is no longer delivered', async () => {
    query.mockResolvedValue({ rows: [] });
    const response = await slideImage(request({ path }), context('banner_a1b2c3d4'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('degrades to 503 rather than leaking a failure into the home screen', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    const response = await slideImage(request({ path }), context('banner_a1b2c3d4'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reuses one pool across repeated image requests instead of a connection per image', async () => {
    query.mockResolvedValue({ rows: [{ image_data: imageBytes }] });
    await slideImage(request({ path }), context('banner_a1b2c3d4'));
    const afterFirst = poolConstructor.mock.calls.length;
    await slideImage(request({ path }), context('banner_e5f6a7b8'));
    await slideImage(request({ path }), context('banner_c9d0e1f2'));
    // A learner opening Today fetches three images; the second and third must not each build a
    // new pool the way the legacy per-request pattern did.
    expect(poolConstructor.mock.calls.length).toBe(afterFirst);
  });
});
