import { Pool } from 'pg';
import { readLearnerSession } from '../../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url });
}

export async function PATCH(request: Request): Promise<Response> {
  const session = readLearnerSession(request);
  const userId = session?.subject ?? null;
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { firstName?: string };
    const firstName = body.firstName?.trim()?.substring(0, 50);
    if (!firstName) {
      return Response.json({ error: 'invalid_name' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query('UPDATE users SET first_name = $1 WHERE id = $2', [firstName, userId]);

    return Response.json({ ok: true, firstName });
  } catch (error) {
    console.error('[learner/profile/update] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
