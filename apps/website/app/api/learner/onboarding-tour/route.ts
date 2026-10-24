import { Pool } from 'pg';
import { authenticateLearner as getLearnerSession } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

const lastTourSlide = 4; // 5 slides, 0-indexed

function pool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
}

/** First-login onboarding tour (5 slides): current seen/resume state for this account. */
export async function GET(request: Request): Promise<Response> {
  const session = await getLearnerSession(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  const db = pool();
  try {
    const { rows } = await db.query<{
      onboarding_tour_seen_at: string | null;
      onboarding_tour_slide: number;
    }>('SELECT onboarding_tour_seen_at, onboarding_tour_slide FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    }
    return Response.json(
      { seen: rows[0].onboarding_tour_seen_at !== null, slide: rows[0].onboarding_tour_slide },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error('[learner/onboarding-tour] GET failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await db.end();
  }
}

/**
 * Body `{ slide }` records where the learner is (so a half-finished tour resumes there).
 * Body `{ done: true }` marks the tour seen for good; it is never shown again.
 */
export async function POST(request: Request): Promise<Response> {
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await getLearnerSession(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let body: { slide?: unknown; done?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400, headers: privateHeaders });
  }

  const done = body.done === true;
  const slide = Number.isInteger(body.slide)
    ? Math.min(Math.max(body.slide as number, 0), lastTourSlide)
    : 0;

  const db = pool();
  try {
    if (done) {
      await db.query(
        'UPDATE users SET onboarding_tour_seen_at = now(), onboarding_tour_slide = $2 WHERE id = $1',
        [userId, lastTourSlide],
      );
    } else {
      await db.query('UPDATE users SET onboarding_tour_slide = $2 WHERE id = $1', [userId, slide]);
    }
    return new Response(null, { status: 204, headers: privateHeaders });
  } catch (error) {
    console.error('[learner/onboarding-tour] POST failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await db.end();
  }
}
