import { handleWebLearnerProfileGet } from '../../../../lib/learner-profile-web-http';
import { webLearnerProfileDependenciesFromEnvironment } from '../../../../lib/learner-profile-web-runtime';
import { readLearnerSession } from '../../../../lib/server-session';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const dependencies = webLearnerProfileDependenciesFromEnvironment();
  if (!dependencies)
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  return handleWebLearnerProfileGet(
    request,
    dependencies,
    (r) => readLearnerSession(r)?.subject ?? null,
  );
}
