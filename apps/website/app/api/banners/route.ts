import { Pool } from 'pg';

import { authenticateLearner } from '../../../lib/learner-auth';
import { learnerSlidesSql, toDeliveredSlides } from '../../../lib/learner-slider';
import { requireVerifiedDatabaseTls } from '../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/banners — the learner's slider.
 *
 * M4.3: this is the canonical read path for whatever the Admin authored in the Slider Manager, so
 * an Admin edit becomes visible to learners with no code change. The rule itself — active, in its
 * scheduling window, a destination this product will navigate to, deterministic order, at most
 * three — lives in `lib/learner-slider.ts`; this route authenticates, runs it, and fails safe.
 *
 * Authentication comes first, before the database is reached, because a slide is product content:
 * an anonymous caller gets 401 and nothing else. Every failure below answers with an empty slider
 * instead of an error, so Today keeps working when the slider cannot be read — a carousel is the
 * least important thing on that screen.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await authenticateLearner(request)))
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  const url = process.env.DATABASE_URL;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!url) return Response.json({ slides: [] }, { headers });
  const pool = new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
  try {
    const result = await pool.query(learnerSlidesSql);
    return Response.json({ slides: toDeliveredSlides(result.rows) }, { headers });
  } catch {
    return Response.json({ slides: [] }, { headers });
  } finally {
    await pool.end();
  }
}
