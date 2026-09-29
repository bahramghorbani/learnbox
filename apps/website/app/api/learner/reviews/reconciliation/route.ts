import { handleWebReviewReconciliationGet } from '../../../../../lib/learner-review-web-http';
import { webReviewDependenciesFromEnvironment } from '../../../../../lib/learner-review-web-runtime';
import { authenticateLearner } from '../../../../../lib/learner-auth';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const dependencies = webReviewDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleWebReviewReconciliationGet(request, dependencies, () => session?.subject ?? null);
}
