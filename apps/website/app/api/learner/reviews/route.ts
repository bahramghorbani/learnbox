import { handleWebReviewBatchPost } from '../../../../lib/learner-review-web-http';
import { webReviewDependenciesFromEnvironment } from '../../../../lib/learner-review-web-runtime';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { guardMutation } from '../../../../lib/mutation-guard';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  // LB-B29: same-origin JSON only, decided before the session is read.
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;

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
