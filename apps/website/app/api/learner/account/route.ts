import { handleAccountDeletionPost } from '../../../../lib/account-deletion-http';
import { accountDeletionDependenciesFromEnvironment } from '../../../../lib/account-deletion-runtime';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';

/**
 * Learner-initiated account deletion (LB-B04).
 *
 * POST only: the boundary itself rejects other methods and cross-site requests, so no deletion can
 * be triggered by navigation, prefetch or a cross-origin form.
 */
export async function POST(request: Request): Promise<Response> {
  const dependencies = accountDeletionDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleAccountDeletionPost(
    request,
    dependencies,
    (r) => readLearnerSession(r)?.subject ?? null,
  );
}
