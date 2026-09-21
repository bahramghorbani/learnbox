import { handleWebReviewBatchPost } from '../../../../lib/learner-review-web-http';
import { webReviewDependenciesFromEnvironment } from '../../../../lib/learner-review-web-runtime';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const dependencies = webReviewDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleWebReviewBatchPost(
    request,
    dependencies,
    (candidate) => readLearnerSession(candidate)?.subject ?? null,
  );
}
