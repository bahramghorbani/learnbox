import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — returns { authenticated: true, userId } or { authenticated: false } */
export async function GET(request: Request): Promise<Response> {
  const session = readLearnerSession(request);
  if (session) {
    return Response.json(
      { authenticated: true, userId: session.subject },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
  return Response.json(
    { authenticated: false },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
