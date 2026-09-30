import { Pool } from 'pg';
import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import { applyProfileUpdate, parseProfileUpdate } from '../../../../../lib/learner-profile-fields';
import { requireVerifiedDatabaseTls } from '../../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url) });
}

export async function PATCH(request: Request): Promise<Response> {
  // LB-B29: same-origin JSON only, decided before the session is read.
  const rejected = guardMutation(request, { method: 'PATCH' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  let pool: Pool | undefined;
  try {
    const body = (await request.json()) as Record<string, unknown> | null;

    // Legacy contract kept exactly: a body that is ONLY `firstName` must be a non-empty name
    // (onboarding relies on this). Any richer body goes through the LB-B28a parser, where a
    // blank/null value means "clear this optional field".
    const keys = body && typeof body === 'object' ? Object.keys(body) : [];
    if (keys.length === 1 && keys[0] === 'firstName') {
      const legacy = typeof body?.firstName === 'string' ? body.firstName.trim().slice(0, 50) : '';
      if (!legacy) {
        return Response.json({ error: 'invalid_name' }, { status: 400, headers: privateHeaders });
      }
    }

    const parsed = parseProfileUpdate(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400, headers: privateHeaders });
    }

    pool = getPool();
    const profile = await applyProfileUpdate(pool, userId, parsed.update);
    if (!profile) {
      return Response.json({ error: 'user_not_found' }, { status: 404, headers: privateHeaders });
    }

    return Response.json(
      { ok: true, firstName: profile.firstName, profile },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error('[learner/profile/update] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool?.end();
  }
}
