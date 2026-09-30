import { handleAccountDeletionPost } from '../../../../lib/account-deletion-http';
import { accountDeletionDependenciesFromEnvironment } from '../../../../lib/account-deletion-runtime';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';

export const runtime = 'nodejs';

/**
 * Learner-initiated account deletion (LB-B04).
 *
 * POST only: the boundary itself rejects other methods and cross-site requests, so no deletion can
 * be triggered by navigation, prefetch or a cross-origin form.
 */
export async function POST(request: Request): Promise<Response> {
  // LB-B29: same-origin JSON only, decided before the session is read.
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

  const session = await authenticateLearner(request);
  const dependencies = accountDeletionDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleAccountDeletionPost(request, dependencies, () => session?.subject ?? null);
}
