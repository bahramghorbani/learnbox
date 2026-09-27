import { handleWebLearnerStateGet } from '../../../../lib/learner-state-web-http';
import { webLearnerStateDependenciesFromEnvironment } from '../../../../lib/learner-state-web-runtime';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const dependencies = webLearnerStateDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleWebLearnerStateGet(
    request,
    dependencies,
    (r) => readLearnerSession(r)?.subject ?? null,
  );
}
