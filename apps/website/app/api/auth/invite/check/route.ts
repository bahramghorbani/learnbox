import { handleInviteCheck } from '../../../../../lib/alpha-http';
import { inviteHttpDependenciesFromEnvironment } from '../../../../../lib/alpha-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const dependencies = inviteHttpDependenciesFromEnvironment();
  if (!dependencies) {
    return new Response('Not found', { status: 404 });
  }
  return handleInviteCheck(request, dependencies);
}
