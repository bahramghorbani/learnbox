import { handleMobileReviewPost } from '../../../../lib/mobile-review-http';
import { mobileReviewHttpDependenciesFromEnvironment } from '../../../../lib/mobile-review-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const dependencies = mobileReviewHttpDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'serverUnavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleMobileReviewPost(request, dependencies);
}
