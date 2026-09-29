import { handleWebLearnerProfileGet } from '../../../../lib/learner-profile-web-http';
import { webLearnerProfileDependenciesFromEnvironment } from '../../../../lib/learner-profile-web-runtime';
import { authenticateLearner } from '../../../../lib/learner-auth';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const dependencies = webLearnerProfileDependenciesFromEnvironment();
  if (!dependencies)
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  return handleWebLearnerProfileGet(request, dependencies, () => session?.subject ?? null);
}
