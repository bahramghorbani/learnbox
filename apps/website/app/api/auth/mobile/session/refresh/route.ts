import { handleMobileSessionRefresh } from '../../../../../../lib/mobile-auth-http';
import { mobileAuthHttpDependenciesFromEnvironment } from '../../../../../../lib/mobile-auth-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const dependencies = mobileAuthHttpDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleMobileSessionRefresh(request, dependencies);
}
