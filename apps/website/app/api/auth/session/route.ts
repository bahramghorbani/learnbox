import { authenticateLearner, withSessionRenewal } from '../../../../lib/learner-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/session — returns { authenticated: true, userId } or { authenticated: false } */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (session) {
    // App load is the natural renewal point: a learner who opens the app is by
    // definition active, so their inactivity window slides forward (LB-B26).
    return withSessionRenewal(
      session,
      Response.json(
        { authenticated: true, userId: session.subject },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      ),
    );
  }
  return Response.json(
    { authenticated: false },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}
