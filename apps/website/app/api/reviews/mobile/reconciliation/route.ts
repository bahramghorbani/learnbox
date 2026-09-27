import { handleMobileReviewGet } from '../../../../../lib/mobile-review-http';
import { mobileReviewReconciliationDependenciesFromEnvironment } from '../../../../../lib/mobile-review-runtime';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const dependencies = mobileReviewReconciliationDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleMobileReviewGet(request, dependencies);
}
