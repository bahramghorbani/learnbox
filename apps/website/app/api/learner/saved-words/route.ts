import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
}

// A German headword as the dictionary stores it: letters (incl. umlauts/ß), space, hyphen.
const validLemma = (w: unknown): w is string =>
  typeof w === 'string' && w.length >= 1 && w.length <= 80 && /^[\p{L}\s-]+$/u.test(w);

/**
 * The learner's saved dictionary words (بخش واژگان), independent of any pack. Guest saves on the
 * public dictionary site live only in that site's localStorage; this is where they land once the
 * learner has an account — either added one at a time from the app, or imported in bulk when a
 * `?savedWords=` link from the public site reaches a signed-in session (see LearnerHome.tsx).
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }
  const pool = getPool();
  try {
    const result = await pool.query(
      'SELECT lemma FROM dictionary_saved_words WHERE user_id = $1 ORDER BY created_at DESC',
      [session.subject],
    );
    return Response.json(
      { lemmas: result.rows.map((r: { lemma: string }) => r.lemma) },
      { headers: privateHeaders },
    );
  } catch (err) {
    console.error('[saved-words] GET error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool.end();
  }
}

export async function POST(request: Request): Promise<Response> {
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: privateHeaders });
  }
  const raw = body as { lemma?: unknown; lemmas?: unknown };
  // One word (the save button) or a bulk import (the transfer from the public site), same shape.
  const words = [
    ...(raw.lemma !== undefined ? [raw.lemma] : []),
    ...(Array.isArray(raw.lemmas) ? raw.lemmas : []),
  ]
    .filter(validLemma)
    .slice(0, 200);
  if (!words.length) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: privateHeaders });
  }
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO dictionary_saved_words (user_id, lemma)
       SELECT $1, w FROM unnest($2::text[]) AS w
       ON CONFLICT (user_id, lemma) DO NOTHING`,
      [session.subject, words],
    );
    return Response.json({ added: words.length }, { headers: privateHeaders });
  } catch (err) {
    console.error('[saved-words] POST error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool.end();
  }
}
