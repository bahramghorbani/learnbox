import { handleWebLearnerStateGet } from '../../../../lib/learner-state-web-http';
import { webLearnerStateDependenciesFromEnvironment } from '../../../../lib/learner-state-web-runtime';
import { authenticateLearner } from '../../../../lib/learner-auth';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  const dependencies = webLearnerStateDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleWebLearnerStateGet(request, dependencies, () => session?.subject ?? null);
}
