import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

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

/** Removes one of the learner's saved dictionary words (بخش واژگان). Split from the sibling
 * GET/POST route so each mutating route file declares exactly one method (LB-B29 inventory). */
export async function DELETE(request: Request): Promise<Response> {
  const rejected = guardMutation(request, { method: 'DELETE' });
  if (rejected) return rejected;
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }
  const lemma = new URL(request.url).searchParams.get('lemma');
  if (!validLemma(lemma)) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: privateHeaders });
  }
  const pool = getPool();
  try {
    await pool.query('DELETE FROM dictionary_saved_words WHERE user_id = $1 AND lemma = $2', [
      session.subject,
      lemma,
    ]);
    return Response.json({ removed: true }, { headers: privateHeaders });
  } catch (err) {
    console.error('[saved-words] DELETE error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool.end();
  }
}
