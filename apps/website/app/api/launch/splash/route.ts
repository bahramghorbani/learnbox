import { launchSplashRouteFromEnvironment } from '../../../../lib/launch-splash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const handler = launchSplashRouteFromEnvironment();
  if (!handler) return new Response('Not found', { status: 404 });
  return handler();
}
