import { handleWebReviewBatchPost } from '../../../../lib/learner-review-web-http';
import { webReviewDependenciesFromEnvironment } from '../../../../lib/learner-review-web-runtime';
import { authenticateLearner } from '../../../../lib/learner-auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const subject = (await authenticateLearner(request))?.subject;
  if (!subject)
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  if (request.headers.get('x-learnbox-review-owner') !== subject)
    return Response.json(
      { error: 'reviewOwnerMismatch' },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    );
  const dependencies = webReviewDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleWebReviewBatchPost(request, dependencies, () => subject);
}
