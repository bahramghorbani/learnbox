import { Pool } from 'pg';

import { authenticateLearner } from '../../../../../lib/learner-auth';
import {
  isSlideId,
  learnerSlideImageSql,
  slideImageMediaType,
} from '../../../../../lib/learner-slider';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The slider image bytes are kept in a shared pool rather than a per-request connection: a learner
 * opening Today fetches up to three of these at once, and the legacy one-pool-per-request pattern
 * would open and tear down a connection for each image on every visit.
 */
type SliderImageGlobal = typeof globalThis & {
  learnboxSliderImagePool?: { databaseUrl: string; pool: Pool };
};

function imagePool(databaseUrl: string) {
  const shared = globalThis as SliderImageGlobal;
  if (shared.learnboxSliderImagePool?.databaseUrl === databaseUrl) {
    return shared.learnboxSliderImagePool.pool;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  shared.learnboxSliderImagePool = { databaseUrl, pool };
  return pool;
}

/**
 * GET /api/banners/:id/image — the Admin-uploaded bytes of one slide image.
 *
 * The bytes live in `banners.image_data` (M4.2), which is why this route exists at all: a slide
 * image is owner-supplied content in the canonical database, never a public static file and never
 * a second storage system, so there is no path at which an anonymous request could pick it up.
 *
 * Three properties matter here:
 *   - authentication first, so an anonymous caller gets 401 and never a byte;
 *   - the SAME delivery rule as the slide itself, so retiring a slide in the Admin also stops its
 *     image — an id that is no longer delivered is simply 404, not a private object that lingers;
 *   - `private, no-store` with `nosniff` and a same-origin resource policy, so protected bytes are
 *     not cached by a proxy, a CDN or the service worker and cannot be embedded cross-origin.
 *
 * The content type is fixed rather than derived from the row: every slide image is normalized to
 * WebP by the Admin on the way in, so there is no stored media type to trust.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  if (!(await authenticateLearner(request))) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const { id } = await context.params;
  if (!isSlideId(id)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const pool = imagePool(requireVerifiedDatabaseTls(databaseUrl));
    const result = await pool.query(learnerSlideImageSql, [id]);
    const bytes = result.rows[0]?.image_data;
    if (!bytes) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(new Uint8Array(bytes as Buffer), {
      headers: {
        'Content-Type': slideImageMediaType,
        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // The carousel renders its colour fallback on a failed image, so an unavailable database must
    // not turn into a 500 on the learner's home screen.
    return new Response('Image unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
